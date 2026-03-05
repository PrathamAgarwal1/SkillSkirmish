import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MessageBubble = ({ role, content }) => {
    return (
        <div className={`ai-message ${role}`}>
            <div className="ai-message-label">
                {role === 'user' ? 'You' : '✨ AI Assistant'}
            </div>
            <div className="ai-message-content">
                {role === 'user' ? (
                    <p>{content}</p>
                ) : (
                    <ReactMarkdown
                        components={{
                            code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const language = match ? match[1] : '';
                                const codeString = String(children).replace(/\n$/, '');

                                if (!inline && (match || codeString.includes('\n'))) {
                                    return (
                                        <CodeBlock
                                            language={language}
                                            code={codeString}
                                        />
                                    );
                                }

                                return (
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                );
                            }
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                )}
            </div>
        </div>
    );
};

/* --- Code Block with Copy Button --- */
const CodeBlock = ({ language, code }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    return (
        <div className="ai-code-block">
            <div className="ai-code-block-header">
                <span className="ai-code-block-lang">{language || 'code'}</span>
                <button
                    className={`ai-copy-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopy}
                >
                    {copied ? '✓ Copied' : '📋 Copy'}
                </button>
            </div>
            <SyntaxHighlighter
                language={language || 'text'}
                style={oneDark}
                customStyle={{
                    margin: 0,
                    padding: '14px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    fontSize: '12.5px',
                    lineHeight: '1.55'
                }}
                showLineNumbers={code.split('\n').length > 3}
                wrapLongLines
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
};

export default MessageBubble;
