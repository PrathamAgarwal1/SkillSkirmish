import React, { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';

const ChatWindow = ({ messages, onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        }
    }, [input]);

    const handleSend = () => {
        if (!input.trim() || isLoading) return;
        onSendMessage(input.trim());
        setInput('');
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const quickActions = [
        { label: '💡 Explain', prompt: 'Explain this code:\n' },
        { label: '🐛 Debug', prompt: 'Debug this code and find issues:\n' },
        { label: '✨ Improve', prompt: 'Suggest improvements for this code:\n' },
        { label: '📝 Generate', prompt: 'Generate code for: ' },
    ];

    return (
        <>
            {/* Messages */}
            <div className="ai-chat-messages">
                {messages.length === 0 ? (
                    <div className="ai-welcome">
                        <div className="ai-welcome-icon">🤖</div>
                        <h4>AI Coding Assistant</h4>
                        <p>Ask me anything about code — I can explain, debug, improve, and generate code for you.</p>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <MessageBubble key={i} role={msg.role} content={msg.content} />
                    ))
                )}
                {isLoading && (
                    <div className="ai-typing-indicator">
                        <div className="ai-typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <span>AI is thinking...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="ai-chat-input-area">
                {messages.length === 0 && (
                    <div className="ai-quick-actions">
                        {quickActions.map((action, i) => (
                            <button
                                key={i}
                                className="ai-quick-action-btn"
                                onClick={() => setInput(action.prompt)}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="ai-input-row">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about code... (Enter to send, Shift+Enter for newline)"
                        rows={1}
                        disabled={isLoading}
                    />
                    <button
                        className="ai-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        title="Send message"
                    >
                        ➤
                    </button>
                </div>
            </div>
        </>
    );
};

export default ChatWindow;
