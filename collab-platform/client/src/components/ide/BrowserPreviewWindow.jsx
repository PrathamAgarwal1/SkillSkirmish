import React, { useState, useRef } from 'react';

const BrowserPreviewWindow = ({ previewUrl, onRefresh, isLoading, onClose }) => {
    const [url, setUrl] = useState(previewUrl || 'http://localhost:3000');
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [position, setPosition] = useState({ x: 50, y: 50 });
    const [size, setSize] = useState({ width: 700, height: 600 });
    const iframeRef = useRef(null);
    const windowRef = useRef(null);
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

    const handleUrlChange = (e) => {
        setUrl(e.target.value);
    };

    const handleGo = () => {
        if (iframeRef.current) {
            iframeRef.current.src = url;
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleGo();
        }
    };

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging && !isResizing) return;
        
        if (isDragging) {
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            setPosition({ x: newX, y: newY });
        }
        
        if (isResizing) {
            const deltaX = e.clientX - resizeStartRef.current.x;
            const deltaY = e.clientY - resizeStartRef.current.y;
            const newWidth = Math.max(400, resizeStartRef.current.width + deltaX);
            const newHeight = Math.max(300, resizeStartRef.current.height + deltaY);
            setSize({ width: newWidth, height: newHeight });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsResizing(false);
    };

    const handleResizeStart = (e) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height
        };
    };

    React.useEffect(() => {
        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, isResizing, dragOffset]);

    // Inject console capture script into iframe
    React.useEffect(() => {
        if (!iframeRef.current) return;

        const handleIframeLoad = () => {
            try {
                const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
                if (!iframeDoc) return;

                // Create a script that captures console output
                const script = iframeDoc.createElement('script');
                script.textContent = `
                    (function() {
                        const originalLog = console.log;
                        const originalError = console.error;
                        const originalWarn = console.warn;
                        const originalInfo = console.info;

                        function sendToParent(message, type) {
                            window.parent.postMessage({
                                type: 'console-output',
                                source: 'browser-console',
                                message: message,
                                logType: type
                            }, '*');
                        }

                        console.log = function(...args) {
                            const message = args.map(arg => {
                                if (typeof arg === 'object') {
                                    try { return JSON.stringify(arg); } catch { return String(arg); }
                                }
                                return String(arg);
                            }).join(' ');
                            sendToParent(message, 'log');
                            originalLog.apply(console, args);
                        };

                        console.error = function(...args) {
                            const message = args.map(arg => {
                                if (typeof arg === 'object') {
                                    try { return JSON.stringify(arg); } catch { return String(arg); }
                                }
                                return String(arg);
                            }).join(' ');
                            sendToParent(message, 'error');
                            originalError.apply(console, args);
                        };

                        console.warn = function(...args) {
                            const message = args.map(arg => {
                                if (typeof arg === 'object') {
                                    try { return JSON.stringify(arg); } catch { return String(arg); }
                                }
                                return String(arg);
                            }).join(' ');
                            sendToParent(message, 'warning');
                            originalWarn.apply(console, args);
                        };

                        console.info = function(...args) {
                            const message = args.map(arg => {
                                if (typeof arg === 'object') {
                                    try { return JSON.stringify(arg); } catch { return String(arg); }
                                }
                                return String(arg);
                            }).join(' ');
                            sendToParent(message, 'info');
                            originalInfo.apply(console, args);
                        };
                    })();
                `;
                iframeDoc.head.appendChild(script);
            } catch (err) {
                console.warn('Could not inject console capture script:', err);
            }
        };

        iframeRef.current.addEventListener('load', handleIframeLoad);
        return () => {
            if (iframeRef.current) {
                iframeRef.current.removeEventListener('load', handleIframeLoad);
            }
        };
    }, []);

    return (
        <div 
            ref={windowRef}
            className="ide-window" 
            style={{ 
                flex: 'none',
                position: 'fixed',
                transform: `translate(${position.x}px, ${position.y}px)`,
                cursor: isDragging ? 'grabbing' : isResizing ? 'se-resize' : 'grab',
                transition: (isDragging || isResizing) ? 'none' : 'all 0.2s ease',
                width: `${size.width}px`,
                height: `${size.height}px`,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
                borderRadius: '4px'
            }}
        >
            <div 
                className="window-header"
                onMouseDown={handleMouseDown}
                style={{ 
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flex: '0 0 auto'
                }}
            >
                <h3 style={{ margin: 0, flex: 1 }}>
                    <span className="window-title-icon">🌐</span>
                    Browser Preview
                </h3>
                <div className="window-controls" style={{ display: 'flex', gap: '4px' }}>
                    <button 
                        className="window-btn" 
                        onClick={onRefresh} 
                        title="Refresh"
                        disabled={isLoading}
                    >
                        🔄
                    </button>
                    <button 
                        className="window-btn"
                        onClick={onClose}
                        title="Close"
                        style={{ color: '#f85149' }}
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div className="window-content" style={{ padding: 0, flexDirection: 'column', flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div className="browser-address-bar" style={{ flexShrink: 0 }}>
                    <input
                        type="text"
                        value={url}
                        onChange={handleUrlChange}
                        onKeyPress={handleKeyPress}
                        placeholder="Enter URL or use default..."
                    />
                    <button 
                        onClick={handleGo}
                        style={{
                            padding: '6px 16px',
                            background: '#007acc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Go
                    </button>
                </div>
                <iframe
                    ref={iframeRef}
                    src={url}
                    title="Preview"
                    className="browser-frame"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    style={{ flex: 1, border: 'none', pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
                />
            </div>
            
            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeStart}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '20px',
                    height: '20px',
                    cursor: 'se-resize',
                    background: 'linear-gradient(135deg, transparent 50%, #007acc 50%)',
                    opacity: 0.6,
                    zIndex: 2000
                }}
                title="Drag to resize"
            />
        </div>
    );
};

export default BrowserPreviewWindow;
