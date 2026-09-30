import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { socket } from '../../socket';
import { buildAndPublish } from '../../runtime/publish';

const STATUS_COLORS = { live: '#3fb950', building: '#d29922', failed: '#f85149', stopped: '#8b949e', idle: '#8b949e' };

// The pipeline the user sees: where the current deploy is
const stagesFor = (deployment, building, logLines) => {
    const text = logLines.join('\n');
    const failed = !building && deployment?.versions?.[0]?.status === 'failed';
    const reached = (marker) => text.includes(marker);
    const stage = (label, done, active) => ({ label, state: done ? 'done' : active ? 'active' : failed ? 'failed' : 'pending' });
    if (!building && !logLines.length) {
        const live = deployment?.status === 'live';
        return [stage('Code', true), stage('Build', live), stage('Deploy', live), stage('Live', live)];
    }
    const built = reached('Build finished') || reached('Starting:') || reached('Live at');
    const live = reached('Live at');
    return [
        stage('Code', true),
        stage('Build', built, building && !built),
        stage('Deploy', live, building && built && !live),
        stage('Live', live)
    ];
};

const Pipeline = ({ stages }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 14px' }}>
        {stages.map((s, i) => (
            <React.Fragment key={s.label}>
                <div style={{
                    padding: '6px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600,
                    background: s.state === 'done' ? '#1f3d2a' : s.state === 'active' ? '#3d321a' : s.state === 'failed' ? '#3d1f1f' : '#2d2d30',
                    color: s.state === 'done' ? '#3fb950' : s.state === 'active' ? '#d29922' : s.state === 'failed' ? '#f85149' : '#8b949e',
                    border: '1px solid #3e3e42'
                }}>
                    {s.state === 'done' ? '✓' : s.state === 'active' ? '●' : s.state === 'failed' ? '✕' : '○'} {s.label}
                </div>
                {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: s.state === 'done' ? '#3fb950' : '#3e3e42' }} />}
            </React.Fragment>
        ))}
    </div>
);

