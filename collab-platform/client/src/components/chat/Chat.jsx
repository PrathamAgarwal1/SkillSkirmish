// src/components/chat/Chat.jsx
import React, { useState, useEffect, useRef } from 'react';

const Chat = ({ messages, onSendMessage, currentUser }) => {
    const [text, setText] = useState('');
    const messagesEndRef = useRef(null); // Ref to auto-scroll

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]); // Scroll whenever messages update

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim()) {
            onSendMessage(text);
            setText('');
        }
    };

    return (
        <div className="chat-container">
            <div className="messages-area">
                {messages.map((msg) => (
                    <div
                        key={msg._id}
                        className={`message ${msg.sender._id === currentUser._id ? 'sent' : 'received'}`}
                    >
                        <div className="message-sender">
                            {msg.sender._id === currentUser._id ? 'You' : msg.sender.username}
                        </div>
                        <div className="message-text">{msg.text}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form className="message-input-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
};

export default Chat;