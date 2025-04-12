export function initAI() {
    const aiInput = document.getElementById('aiChatInput');
    const aiSubmit = document.getElementById('sendToAI');

    aiSubmit.addEventListener('click', handleAIQuery);
    aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAIQuery();
    });

    async function handleAIQuery() {
        const query = aiInput.value.trim();
        if (!query) return;

        const aiChat = document.getElementById('aiMessages');

        // Add user message
        const userMsg = document.createElement('div');
        userMsg.className = 'ai-message user';
        userMsg.innerHTML = `<strong>You:</strong> ${query}`;
        aiChat.appendChild(userMsg);

        // Add loading indicator
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'ai-message ai-loading';
        loadingMsg.innerHTML = `<strong>AI:</strong> Thinking...`;
        aiChat.appendChild(loadingMsg);

        try {
            const aiResponse = await callCodingAI(query);
            loadingMsg.remove();

            const aiMsg = document.createElement('div');
            aiMsg.className = `ai-message assistant`;
            aiMsg.innerHTML = `<strong>AI:</strong> ${aiResponse}`;
            aiChat.appendChild(aiMsg);
            
            aiChat.scrollTop = aiChat.scrollHeight;
            aiInput.value = '';
            
        } catch (error) {
            loadingMsg.remove();
            console.error(error);
            
            const errorMsg = document.createElement('div');
            errorMsg.className = 'ai-message error';
            errorMsg.innerHTML = `<strong>Error:</strong> AI failed to respond.`;
            aiChat.appendChild(errorMsg);
            
            aiChat.scrollTop = aiChat.scrollHeight;
        }
    }
}
