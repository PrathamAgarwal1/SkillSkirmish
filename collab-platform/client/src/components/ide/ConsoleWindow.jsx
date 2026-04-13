import React, { useEffect, useRef } from 'react';

const ConsoleWindow = ({ logs = [], onClearLogs, isRunning, collapsed, onToggleCollapse }) => {
    const consoleEndRef = useRef(null);

    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getLogColor = (log) => {
        if (log.type === 'error') return '#f48771';
        if (log.type === 'warning') return '#dcdcaa';
        if (log.type === 'success') return '#6a9955';
        if (log.type === 'info') return '#cccccc';
        return '#cccccc';
    };

    const getLogClass = (log) => {
        if (log.type === 'error') return 'error';
        if (log.type === 'warning') return 'warning';
        if (log.type === 'success') return 'success';
        if (log.type === 'info') return 'info';
        return '';
    };

    return (
        <div className="ide-window" style={{ flex: 1 }}>
            <div className="window-header">
                <h3>
                    <span className="window-title-icon">⚙️</span>
                    Project Console
                    {isRunning && <span style={{ marginLeft: '8px', color: '#6a9955', fontSize: '11px' }}>● Running</span>}
                </h3>
                <div className="window-controls">
                    {!collapsed && (
                        <button className="window-btn" onClick={onClearLogs} title="Clear Console">
                            🗑️
                        </button>
                    )}
                    {onToggleCollapse && (
                        <button
                            className="window-btn"
                            onClick={onToggleCollapse}
                            title={collapsed ? "Expand Console" : "Collapse Console"}
                            style={{ color: '#999', fontSize: '12px', fontWeight: 'bold' }}
                        >
                            {collapsed ? '▼' : '▲'}
                        </button>
                    )}
                </div>
            </div>
            {!collapsed && (
                <>
                    <div className="window-content" style={{
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: '12px',
                        lineHeight: '1.5'
                    }}>
                        <div className="console-output">
                            {logs.length === 0 ? (
                                <div className="console-line info" style={{ opacity: 0.7 }}>
                                    Ready for input. Run a project to see output.
                                </div>
                            ) : (
                                logs.map((log, idx) => (
                                    <div
                                        key={idx}
                                        className={`console-line ${getLogClass(log)}`}
                                        style={{
                                            color: getLogColor(log),
                                            whiteSpace: 'pre-wrap',
                                            wordWrap: 'break-word',
                                            marginBottom: '2px'
                                        }}
                                    >
                                        {typeof log === 'object' ? (typeof log.message === 'string' ? log.message : JSON.stringify(log)) : String(log)}
                                    </div>
                                ))
                            )}
                            <div ref={consoleEndRef} />
                        </div>
                    </div>
                    <div className="console-controls">
                        <button onClick={onClearLogs} style={{ padding: '6px 12px', fontSize: '12px' }}>Clear</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ConsoleWindow;
