console.log('main.js loaded');

// Set username
document.getElementById('username').textContent = 'User' + Math.floor(Math.random() * 1000);

// Sidebar navigation
document.addEventListener('DOMContentLoaded', function() {
    console.log('Main JS loaded successfully');
    // Initialize sidebar functionality
    const sidebarButtons = document.querySelectorAll('.sidebar-btn');
    const contentAreas = document.querySelectorAll('.content-area');

    sidebarButtons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.dataset.section;
            
            // Update active states
            sidebarButtons.forEach(btn => btn.classList.remove('active'));
            contentAreas.forEach(area => area.classList.remove('active'));
            
            // Set new active states
            button.classList.add('active');
            document.getElementById(`${section}Section`).classList.add('active');
        });
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button
            button.classList.add('active');

            // Show corresponding content
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Initialize first tab as active
    if (tabButtons.length > 0 && !document.querySelector('.tab-btn.active')) {
        tabButtons[0].click();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Right sidebar tab switching
    const rightSidebarTabs = document.querySelectorAll('.right-sidebar .tab-btn');
    const rightSidebarContents = document.querySelectorAll('.right-sidebar .tab-content');

    rightSidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            rightSidebarTabs.forEach(t => t.classList.remove('active'));
            rightSidebarContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and its content
            tab.classList.add('active');
            const contentId = tab.getAttribute('data-tab');
            document.getElementById(contentId).classList.add('active');
        });
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
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        toggleFullScreen.textContent = 'Exit Fullscreen';
    } else {
        document.exitFullscreen();
        toggleFullScreen.textContent = 'Enter Fullscreen';
    }
    

    initEditor();
    initChat();
    initWebRTC();
    initAI();
});