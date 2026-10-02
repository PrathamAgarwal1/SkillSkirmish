import React, { useEffect, useRef, useState, useCallback } from 'react';

// Viewport presets for responsive testing
const DEVICES = {
    desktop: { label: '🖥 Desktop', width: null, height: null },
    tablet: { label: '📱 Tablet', width: 768, height: 1024 },
    phone: { label: '📱 Phone', width: 390, height: 844 }
};

/**
 * In-IDE browser for the project's preview.
 *
 * The preview runs on its own origin (https://<token>.preview.<domain>), so the IDE can't reach into
 * the iframe. Instead the server injects a tiny bridge script into previewed pages that
 * postMessages console output + navigation to us and accepts back/forward/reload commands.
 */
const BrowserPreviewWindow = ({ previewUrl, phase, onConsole, onClose, stlite }) => {
    const iframeRef = useRef(null);
    const [frameSrc, setFrameSrc] = useState(previewUrl || '');
    const [address, setAddress] = useState(previewUrl || '');
    const [title, setTitle] = useState('');
    const [device, setDevice] = useState('desktop');
    const [isMaximized, setIsMaximized] = useState(false);
    const [position, setPosition] = useState({ x: 80, y: 70 });
    const [size, setSize] = useState({ width: 760, height: 620 });
    const [dragging, setDragging] = useState(null); // { kind: 'move'|'resize', startX, startY, orig }
    const [copied, setCopied] = useState(false);

    const origin = (() => {
        try { return new URL(previewUrl).origin; } catch { return null; }
    })();

    // New preview URL (app restarted) → load it
    useEffect(() => {
        if (previewUrl) {
            setFrameSrc(previewUrl);
            setAddress(previewUrl);
        }
    }, [previewUrl]);

    // Messages from the injected bridge script
    useEffect(() => {
        const onMessage = (event) => {
            if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
            const data = event.data;
            if (!data || !data.__ss) return;
            if (data.kind === 'stlite-ready' && stlite) {
                // The stlite host page is up: hand it the Streamlit app to run
                iframeRef.current.contentWindow.postMessage({ __ssStlite: stlite }, '*');
            } else if (data.kind === 'navigate') {
                setAddress(data.href);
                setTitle(data.title || '');
            } else if (data.kind === 'console' && onConsole) {
                const type = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warning' : 'info';
                onConsole(`[Browser] ${data.text}`, type);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [onConsole, stlite]);

    const sendCommand = (cmd) => {
        iframeRef.current?.contentWindow?.postMessage({ __ssCmd: cmd }, origin || '*');
    };

    const reload = useCallback(() => {
        // Works even when the page has no bridge (e.g. it failed to load)
        setFrameSrc('about:blank');
        setTimeout(() => setFrameSrc(address && address.startsWith(origin || '') ? address : previewUrl), 30);
    }, [address, origin, previewUrl]);

    // Address bar: only paths on the preview origin are allowed
    const go = () => {
        if (!origin) return;
        let target = address.trim();
        if (target.startsWith('/')) target = origin + target;
        try {
            if (new URL(target).origin !== origin) target = previewUrl;
        } catch {
            target = `${origin}/${target.replace(/^\/+/, '')}`;
        }
        setAddress(target);
        setFrameSrc(target);
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(address || previewUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked */ }
    };

    // Window drag / resize
    useEffect(() => {
        if (!dragging) return;
        const onMove = (e) => {
            const dx = e.clientX - dragging.startX;
            const dy = e.clientY - dragging.startY;
            if (dragging.kind === 'move') {
                setPosition({ x: dragging.orig.x + dx, y: Math.max(0, dragging.orig.y + dy) });
            } else {
                setSize({ width: Math.max(380, dragging.orig.width + dx), height: Math.max(300, dragging.orig.height + dy) });
            }
        };
        const onUp = () => setDragging(null);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragging]);

    const startDrag = (kind) => (e) => {
        if (isMaximized) return;
        e.preventDefault();
        setDragging({ kind, startX: e.clientX, startY: e.clientY, orig: kind === 'move' ? position : size });
    };

    const dev = DEVICES[device];
    // The IDE page is cross-origin isolated (for the in-browser runtime). WebContainer previews are
    // built for that; other previews load as "credentialless" frames so they don't need COEP headers.
    const isWebContainer = /.webcontainer(-api)?.io$/.test((() => { try { return new URL(previewUrl).hostname; } catch { return ''; } })());
    const isStarting = phase === 'preparing' || phase === 'installing' || phase === 'starting';
    const pathLabel = (() => {
        try {
            const u = new URL(address);
            return u.pathname + u.search + u.hash;
        } catch {
            return address;
        }
    })();

    const btn = { background: 'transparent', border: 'none', color: 'var(--gh-cccccc)', cursor: 'pointer', fontSize: 14, padding: '2px 6px' };

    return (
        <div
            className="ide-window"
            style={{
                position: 'fixed',
                left: isMaximized ? 0 : position.x,
                top: isMaximized ? 0 : position.y,
                width: isMaximized ? '100vw' : size.width,
                height: isMaximized ? '100vh' : size.height,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: isMaximized ? 'none' : '0 10px 40px rgba(0,0,0,0.6)',
                borderRadius: isMaximized ? 0 : 6
            }}
        >
            {/* Title bar */}
            <div
                className="window-header"
                onMouseDown={startDrag('move')}
                onDoubleClick={() => setIsMaximized(m => !m)}
                style={{ cursor: isMaximized ? 'default' : 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
            >
                <h3 style={{ margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="window-title-icon">🌐</span>
                    {title || 'Browser Preview'}
                </h3>
                <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ background: 'var(--gh-1e1e1e)', color: 'var(--gh-cccccc)', border: '1px solid var(--gh-3e3e42)', borderRadius: 3, fontSize: 11 }}
                    title="Viewport size"
                >
                    {Object.entries(DEVICES).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}
                </select>
                <button className="window-btn" onClick={() => setIsMaximized(m => !m)} title={isMaximized ? 'Restore' : 'Maximize'}>
                    {isMaximized ? '🗗' : '🗖'}
                </button>
                <button className="window-btn" onClick={onClose} title="Close" style={{ color: 'var(--gh-f85149)' }}>✕</button>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: 'var(--gh-252526)', borderBottom: '1px solid var(--gh-3e3e42)', flexShrink: 0 }}>
                <button style={btn} onClick={() => sendCommand('back')} disabled={!previewUrl} title="Back">←</button>
                <button style={btn} onClick={() => sendCommand('forward')} disabled={!previewUrl} title="Forward">→</button>
                <button style={btn} onClick={reload} disabled={!previewUrl} title="Reload">⟳</button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--gh-1e1e1e)', border: '1px solid var(--gh-3e3e42)', borderRadius: 14, padding: '0 10px' }}>
                    <span title={previewUrl ? 'Preview is running in an isolated sandbox' : ''} style={{ fontSize: 11, marginRight: 6 }}>
                        {previewUrl ? (isStarting ? '⏳' : '🔒') : '⚪'}
                    </span>
                    <input
                        value={previewUrl ? pathLabel : ''}
                        onChange={(e) => setAddress(origin ? origin + (e.target.value.startsWith('/') ? '' : '/') + e.target.value : e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && go()}
                        placeholder={previewUrl ? '/' : 'Press ▶ Run to start a preview'}
                        disabled={!previewUrl}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--gh-dddddd)', fontSize: 12, padding: '5px 0', outline: 'none', fontFamily: 'monospace' }}
                    />
                </div>
                <button style={btn} onClick={copyUrl} disabled={!previewUrl} title="Copy preview URL">{copied ? '✓' : '⧉'}</button>
                <button style={btn} onClick={() => window.open(address || previewUrl, '_blank', 'noopener')} disabled={!previewUrl} title="Open in new tab">↗</button>
            </div>

            {/* Viewport */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: dev.width ? 'flex-start' : 'stretch', background: dev.width ? 'var(--gh-111111)' : 'var(--gh-ffffff)', overflow: 'auto', padding: dev.width ? 12 : 0 }}>
                {previewUrl ? (
                    <iframe
                        ref={iframeRef}
                        src={frameSrc}
                        title="Preview"
                        // Scripts + same-origin (for the app's own storage) — it's already a different origin from the IDE
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                        {...(isWebContainer ? {} : { credentialless: 'true' })}
                        allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
                        style={{
                            border: dev.width ? '1px solid #333' : 'none',
                            borderRadius: dev.width ? 12 : 0,
                            width: dev.width ? dev.width : '100%',
                            height: dev.width ? dev.height : '100%',
                            flexShrink: 0,
                            background: 'var(--gh-ffffff)',
                            pointerEvents: dragging ? 'none' : 'auto'
                        }}
                    />
                ) : (
                    <div style={{ margin: 'auto', color: 'var(--gh-888888)', fontFamily: 'monospace', textAlign: 'center', padding: 24 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🌐</div>
                        No preview running.<br />Press <b style={{ color: 'var(--gh-4fc1ff)' }}>▶ Run</b> to start your app.
                    </div>
                )}
            </div>

            {!isMaximized && (
                <div
                    onMouseDown={startDrag('resize')}
                    title="Drag to resize"
                    style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, cursor: 'se-resize', background: 'linear-gradient(135deg, transparent 50%, var(--gh-007acc) 50%)', opacity: 0.6 }}
                />
            )}
        </div>
    );
};

export default BrowserPreviewWindow;
