import React, { useEffect, useRef, useState } from 'react';

const TerminalWindow = ({ logs = [], onInput, onClear, isRunning, onCommand, projectId }) => {
    const terminalEndRef = useRef(null);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [currentDir, setCurrentDir] = useState('');

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // Focus input when clicking anywhere in terminal
    const handleTerminalClick = () => {
        inputRef.current?.focus();
    };

    const getLogColor = (logType) => {
        const colorMap = {
            'error': '#f48771',
            'warning': '#dcdcaa',
            'success': '#6a9955',
            'info': '#cccccc',
            'input': '#58a6ff',
            'command': '#c586c0',
            'system': '#569cd6'
        };
        return colorMap[logType] || '#cccccc';
    };

    const handleKeyDown = async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!inputValue.trim()) return;

            const cmdToRun = inputValue;
            setInputValue(''); // Clear immediately for snappier UI

            // Add to history
            setCommandHistory(prev => [...prev, cmdToRun]);
            setHistoryIndex(-1);

            if (isRunning) {
                // Send input to running process
                onInput(cmdToRun);
            } else if (onCommand) {
                // Execute as shell/git command
                const newCwd = await onCommand(cmdToRun, currentDir);
                if (newCwd !== undefined) {
                    setCurrentDir(newCwd);
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                const newIndex = historyIndex === -1 
                    ? commandHistory.length - 1 
                    : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex !== -1) {
                const newIndex = historyIndex + 1;
                if (newIndex >= commandHistory.length) {
                    setHistoryIndex(-1);
                    setInputValue('');
                } else {
                    setHistoryIndex(newIndex);
                    setInputValue(commandHistory[newIndex]);
                }
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // Auto-complete common commands
            const suggestions = ['git ', 'npm ', 'npx ', 'node ', 'python ', 'pip ', 'mkdir ', 'ls', 'dir'];
            const match = suggestions.find(s => s.startsWith(inputValue.toLowerCase()));
            if (match) setInputValue(match);
        }
    };

    // Quick command buttons
    const quickCommands = [
        { label: 'git status', cmd: 'git status' },
        { label: 'npm install', cmd: 'npm install' },
        { label: 'npm start', cmd: 'npm start' },
        { label: 'ls / dir', cmd: 'dir' },
        { label: 'cd ..', cmd: 'cd ..' }
    ];

    // Shorten project ID for display and optionally append currentDir
    const baseDir = projectId ? `~/project/${projectId.slice(-6)}` : '~/project';
    const shortDir = currentDir ? `${baseDir}/${currentDir}` : baseDir;

    return (
        <div className="ide-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="window-header" style={{ backgroundColor: '#2d2d2d', borderBottom: '1px solid #3e3e42' }}>
                <h3>
                    <span className="window-title-icon">💻</span>
                    Terminal
                    {isRunning && <span style={{ marginLeft: '8px', color: '#6a9955', fontSize: '11px' }}>● Process Running</span>}
                    {!isRunning && <span style={{ marginLeft: '8px', color: '#569cd6', fontSize: '11px' }}>● Shell Ready</span>}
                </h3>
                <div className="window-controls" style={{ display: 'flex', gap: '4px' }}>
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

            {/* Quick command bar — only shown when no process is running */}
            {!isRunning && (
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: '#252526',
                    borderBottom: '1px solid #333',
                    flexWrap: 'wrap'
                }}>
                    {quickCommands.map((qc) => (
                        <button
                            key={qc.cmd}
                            onClick={() => onCommand && onCommand(qc.cmd)}
                            style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                backgroundColor: '#333',
                                color: '#9cdcfe',
                                border: '1px solid #444',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontFamily: 'Consolas, monospace',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#444'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#333'}
                            title={`Run: ${qc.cmd}`}
                        >
                            {qc.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="window-content" onClick={handleTerminalClick} style={{
                flex: 1,
                backgroundColor: '#1e1e1e',
                color: '#cccccc',
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: '13px',
                overflowY: 'auto',
                padding: '10px',
                lineHeight: '1.5',
                cursor: 'text'
            }}>
                <div className="terminal-output">
                    {logs.length === 0 ? (
                        <div style={{ color: '#666', fontSize: '12px' }}>
                            <div style={{ color: '#569cd6', marginBottom: '4px' }}>
                                {shortDir} $
                            </div>
                            <div style={{ opacity: 0.7 }}>
                                Terminal ready. Type commands below or use the quick buttons.
                            </div>
                            <div style={{ marginTop: '4px', opacity: 0.5, fontSize: '11px' }}>
                                Supports: git, npm, npx, node, python, ls, dir, mkdir, pip
                            </div>
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

                {/* Input line with directory prompt */}
                <div className="terminal-input-line" style={{ display: 'flex', alignItems: 'flex-start', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #333' }}>
                    <span style={{ color: '#569cd6', marginRight: '4px', marginTop: '2px', flexShrink: 0, fontSize: '12px' }}>
                        {shortDir}
                    </span>
                    <span style={{ color: isRunning ? '#6a9955' : '#58a6ff', marginRight: '6px', marginTop: '2px', flexShrink: 0 }}>
                        {isRunning ? '>' : '$'}
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRunning ? 'Type input for running process...' : 'git status, npm install, node file.js ...'}
                        style={{
                            flex: 1,
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#e0e0e0',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            padding: 0
                        }}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
};

export default TerminalWindow;
