import React, { useEffect, useRef } from 'react';

const ConsoleWindow = ({ logs = [], onClearLogs, isRunning }) => {
    const consoleEndRef = useRef(null);

    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

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
                    Console
                    {isRunning && <span style={{ marginLeft: '8px', color: '#6a9955' }}>● Running</span>}
                </h3>
                <div className="window-controls">
                    <button className="window-btn" onClick={onClearLogs} title="Clear Console">
                        🗑️
                    </button>
                </div>
            </div>
            <div className="window-content">
                <div className="console-output">
                    {logs.length === 0 ? (
                        <div className="console-line info" style={{ opacity: 0.7 }}>
                            Ready for input...
                        </div>
                    ) : (
                        logs.map((log, idx) => (
                            <div
                                key={idx}
                                className={`console-line ${getLogClass(log)}`}
                            >
                                {typeof log === 'object' ? JSON.stringify(log) : String(log.message || log)}
                            </div>
                        ))
                    )}
                    <div ref={consoleEndRef} />
                </div>
            </div>
            <div className="console-controls">
                <button onClick={onClearLogs}>Clear</button>
            </div>
        </div>
    );
};

export default ConsoleWindow;