const EnvEditor = ({ projectId }) => {
    const [rows, setRows] = useState([]);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        axios.get(`/api/projects/${projectId}/env`)
            .then(res => setRows(res.data.envVars.map(e => ({ key: e.key, preview: e.preview, value: undefined }))))
            .catch(err => setMessage(err.response?.data?.msg || 'Could not load environment variables'));
    }, [projectId]);

    const update = (i, patch) => setRows(r => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

    const save = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await axios.put(`/api/projects/${projectId}/env`, {
                envVars: rows.filter(r => r.key.trim()).map(r => ({ key: r.key.trim(), ...(r.value !== undefined ? { value: r.value } : {}) }))
            });
            setRows(res.data.envVars.map(e => ({ key: e.key, preview: e.preview, value: undefined })));
            setMessage(`✓ ${res.data.msg}`);
        } catch (err) {
            setMessage(`✕ ${err.response?.data?.msg || err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const input = { background: '#1e1e1e', border: '1px solid #3e3e42', color: '#ddd', padding: '6px 8px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 };

    return (
        <div>
            <p style={{ color: '#8b949e', fontSize: 12, marginTop: 0 }}>
                Available to your app when you <b>Run</b> and <b>Deploy</b> (e.g. <code>MONGO_URI</code>, <code>KAGGLE_USERNAME</code>, <code>KAGGLE_KEY</code>, API keys).
                Values are encrypted and never shown again.
            </p>
            {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...input, width: 190 }} value={row.key} placeholder="NAME" onChange={(e) => update(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
                    <input
                        style={{ ...input, flex: 1 }}
                        type="password"
                        autoComplete="new-password"
                        value={row.value ?? ''}
                        placeholder={row.preview ? `${row.preview} (unchanged)` : 'value'}
                        onChange={(e) => update(i, { value: e.target.value })}
                    />
                    <button onClick={() => setRows(r => r.filter((_, idx) => idx !== i))} style={{ ...input, cursor: 'pointer', color: '#f85149' }} title="Remove">✕</button>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <button className="btn-secondary-ide" onClick={() => setRows(r => [...r, { key: '', value: '' }])}>+ Add variable</button>
                <button className="btn-primary-ide" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <span style={{ fontSize: 12, color: message.startsWith('✓') ? '#3fb950' : '#f85149' }}>{message}</span>
            </div>
        </div>
    );
};

const DeployPanel = ({ projectId, projectName, runConfig, onClose }) => {
    const [tab, setTab] = useState('deploy');
    const [deployment, setDeployment] = useState(null);
    const [building, setBuilding] = useState(false);
    const [logLines, setLogLines] = useState([]);
    const [error, setError] = useState('');
    const [viewingLog, setViewingLog] = useState(null); // { number, lines }
    const logEndRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`/api/deployments/${projectId}`);
            setDeployment(res.data.deployment);
            setBuilding(res.data.building);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onLog = (data) => {
            if (data.projectId !== projectId) return;
            setLogLines(l => [...l.slice(-400), data.line]);
        };
        const onStatus = (data) => {
            if (data.projectId !== projectId) return;
            setDeployment(data.deployment);
            setBuilding(data.deployment?.status === 'building');
        };
        socket.on('deploy-log', onLog);
        socket.on('deploy-status', onStatus);
        return () => {
            socket.off('deploy-log', onLog);
            socket.off('deploy-status', onStatus);
        };
    }, [projectId]);

    useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [logLines]);

    const deploy = async () => {
        setError('');
        setLogLines([]);
        setTab('deploy');
        if (runConfig?.mode === 'browser') {
            // Built in this browser tab, then uploaded; the server hosts the static files for free
            const push = (line) => setLogLines(l => [...l.slice(-400), line]);
            setBuilding(true);
            try {
                push(`▶ Deploy · ${runConfig.label} · building in your browser`);
                const res = await buildAndPublish({
                    projectId, projectName, deploy: runConfig.deploy,
                    install: runConfig.plan?.install, requirements: runConfig.plan?.requirements, onLine: push
                });
                if (!res.success) throw new Error(res.message);
                setDeployment(res.deployment);
                push(`🌍 Live at ${res.deployment.url}`);
            } catch (err) {
                const message = err.response?.data?.message || err.message;
                setError(message);
                push(`❌ ${message}`);
            } finally {
                setBuilding(false);
            }
            return;
        }
        try {
            const res = await axios.post(`/api/deployments/${projectId}`);
            setDeployment(res.data.deployment);
            setBuilding(true);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        }
    };

    const action = async (path, body) => {
        setError('');
        try {
            const res = await axios.post(`/api/deployments/${projectId}/${path}`, body);
            setDeployment(res.data.deployment);
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        }
    };

    const showLog = async (number) => {
        try {
            const res = await axios.get(`/api/deployments/${projectId}/versions/${number}/log`);
            setViewingLog({ number, lines: res.data.log });
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        }
    };

    const canDeploy = runConfig?.deploy?.kind;
    const status = building ? 'building' : deployment?.status || 'idle';
    const tabBtn = (id, label) => (
        <button
            onClick={() => { setTab(id); setViewingLog(null); }}
            style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === id ? '#4fc1ff' : 'transparent'}`, color: tab === id ? '#fff' : '#8b949e', padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
        >{label}</button>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div style={{ width: 'min(820px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: '#252526', border: '1px solid #3e3e42', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', color: '#ccc' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #3e3e42' }}>
                    <h3 style={{ margin: 0, flex: 1, fontSize: 15, color: '#fff' }}>🚀 Deploy</h3>
                    <span style={{ fontSize: 12, marginRight: 12, color: STATUS_COLORS[status] }}>● {status}</span>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ display: 'flex', borderBottom: '1px solid #3e3e42', padding: '0 8px' }}>
                    {tabBtn('deploy', 'Pipeline')}
                    {tabBtn('versions', `Versions${deployment?.versions?.length ? ` (${deployment.versions.length})` : ''}`)}
                    {tabBtn('env', 'Environment')}
                </div>

                <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
                    {error && <div style={{ color: '#f85149', fontSize: 13, marginBottom: 10 }}>✕ {error}</div>}

                    {tab === 'deploy' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <div style={{ fontSize: 12, color: '#8b949e' }}>{runConfig ? `${runConfig.label} · ${runConfig.envLabel}` : 'Detecting project…'}</div>
                                    <div style={{ fontSize: 12, color: '#8b949e' }}>
                                        {canDeploy
    ? (runConfig.mode === 'browser' ? 'Built in your browser, hosted as a static website'
        : runConfig.deploy.kind === 'static' ? 'Deploys as a static website' : 'Deploys as a server app (own container)')
    : runConfig?.deploy?.reason}
                                    </div>
                                </div>
                                <button className="btn-primary-ide" onClick={deploy} disabled={!canDeploy || building} style={{ padding: '8px 18px' }}>
                                    {building ? 'Deploying…' : deployment?.activeVersion ? 'Deploy new version' : 'Deploy'}
                                </button>
                            </div>

                            <Pipeline stages={stagesFor(deployment, building, logLines)} />

                            {deployment && (
                                <div style={{ background: '#1e1e1e', border: '1px solid #3e3e42', borderRadius: 6, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 12, color: '#8b949e' }}>Live URL</span>
                                    <a href={deployment.url} target="_blank" rel="noreferrer" style={{ color: deployment.status === 'live' ? '#4fc1ff' : '#8b949e', fontFamily: 'monospace', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {deployment.url}
                                    </a>
                                    {deployment.activeVersion && <span style={{ fontSize: 12, color: '#8b949e' }}>v{deployment.activeVersion}</span>}
                                    {deployment.status === 'live' && <button className="btn-secondary-ide" onClick={() => action('stop')}>Stop</button>}
                                    {deployment.status === 'stopped' && deployment.activeVersion && (
                                        <button className="btn-secondary-ide" onClick={() => action('rollback', { version: deployment.activeVersion })}>Start</button>
                                    )}
                                </div>
                            )}

                            <pre style={{ background: '#1e1e1e', border: '1px solid #3e3e42', borderRadius: 6, padding: 10, height: 260, overflow: 'auto', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', color: '#d4d4d4' }}>
                                {logLines.length ? logLines.join('\n') : (building ? 'Waiting for build output…' : 'Build output will appear here.')}
                                <span ref={logEndRef} />
                            </pre>
                        </>
                    )}

                    {tab === 'versions' && !viewingLog && (
                        <div>
                            {!deployment?.versions?.length && <div style={{ color: '#8b949e' }}>No deployments yet.</div>}
                            {deployment?.versions?.map(v => (
                                <div key={v.number} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #333' }}>
                                    <b style={{ width: 40, color: '#fff' }}>v{v.number}</b>
                                    <span style={{ width: 80, color: v.status === 'ready' ? '#3fb950' : v.status === 'failed' ? '#f85149' : '#8b949e', fontSize: 12 }}>{v.status}</span>
                                    <span style={{ width: 60, fontSize: 12 }} title={v.builder || ''}>{v.kind}</span>
                                    <span style={{ flex: 1, fontSize: 12, color: '#8b949e' }}>{new Date(v.createdAt).toLocaleString()}{v.error ? ` — ${v.error}` : ''}</span>
                                    {v.active && <span style={{ fontSize: 11, color: '#3fb950', border: '1px solid #3fb950', borderRadius: 10, padding: '1px 8px' }}>active</span>}
                                    <button className="btn-secondary-ide" onClick={() => showLog(v.number)}>Log</button>
                                    {!v.active && v.status === 'ready' && (
                                        <button className="btn-secondary-ide" onClick={() => action('rollback', { version: v.number })}>Roll back</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'versions' && viewingLog && (
                        <div>
                            <button className="btn-secondary-ide" onClick={() => setViewingLog(null)} style={{ marginBottom: 8 }}>← Versions</button>
                            <pre style={{ background: '#1e1e1e', border: '1px solid #3e3e42', borderRadius: 6, padding: 10, maxHeight: 380, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                                {`v${viewingLog.number}\n${viewingLog.lines.join('\n')}`}
                            </pre>
                        </div>
                    )}

                    {tab === 'env' && <EnvEditor projectId={projectId} />}
                </div>
            </div>
        </div>
    );
};

export default DeployPanel;
