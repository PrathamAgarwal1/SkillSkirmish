import React, { useEffect, useRef, useState } from 'react';

const TerminalWindow = ({ logs = [], onInput, onClear, isRunning, onCommand, projectId }) => {
    const terminalEndRef = useRef(null);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [currentDir, setCurrentDir] = useState('');
    const [githubLink, setGithubLink] = useState(() => {
        // Load from localStorage on mount
        const saved = localStorage.getItem(`github-link-${projectId}`);
        return saved || '';
    });
    const [showGitConfig, setShowGitConfig] = useState(false);

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // Save GitHub link to localStorage
    const handleSaveGithubLink = () => {
        localStorage.setItem(`github-link-${projectId}`, githubLink);
        setShowGitConfig(false);
    };

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
        { label: 'git log', cmd: 'git log --oneline -5' },
        { label: 'git clone', cmd: githubLink ? `git clone ${githubLink}` : 'git clone <url>' },
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

            {/* GitHub Link Configuration Section */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                backgroundColor: '#323233',
                borderBottom: '1px solid #3e3e42',
                fontSize: '12px'
            }}>
                <span style={{ color: '#999', whiteSpace: 'nowrap' }}>🔗 GitHub:</span>
                {showGitConfig ? (
                    <>
                        <input
                            type="text"
                            value={githubLink}
                            onChange={(e) => setGithubLink(e.target.value)}
                            placeholder="https://github.com/user/repo.git"
                            style={{
                                flex: 1,
                                padding: '4px 6px',
                                backgroundColor: '#1e1e1e',
                                border: '1px solid #444',
                                color: '#e0e0e0',
                                fontSize: 'inherit',
                                outline: 'none',
                                borderRadius: '3px'
                            }}
                        />
                        <button
                            onClick={handleSaveGithubLink}
                            style={{
                                padding: '2px 8px',
                                backgroundColor: '#007acc',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: 'inherit'
                            }}
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setShowGitConfig(false)}
                            style={{
                                padding: '2px 8px',
                                backgroundColor: '#444',
                                color: '#999',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: 'inherit'
                            }}
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <span style={{ 
                            color: githubLink ? '#6a9955' : '#999',
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {githubLink || 'Not set'}
                        </span>
                        <button
                            onClick={() => setShowGitConfig(true)}
                            title="Configure GitHub repository"
                            style={{
                                padding: '2px 6px',
                                backgroundColor: '#333',
                                color: '#58a6ff',
                                border: '1px solid #444',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '10px'
                            }}
                        >
                            ⚙️ Edit
                        </button>
                    </>
                )}
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
                            <div style={{ opacity: 0.7, marginBottom: '8px' }}>
                                Terminal ready. Type commands below or use the quick buttons.
                            </div>
                            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#1a1a1a', borderRadius: '3px', borderLeft: '3px solid #569cd6', fontSize: '11px', opacity: 0.8 }}>
                                <div style={{ marginBottom: '4px', color: '#4ec9b0', fontWeight: 'bold' }}>📚 Available Commands:</div>
                                <div>✓ Git: clone, init, add, commit, push, pull, status, log</div>
                                <div>✓ NPM: install, start, run, test, build</div>
                                <div>✓ Node: node file.js, node -e "code"</div>
                                <div>✓ File: ls/dir, cd, mkdir, cp, rm, cat</div>
                                <div style={{ marginTop: '4px', color: '#dcdcaa' }}>
                                    💡 Set GitHub link above to quick-clone repos!
                                </div>
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
