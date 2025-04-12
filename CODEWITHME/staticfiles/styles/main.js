console.log('main.js loaded');

// Set username
document.getElementById('username').textContent = 'User' + Math.floor(Math.random() * 1000);

// Sidebar navigation
document.querySelectorAll('.sidebar-btn').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.content-area').forEach(section => section.classList.remove('active'));
        document.getElementById(button.dataset.section + 'Section').classList.add('active');
    });
});

// Initialize modules
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
    // Button Elements
    const toggleCamera = document.getElementById('toggleCamera');
    const toggleScreenShare = document.getElementById('toggleScreenShare');
    const toggleFullScreen = document.getElementById('toggleFullScreen');
    const endCall = document.getElementById('endCall');
    const sendMessage = document.getElementById('sendMessage');

    // Button Event Listeners
    if (toggleCamera) {
        toggleCamera.addEventListener('click', () => {
            console.log('Camera toggle clicked');
            const isOff = toggleCamera.textContent.includes('Off');
            toggleCamera.textContent = isOff ? '📹 Camera On' : '📹 Camera Off';
        });
    }

    if (toggleScreenShare) {
        toggleScreenShare.addEventListener('click', () => {
            console.log('Screen share clicked');
            const isSharing = toggleScreenShare.textContent.includes('Stop');
            toggleScreenShare.textContent = isSharing ? '🖥️ Screen Share' : '🖥️ Stop Sharing';
        });
    }

    if (toggleFullScreen) {
        toggleFullScreen.addEventListener('click', () => {
            console.log('Fullscreen toggle clicked');
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });
    }

    if (endCall) {
        endCall.addEventListener('click', () => {
            console.log('End call clicked');
            if (confirm('Are you sure you want to end the call?')) {
                window.location.href = '/team';
            }
        });
    }

    if (sendMessage) {
        sendMessage.addEventListener('click', () => {
            const chatInput = document.getElementById('chatInput');
            if (chatInput && chatInput.value.trim()) {
                console.log('Sending message:', chatInput.value);
                // Add message to chat
                const messageDiv = document.createElement('div');
                messageDiv.className = 'chat-message';
                messageDiv.textContent = chatInput.value;
                document.getElementById('chatMessages').appendChild(messageDiv);
                chatInput.value = '';
            }
        });
    }

    initEditor();
    initChat();
    initWebRTC();
    initAI();
});