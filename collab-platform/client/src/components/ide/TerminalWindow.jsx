import React, { useEffect, useRef, useState } from 'react';

const TerminalWindow = ({ logs = [], onInput, isRunning }) => {
    const terminalEndRef = useRef(null);
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (inputValue.trim()) {
                onInput(inputValue);
                setInputValue('');
            }
        }
    };

    return (
        <div className="ide-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="window-header" style={{ backgroundColor: '#2d2d2d', borderBottom: '1px solid #3e3e42' }}>
                <h3>
                    <span className="window-title-icon">💻</span>
                    Terminal
                    {isRunning && <span style={{ marginLeft: '8px', color: '#6a9955', fontSize: '11px' }}>● File Running</span>}
                </h3>
                <div className="window-controls">
                    {/* Add controls like Clear if needed */}
                </div>
            </div>
            <div className="window-content" style={{
                flex: 1,
                backgroundColor: '#1e1e1e',
                color: '#cccccc',
                fontFamily: 'Consolas, monospace',
                fontSize: '13px',
                overflowY: 'auto',
                padding: '10px'
            }}>
                <div className="terminal-output">
                    {logs.map((log, idx) => (
                        <div key={idx} className={`terminal-line ${log.type}`} style={{ whiteSpace: 'pre-wrap', marginBottom: '2px' }}>
                            <span style={{ color: log.type === 'error' ? '#f48771' : log.type === 'input' ? '#58a6ff' : '#cccccc' }}>
                                {log.message}
                            </span>
                        </div>
                    ))}
                    <div ref={terminalEndRef} />
                </div>
                <div className="terminal-input-line" style={{ display: 'flex', alignItems: 'center', marginTop: '5px' }}>
                    <span style={{ color: '#58a6ff', marginRight: '8px' }}>$</span>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                            flex: 1,
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#e0e0e0',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
};

export default TerminalWindow;
