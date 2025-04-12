document.addEventListener('DOMContentLoaded', () => {
    const aiInput = document.querySelector('#aiChatInput');
    const sendButton = document.querySelector('#sendToAI');
    const messagesContainer = document.querySelector('#aiMessages');

    // Add message to chat window
    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.innerHTML = text;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Send message to AI
    async function sendToAI() {
        const message = aiInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        aiInput.value = '';
        sendButton.disabled = true;

        try {
            const response = await fetch('/ai/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify({ message }),
            });

            const data = await response.json();
            if (data?.response) {
                addMessage(data.response, 'ai');
            } else {
                addMessage("⚠️ No response from AI", 'ai');
            }
        } catch (err) {
            console.error('Error sending message to AI:', err);
            addMessage("🚨 AI failed to respond. Try again later.", 'ai');
        } finally {
            sendButton.disabled = false;
        }
    }

    // CSRF Token Getter
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // Event Listeners
    sendButton?.addEventListener('click', sendToAI);
    aiInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendToAI();
        }
    });
});
