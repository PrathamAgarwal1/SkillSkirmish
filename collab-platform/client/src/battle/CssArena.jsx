// battle/CssArena.jsx — recreate the target picture in HTML/CSS; live match %, compare slider.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { socket } from '../socket';
import { scoreCss, paint, W, H } from './cssRender';
import { emit } from './useMatch';
import { RaceBar } from './CodeArena';

const STARTER = `<div></div>
<style>
  body {
    background: #ffffff;
  }
  div {
    width: 100px;
    height: 100px;
    background: #dd6b4d;
  }
</style>
`;

const storeKey = (matchId) => `ss-battle-${matchId}-css`;

export default function CssArena({ m, myId }) {
    const { state } = m;
    const target = state.target;
    const matchId = state.matchId;
    const [code, setCode] = useState(() => { try { return localStorage.getItem(storeKey(matchId)) ?? STARTER; } catch { return STARTER; } });
    const [live, setLive] = useState(null); // current match %
    const [renderError, setRenderError] = useState('');
    const [compare, setCompare] = useState(50); // slider position %
    const [mode, setMode] = useState('side'); // side | slide
    const [busy, setBusy] = useState(false);
    const [verdict, setVerdict] = useState(null);
    const [copied, setCopied] = useState('');
    const canvas = useRef(null);
    const lastTyping = useRef(0);
    const me = state.players.find(p => p.userId === myId);
    const opponent = state.players.find(p => p.userId !== myId);
    const running = state.status === 'running';
    const practice = ['practice', 'daily'].includes(state.mode);

    // Re-render shortly after typing stops
    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const { score, pixels } = await scoreCss(code, target.image);
                if (cancelled) return;
                setLive(score);
                setRenderError('');
                paint(canvas.current, pixels);
            } catch (err) {
                if (!cancelled) setRenderError(err.message);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [code, target.image]);

    const onEdit = (value = '') => {
        setCode(value);
        try { localStorage.setItem(storeKey(matchId), value); } catch { /* ignore */ }
        if (running && Date.now() - lastTyping.current > 1500) {
            lastTyping.current = Date.now();
            socket.emit('battle:typing', { matchId });
        }
    };

    const submit = useCallback(async () => {
        if (busy || !running || me?.solved) return;
        setBusy(true);
        const { score } = await scoreCss(code, target.image).catch(() => ({ score: 0 }));
        const res = await emit('battle:submit', { matchId, code, score });
        setVerdict(res?.ok ? res : { error: res?.error || 'Submission failed' });
        setBusy(false);
    }, [busy, running, me, code, target.image, matchId]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit]);

    const copyColor = (c) => {
        navigator.clipboard?.writeText(c);
        setCopied(c);
        setTimeout(() => setCopied(''), 1200);
    };

    return (
        <>
            <div className="bt-race">
                <RaceBar player={me} total={100} isMe label />
                {!practice && <RaceBar player={opponent} total={100} label typing={Date.now() - m.typingAt < 2500} />}
            </div>
            <div className="bt-css">
                <section className="bt-css-target">
                    <h3>Target</h3>
                    <img src={target.image} width={W} height={H} alt={`Target picture: ${target.title}`} />
                    <div className="bt-palette" aria-label="Colors used">
                        {target.palette.map(c => (
                            <button key={c} onClick={() => copyColor(c)} title="Copy color">
                                <i style={{ background: c }} />{copied === c ? 'copied' : c}
                            </button>
                        ))}
                    </div>
                    <p className="bt-muted bt-small">
                        400 × 300. Style <code>body</code> for the background. {98.5}%+ counts as solved; otherwise the closest match when time runs out wins.
                    </p>
                </section>

                <section className="bt-css-editor">
                    <div className="bt-toolbar">
                        <span className="bt-lang-label">HTML + CSS</span>
                        <button className="bt-btn ghost" onClick={() => { if (window.confirm('Reset to the starter code?')) onEdit(STARTER); }}>Reset</button>
                        <span className="bt-status">{verdict?.error ? `✕ ${verdict.error}` : verdict?.ok ? `Submitted ${verdict.score}%${verdict.solved ? ' · solved!' : ` · best ${verdict.best}%`}` : ''}</span>
                        <button className="bt-btn primary" onClick={submit} disabled={busy || !running || me?.solved} title="Ctrl+Enter">{me?.solved ? '✓ Solved' : busy ? 'Submitting…' : `Submit ${live != null ? `${live}%` : ''}`}</button>
                    </div>
                    <div className="bt-editor">
                        <Editor
                            height="100%"
                            language="html"
                            value={code}
                            onChange={onEdit}
                            theme="vs-dark"
                            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 10 } }}
                        />
                    </div>
                </section>

                <section className="bt-css-output">
                    <div className="bt-css-output-head">
                        <h3>Your output</h3>
                        <span className={`bt-match ${live >= 98.5 ? 'ok' : ''}`}>{live != null ? `${live}% match` : '…'}</span>
                    </div>
                    <div className={`bt-stage ${mode}`} style={{ '--split': `${compare}%` }}>
                        <canvas ref={canvas} width={W} height={H} aria-label="Your rendered output" />
                        {mode === 'slide' && <img src={target.image} width={W} height={H} alt="" className="bt-stage-target" />}
                    </div>
                    <div className="bt-compare">
                        <button className={`bt-btn ghost ${mode === 'side' ? 'on' : ''}`} onClick={() => setMode('side')}>Output</button>
                        <button className={`bt-btn ghost ${mode === 'slide' ? 'on' : ''}`} onClick={() => setMode('slide')}>Compare</button>
                        {mode === 'slide' && (
                            <input type="range" min="0" max="100" value={compare} onChange={(e) => setCompare(Number(e.target.value))} aria-label="Compare with the target" />
                        )}
                    </div>
                    {renderError && <p className="err bt-small">{renderError}</p>}
                </section>
            </div>
        </>
    );
}
