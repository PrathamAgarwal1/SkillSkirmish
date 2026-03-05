import React, { useEffect, useRef, useState } from 'react';

const TerminalWindow = ({ logs = [], onInput, onClear, isRunning }) => {
    const terminalEndRef = useRef(null);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getLogColor = (logType) => {
        const colorMap = {
            'error': '#f48771',
            'warning': '#dcdcaa',
            'success': '#6a9955',
            'info': '#cccccc',
            'input': '#58a6ff'
        };
        return colorMap[logType] || '#cccccc';
    };

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
                    Terminal / Console Output
                    {isRunning && <span style={{ marginLeft: '8px', color: '#6a9955', fontSize: '11px' }}>● File Running</span>}
                </h3>
                <div className="window-controls">
                    {onClear && (
                        <button 
                            className="window-btn" 
                            onClick={onClear} 
                            title="Clear Terminal"
                            style={{ fontSize: '14px' }}
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>
            <div className="window-content" style={{
                flex: 1,
                backgroundColor: '#1e1e1e',
                color: '#cccccc',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '13px',
                overflowY: 'auto',
                padding: '10px',
                lineHeight: '1.5'
            }}>
                <div className="terminal-output">
                    {logs.length === 0 ? (
                        <div style={{ color: '#666', opacity: 0.7, fontSize: '12px' }}>
                            Terminal ready. Run a file to see output.
                        </div>
                    ) : (
                        logs.map((log, idx) => (
                            <div 
                                key={idx} 
                                className={`terminal-line ${log.type}`} 
                                style={{ 
                                    whiteSpace: 'pre-wrap',
                                    wordWrap: 'break-word',
                                    marginBottom: '2px',
                                    color: getLogColor(log.type)
                                }}
                            >
                                {String(log.message || log)}
                            </div>
                        ))
                    )}
                    <div ref={terminalEndRef} />
                </div>
                <div className="terminal-input-line" style={{ display: 'flex', alignItems: 'flex-start', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #333' }}>
                    <span style={{ color: '#58a6ff', marginRight: '8px', marginTop: '2px', flexShrink: 0 }}>$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={!isRunning}
                        placeholder={isRunning ? 'Type and press Enter to send input...' : 'No process running'}
                        style={{
                            flex: 1,
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: isRunning ? '#e0e0e0' : '#666',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            opacity: isRunning ? 1 : 0.5,
                            cursor: isRunning ? 'text' : 'not-allowed',
                            padding: 0
                        }}
                        autoFocus={isRunning}
                    />
                </div>
            </div>
        </div>
    );
};

export default TerminalWindow;
