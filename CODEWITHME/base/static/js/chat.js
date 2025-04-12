let chatSocket;
let dataChannels = {};

export function initChat() {
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendMessage');
  
  if (!chatMessages || !chatInput || !sendButton) {
    console.error('Chat elements not found');
    return;
  }
  
  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  // Use the room ID from the page or a default
  const ROOM_ID = window.ROOM_ID || 'default-room';
  
  // Connect to WebSocket for chat
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  chatSocket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/chat/${ROOM_ID}/`);
  
  chatSocket.onopen = function() {
    console.log('Chat WebSocket connected');
    // Enable the chat input once connected
    chatInput.disabled = false;
    chatInput.placeholder = 'Type a message...';
  };
  
  chatSocket.onmessage = function(e) {
    console.log('Chat message received:', e.data);
    try {
      const data = JSON.parse(e.data);
      if (data.message) {
        addMessage(data.username, data.message, data.timestamp);
      }
    } catch (error) {
      console.error('Error parsing chat message:', error);
    }
  };
  
  chatSocket.onclose = function() {
    console.error('Chat socket closed unexpectedly');
    // Disable the chat input when disconnected
    chatInput.disabled = true;
    chatInput.placeholder = 'Chat disconnected...';
    
    // Try to reconnect after a delay
    setTimeout(() => initChat(), 5000);
  };
  
  chatSocket.onerror = function(error) {
    console.error('Chat WebSocket error:', error);
  };
  
  function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) return;
    
    // Get current username from the DOM
    const username = document.getElementById('username')?.textContent || 'You';
    
    // Get current time
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create message object
    const messageObj = {
      message: messageText,
      username: username,
      timestamp: timestamp
    };
    
    // Add message locally
    addMessage(username, messageText, timestamp);
    
    // Send message via WebSocket
    if (chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify(messageObj));
      console.log('Message sent via WebSocket');
    } else {
      console.error('Chat WebSocket is not open');
    }
    
    // Also send via RTCDataChannel for peer-to-peer messaging
    sendViaDataChannel(messageObj);
    
    // Clear input
    chatInput.value = '';
  }
  
  function sendViaDataChannel(messageObj) {
    // Get all peer connections from the global scope
    const peerConnections = window.peerConnections || {};
    
    // Send to all peer connections
    Object.keys(peerConnections).forEach(peerId => {
      const pc = peerConnections[peerId];
      
      // Find or create data channel
      let dataChannel = pc.dataChannels?.chat;
      
      if (!dataChannel) {
        // Try to create a new data channel if it doesn't exist
        try {
          dataChannel = pc.createDataChannel('chat');
          if (!pc.dataChannels) pc.dataChannels = {};
          pc.dataChannels.chat = dataChannel;
          
          // Set up data channel event handlers
          dataChannel.onopen = () => console.log('Data channel opened for peer:', peerId);
          dataChannel.onclose = () => console.log('Data channel closed for peer:', peerId);
          dataChannel.onerror = (error) => console.error('Data channel error:', error);
        } catch (error) {
          console.error('Failed to create data channel:', error);
          return;
        }
      }
      
      // Send message if data channel is open
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(messageObj));
        console.log('Message sent via data channel to peer:', peerId);
      } else {
        console.warn('Data channel not open for peer:', peerId, 'State:', dataChannel.readyState);
      }
    });
  }
  
  function addMessage(username, text, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    // Determine if this is the current user's message
    const currentUsername = document.getElementById('username')?.textContent || 'You';
    if (username === currentUsername) {
      messageDiv.classList.add('sent');
    } else {
      messageDiv.classList.add('received');
    }
    
    // Create message content with username and timestamp
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-header">
          <span class="message-username">${username}</span>
          <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-text">${text}</div>
      </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Expose functions for external use
  window.chatFunctions = {
    addMessage,
    sendMessage
  };
}

// Export function to add data channel to peer connection
export function setupDataChannel(peerConnection, peerId) {
  // Create a data channel for this peer connection
  const dataChannel = peerConnection.createDataChannel('chat');
  
  // Store the data channel
  if (!peerConnection.dataChannels) peerConnection.dataChannels = {};
  peerConnection.dataChannels.chat = dataChannel;
  
  // Set up event handlers
  dataChannel.onopen = () => {
    console.log('Data channel opened for peer:', peerId);
  };
  
  dataChannel.onclose = () => {
    console.log('Data channel closed for peer:', peerId);
  };
  
  dataChannel.onmessage = (event) => {
    console.log('Message received via data channel from peer:', peerId);
    try {
      const data = JSON.parse(event.data);
      if (data.message && data.username && data.timestamp) {
        // Add message to chat
        window.chatFunctions?.addMessage(data.username, data.message, data.timestamp);
      }
    } catch (error) {
      console.error('Error parsing data channel message:', error);
    }
  };
  
  // Also handle incoming data channels
  peerConnection.ondatachannel = (event) => {
    const incomingChannel = event.channel;
    console.log('Incoming data channel:', incomingChannel.label);
    
    incomingChannel.onmessage = (messageEvent) => {
      console.log('Message received on incoming channel:', incomingChannel.label);
      try {
        const data = JSON.parse(messageEvent.data);
        if (data.message && data.username && data.timestamp) {
          // Add message to chat
          window.chatFunctions?.addMessage(data.username, data.message, data.timestamp);
        }
      } catch (error) {
        console.error('Error parsing incoming channel message:', error);
      }
    };
  };
  
  return dataChannel;
}
