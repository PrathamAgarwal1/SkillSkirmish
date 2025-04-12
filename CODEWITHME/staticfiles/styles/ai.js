export function initAI() {
    const aiInput = document.getElementById('aiInput');
    const aiSubmit = document.getElementById('aiSubmit');
    
    aiSubmit.addEventListener('click', handleAIQuery);
    aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAIQuery();
    });
}

async function handleAIQuery() {
    const input = document.getElementById('aiInput');
    const query = input.value.trim();
    if (!query) return;

    const aiChat = document.getElementById('aiChat');
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message user';
    userMsg.innerHTML = `<strong>You</strong>: ${query}`;
    aiChat.appendChild(userMsg);

    // Add loading indicator
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ai-message ai-loading';
    loadingMsg.innerHTML = `<strong>AI</strong>: Thinking...`;
    aiChat.appendChild(loadingMsg);
    aiChat.scrollTop = aiChat.scrollHeight;

    try {
        // Get current code from editor
        const codeContext = getEditorContent();
        
        // Call AI API
        const aiResponse = await callCodingAI(query, codeContext);

        // Remove loading message
        loadingMsg.remove();

        // Add AI response
        const aiMsg = document.createElement('div');
        aiMsg.className = `ai-message ${aiResponse.startsWith('Error:') ? 'error' : 'assistant'}`;
        aiMsg.innerHTML = `<strong>AI</strong>: ${aiResponse}`;

        // Format code blocks if present
        if (!aiResponse.startsWith('Error:')) {
            aiMsg.innerHTML = aiMsg.innerHTML.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
            aiMsg.style.cursor = 'pointer';
            aiMsg.title = 'Click to apply code suggestions';
            aiMsg.addEventListener('click', () => {
                const codeMatch = aiResponse.match(/```(?:[a-z]+\n)?([\s\S]*?)```/);
                if (codeMatch && codeMatch[1]) {
                    setEditorContent(codeMatch[1]);
                }
            });
        }

        aiChat.appendChild(aiMsg);
        aiChat.scrollTop = aiChat.scrollHeight;
        input.value = '';
    } catch (error) {
        loadingMsg.remove();
        const errorMsg = document.createElement('div');
        errorMsg.className = 'ai-message error';
        errorMsg.innerHTML = `<strong>AI</strong>: Error: ${error.message}`;
        aiChat.appendChild(errorMsg);
        aiChat.scrollTop = aiChat.scrollHeight;
    }
}

async function callCodingAI(prompt, codeContext, retries = 2) {
    const fullPrompt = `You are a helpful coding assistant. Here's some code:\n\n${codeContext}\n\nQuestion: ${prompt}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // You should move your API key to settings.js or backend
            const response = await fetch("/api/ai/query", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: fullPrompt
                })
            });

            const data = await response.json();
            return data.response || "No recognizable response from model.";
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (attempt === retries) return `Error: ${error.message}`;
            await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        }
    }
}