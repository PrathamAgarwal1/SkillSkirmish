import React, { useCallback, useEffect, useState } from 'react';
import * as python from '../../runtime/python';

/**
 * Try a FastAPI or Flask app's endpoints without a server: the app runs in Pyodide and requests are
 * passed to it directly (ASGI / WSGI calls). Opened by ▶ Run on Python API projects in browser mode.
 */
const METHOD_COLORS = { GET: 'var(--gh-3fb950)', POST: 'var(--gh-d29922)', PUT: 'var(--gh-58a6ff)', PATCH: 'var(--gh-a371f7)', DELETE: 'var(--gh-f85149)' };

const ApiTesterWindow = ({ projectId, target, requirements, onLog, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [routes, setRoutes] = useState([]);
    const [method, setMethod] = useState('GET');
    const [path, setPath] = useState('/');
    const [body, setBody] = useState('');
    const [response, setResponse] = useState(null);
    const [sending, setSending] = useState(false);
    const [view, setView] = useState('body');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const off = python.on('stream', (s) => onLog?.(s.text.trimEnd(), s.name === 'stderr' ? 'warning' : 'info'));
        const offStatus = python.on('status', (t) => onLog?.(t, 'info'));
        try {
            onLog?.(`🐍 Loading ${target.entry} in Python (in your browser)…`, 'info');
            await python.syncFromServer(projectId);
            const { result } = await python.loadApi({ entry: target.entry, framework: target.framework, requirements });
            if (!result.ok) throw new Error(result.evalue);
            setRoutes(result.routes || []);
            onLog?.(`✅ ${target.framework === 'flask' ? 'Flask' : 'FastAPI'} app loaded, ${result.routes.length} routes`, 'success');
        } catch (err) {
            setError(err.message);
            onLog?.(`❌ ${err.message}`, 'error');
        } finally {
            off();
            offStatus();
            setLoading(false);
        }
    }, [projectId, target, requirements, onLog]);

    useEffect(() => { load(); }, [load]);

    const send = async () => {
        setSending(true);
        const started = performance.now();
        const off = python.on('stream', (s) => onLog?.(s.text.trimEnd(), s.name === 'stderr' ? 'warning' : 'info'));
        try {
            const headers = body.trim() ? { 'content-type': 'application/json' } : {};
            const { result } = await python.callApi({ method, path, headers, body });
            if (!result.ok) throw new Error(result.evalue);
            setResponse({ ...result, ms: Math.round(performance.now() - started) });
            onLog?.(`${method} ${path} → ${result.status}`, result.status < 400 ? 'success' : 'warning');
        } catch (err) {
            setResponse({ status: 0, headers: [], body: err.message, ms: 0, failed: true });
        } finally {
            off();
            setSending(false);
        }
    };

    const contentType = (response?.headers || []).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
    let pretty = response?.body ?? '';
    if (contentType.includes('json')) {
        try { pretty = JSON.stringify(JSON.parse(pretty), null, 2); } catch { /* not JSON */ }
    }

    const field = { background: 'var(--gh-1e1e1e)', color: 'var(--gh-dddddd)', border: '1px solid var(--gh-3e3e42)', borderRadius: 3, padding: '6px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 13 };
    const btn = { background: 'var(--gh-3c3c3c)', color: 'var(--gh-cccccc)', border: '1px solid var(--gh-555555)', borderRadius: 3, padding: '5px 12px', fontSize: 12, cursor: 'pointer' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div style={{ width: 'min(1000px, 96vw)', height: 'min(640px, 90vh)', display: 'flex', flexDirection: 'column', background: 'var(--gh-252526)', border: '1px solid var(--gh-3e3e42)', borderRadius: 8, color: 'var(--gh-cccccc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--gh-3e3e42)', gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: 'var(--gh-ffffff)', flex: 1 }}>🧪 API tester · {target.label}</h3>
                    <span style={{ fontSize: 11, color: 'var(--gh-8b949e)' }}>Runs in your browser (Pyodide)</span>
                    <button style={btn} onClick={load} disabled={loading} title="Reload the app after editing its code">↻ Reload app</button>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--gh-cccccc)', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <div style={{ width: 240, borderRight: '1px solid var(--gh-3e3e42)', overflow: 'auto', padding: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--gh-8b949e)', margin: '2px 4px 6px' }}>ROUTES</div>
                        {loading && <div style={{ fontSize: 12, padding: 4 }}>Loading Python and your app…</div>}
                        {error && <pre style={{ color: 'var(--gh-f85149)', fontSize: 11, whiteSpace: 'pre-wrap' }}>{error}</pre>}
                        {routes.map((r, i) => (
                            <div key={i} onClick={() => { setMethod(r.method); setPath(r.path); }}
                                style={{ display: 'flex', gap: 6, padding: '4px 6px', cursor: 'pointer', borderRadius: 3, fontSize: 12, fontFamily: 'monospace', background: method === r.method && path === r.path ? 'var(--gh-37373d)' : 'transparent' }}>
                                <b style={{ color: METHOD_COLORS[r.method] || 'var(--gh-cccccc)', width: 52 }}>{r.method}</b>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.path}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 8, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...field, color: METHOD_COLORS[method], width: 100, flex: '0 0 auto' }}>
                                {Object.keys(METHOD_COLORS).map(m => <option key={m}>{m}</option>)}
                            </select>
                            <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} style={{ ...field, flex: 1, minWidth: 0, width: 'auto' }} placeholder="/items/1?q=x" />
                            <button className="btn-primary-ide" onClick={send} disabled={loading || !!error || sending}>{sending ? 'Sending…' : 'Send'}</button>
                        </div>
                        {!['GET', 'DELETE'].includes(method) && (
                            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder='JSON body, e.g. {"name": "Mouse", "price": 19.99}' style={{ ...field, height: 90, resize: 'vertical' }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                            <span style={{ color: 'var(--gh-8b949e)' }}>Response</span>
                            {response && (
                                <>
                                    <b style={{ color: response.failed ? 'var(--gh-f85149)' : response.status < 400 ? 'var(--gh-3fb950)' : 'var(--gh-d29922)' }}>{response.failed ? 'Error' : response.status}</b>
                                    <span style={{ color: 'var(--gh-8b949e)' }}>{response.ms} ms</span>
                                    <span style={{ flex: 1 }} />
                                    {['body', 'headers', ...(contentType.includes('html') ? ['preview'] : [])].map(v => (
                                        <button key={v} style={{ ...btn, padding: '2px 8px', background: view === v ? 'var(--gh-0e639c)' : 'var(--gh-3c3c3c)' }} onClick={() => setView(v)}>{v}</button>
                                    ))}
                                </>
                            )}
                        </div>
                        <div style={{ flex: 1, minHeight: 0, background: 'var(--gh-1e1e1e)', border: '1px solid var(--gh-3e3e42)', borderRadius: 4, overflow: 'auto' }}>
                            {!response && <div style={{ padding: 12, color: 'var(--gh-6e7681)', fontSize: 12 }}>Pick a route on the left, then Send.</div>}
                            {response && view === 'body' && <pre style={{ margin: 0, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap', color: response.failed ? 'var(--gh-f85149)' : 'var(--gh-d4d4d4)' }}>{pretty}</pre>}
                            {response && view === 'headers' && <pre style={{ margin: 0, padding: 10, fontSize: 12 }}>{response.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>}
                            {response && view === 'preview' && <iframe title="response" sandbox="" srcDoc={response.body} style={{ width: '100%', height: '100%', border: 'none', background: 'var(--gh-ffffff)' }} />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApiTesterWindow;
