let chatSocket;

export function initChat() {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendMessage');
    
    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    chatSocket = new WebSocket(`ws://${window.location.host}/ws/chat/room_name/`);
    
    chatSocket.onmessage = function (e) {
        const data = JSON.parse(e.data);
        if (data.message) {
            addMessage(data.username, data.message, data.timestamp);
        }
    };
    
    chatSocket.onclose = function () {
        console.error('Chat socket closed unexpectedly');
    };
    
    function sendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText) return;
        
        // Get current username from the DOM
        const username = document.getElementById('username').textContent;
        
        // Get current time
        const now = new Date();
        const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Add message locally
        addMessage(username, messageText, timestamp);
        
        // Send message with username and timestamp
        chatSocket.send(JSON.stringify({
            message: messageText,
            username: username,
            timestamp: timestamp
        }));
        
        chatInput.value = '';
    }
    
    function addMessage(username, text, timestamp) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        // Determine if this is the current user's message
        const currentUsername = document.getElementById('username').textContent;
        if (username === currentUsername) {
            messageDiv.classList.add('sent');
        } else {
            messageDiv.classList.add('received');
        }
        
        // Create message content with username and timestamp
        messageDiv.innerHTML = `
            <div class="sender">${username}</div>
            <div class="content">${text}</div>
            <div class="time">${timestamp}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

export function initChat() {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendMessage');

    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    chatSocket = new WebSocket(`ws://${window.location.host}/ws/chat/room_name/`);

    chatSocket.onmessage = function (e) {
        const data = JSON.parse(e.data);
        
        if (data.message) addMessage(data.username, data.message);
    };

    chatSocket.onclose = function () {
        console.error('Chat socket closed unexpectedly');
    };

    function sendMessage() {
        const messageText = chatInput.value.trim();
        
        if (!messageText) return;

        addMessage('You', messageText);
        
        chatSocket.send(JSON.stringify({ message: messageText }));
        
        chatInput.value = '';
        
    }
}