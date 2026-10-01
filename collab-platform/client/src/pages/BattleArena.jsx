// pages/BattleArena.jsx — a live coding battle (or practice): statement, editor, tests, race bar.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import { createRunner } from '../battle/runner';
import { matches } from '../battle/compare';
import '../battle/battle.css';

const LANGS = [['python', 'Python'], ['javascript', 'JavaScript']];

const emit = (event, payload) => new Promise((resolve) => {
    socket.timeout(20000).emit(event, payload, (err, res) => resolve(err ? { error: "Couldn't reach the server. Try again." } : res));
});

const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const show = (v) => {
    const text = JSON.stringify(v);
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};
const showArgs = (params, args) => params.map((p, i) => `${p.name} = ${show(args[i])}`).join(', ');

const storeKey = (matchId, lang) => `ss-battle-${matchId}-${lang}`;
const loadCode = (matchId, lang, fallback) => { try { return localStorage.getItem(storeKey(matchId, lang)) ?? fallback; } catch { return fallback; } };
const saveCode = (matchId, lang, code) => { try { localStorage.setItem(storeKey(matchId, lang), code); } catch { /* storage full/blocked */ } };

function RaceBar({ player, total, isMe, typing }) {
    if (!player) return <div className="bt-racer empty"><span className="bt-muted">Waiting for an opponent…</span></div>;
    const pct = total ? Math.round((player.passed / total) * 100) : 0;
    return (
        <div className={`bt-racer ${isMe ? 'me' : ''}`}>
            <div className="bt-racer-head">
                <b>{isMe ? 'You' : player.username}</b>
                <span className="bt-muted">{player.rating}</span>
                <span className="bt-muted">{player.language === 'python' ? 'Python' : 'JavaScript'}</span>
                {!player.connected && <span className="bt-tag warn">disconnected</span>}
                {player.forfeited && <span className="bt-tag warn">gave up</span>}
                {player.solved && <span className="bt-tag ok">✓ solved</span>}
                {!isMe && typing && !player.solved && <span className="bt-typing">typing<i>.</i><i>.</i><i>.</i></span>}
                <span className="bt-racer-score">{player.passed}/{total}</span>
            </div>
            <div className="bt-track" role="progressbar" aria-valuenow={player.passed} aria-valuemin={0} aria-valuemax={total} aria-label={`${isMe ? 'Your' : `${player.username}'s`} tests passed`}>
                <div className="bt-fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

const BattleArena = () => {
    const { matchId } = useParams();
    return <Arena key={matchId} matchId={matchId} />;
};

function Arena({ matchId }) {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [state, setState] = useState(null);
    const [problem, setProblem] = useState(null);
    const [inputs, setInputs] = useState(null);
    const [error, setError] = useState('');
    const [offset, setOffset] = useState(0); // server clock - local clock
    const [language, setLanguage] = useState(() => { try { return localStorage.getItem('ss-battle-lang') || 'python'; } catch { return 'python'; } });
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(''); // '', 'examples', 'submit'
    const [status, setStatus] = useState('');
    const [panel, setPanel] = useState('results');
    const [exampleResults, setExampleResults] = useState(null);
    const [submitResult, setSubmitResult] = useState(null);
    const [logs, setLogs] = useState([]);
    const [ended, setEnded] = useState(null);
    const [typingAt, setTypingAt] = useState(0);
    const [rematch, setRematch] = useState([]);
    const [copied, setCopied] = useState(false);
    const [, tick] = useState(0);
    const runner = useRef(null);
    const verifier = useRef(null);
    const lastTyping = useRef(0);
    const myId = String(user?._id || '');

    if (!runner.current) runner.current = createRunner();
    if (!verifier.current) verifier.current = createRunner({ slack: 3 });
    useEffect(() => () => { runner.current?.dispose(); verifier.current?.dispose(); }, []);

    const applyState = useCallback((s) => {
        setState(s);
        setOffset(s.now - Date.now());
        if (s.result) setEnded(e => e || s.result);
    }, []);

    // Load the match (and re-attach after a reconnect)
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const res = await emit('battle:state', { matchId });
            if (cancelled) return;
            if (!res?.ok) { setError(res?.error || 'Could not load this battle'); return; }
            applyState(res.state);
            setProblem(res.state.problem);
            setInputs(res.state.inputs);
        };
        if (socket.connected) load();
        socket.on('connect', load);
        return () => { cancelled = true; socket.off('connect', load); };
    }, [matchId, applyState]);

    // Pick the starting code once the problem is known (or the language changes)
    useEffect(() => {
        if (!problem) return;
        setCode(loadCode(matchId, language, problem.starter[language]));
        runner.current.warm(language);
    }, [problem, language, matchId]);

    useEffect(() => {
        const onUpdate = (s) => {
            if (s.matchId !== matchId) return;
            setState(prev => ({ ...prev, ...s }));
            setOffset(s.now - Date.now());
            // The invite was accepted: the inputs arrive with the full state
            if (s.status !== 'waiting' && !inputs) emit('battle:state', { matchId }).then(r => r?.ok && setInputs(r.state.inputs));
        };
        const onTyping = (d) => { if (d.matchId === matchId) setTypingAt(Date.now()); };
        const onEnded = (r) => { if (r.matchId === matchId) setEnded(r); };
        const onRematch = (d) => { if (d.matchId === matchId) setRematch(d.userIds); };
        const onMatched = ({ matchId: next }) => { if (next !== matchId) navigate(`/battle/m/${next}`); };
        // Re-run the opponent's final code to confirm their score (in an isolated worker)
        const onVerify = async (req) => {
            if (req.matchId !== matchId) return;
            const r = await verifier.current.run({ language: req.language, code: req.code, fnName: req.fnName, inputs: req.inputs });
            socket.emit('battle:verify-result', { matchId, token: req.token, outputs: r.outputs });
        };
        socket.on('battle:update', onUpdate);
        socket.on('battle:typing', onTyping);
        socket.on('battle:ended', onEnded);
        socket.on('battle:rematch', onRematch);
        socket.on('battle:matched', onMatched);
        socket.on('battle:verify', onVerify);
        return () => {
            socket.off('battle:update', onUpdate);
            socket.off('battle:typing', onTyping);
            socket.off('battle:ended', onEnded);
            socket.off('battle:rematch', onRematch);
            socket.off('battle:matched', onMatched);
            socket.off('battle:verify', onVerify);
        };
    }, [matchId, inputs, navigate]);

    // Clock
    useEffect(() => {
        const id = setInterval(() => tick(n => n + 1), 500);
        return () => clearInterval(id);
    }, []);

    const now = Date.now() + offset;
    const me = state?.players.find(p => p.userId === myId);
    const opponent = state?.players.find(p => p.userId !== myId);
    const running = state?.status === 'running';
    const total = state?.total || 0;
    const practice = state?.mode === 'practice';
    const opponentTyping = Date.now() - typingAt < 2500;

    const changeLanguage = (lang) => {
        setLanguage(lang);
        try { localStorage.setItem('ss-battle-lang', lang); } catch { /* ignore */ }
        socket.emit('battle:language', { matchId, language: lang });
    };

    const onEdit = (value = '') => {
        setCode(value);
        saveCode(matchId, language, value);
        if (running && Date.now() - lastTyping.current > 1500) {
            lastTyping.current = Date.now();
            socket.emit('battle:typing', { matchId });
        }
    };

    const runExamples = useCallback(async () => {
        if (!problem || busy) return;
        setBusy('examples');
        setPanel('results');
        setStatus('');
        const r = await runner.current.run({ language, code, fnName: problem.fn[language], inputs: problem.examples.map(e => e.args), onStatus: setStatus });
        setStatus('');
        setLogs(r.logs);
        setExampleResults({
            compileError: r.compileError,
            items: problem.examples.map((ex, i) => {
                const o = r.outputs[i];
                let got;
                let pass = false;
                if (o?.ok) {
                    try { got = JSON.parse(o.value); pass = matches(problem.compare, got, ex.expected); } catch { got = o.value; }
                }
                return { args: ex.args, expected: ex.expected, got, error: o?.ok ? null : o?.error, pass, ms: o?.ms };
            })
        });
        setBusy('');
    }, [problem, busy, language, code]);

    const submit = useCallback(async () => {
        if (!problem || !inputs || busy || !running || me?.solved) return;
        setBusy('submit');
        setPanel('results');
        setStatus('Running the hidden tests…');
        const r = await runner.current.run({ language, code, fnName: problem.fn[language], inputs, onStatus: setStatus });
        setLogs(r.logs);
        if (r.compileError) {
            setSubmitResult({ compileError: r.compileError });
            setStatus('');
            setBusy('');
            return;
        }
        setStatus('Judging…');
        const res = await emit('battle:submit', { matchId, language, code, outputs: r.outputs });
        setStatus('');
        setSubmitResult(res?.ok ? res : { error: res?.error || 'Submission failed' });
        setBusy('');
    }, [problem, inputs, busy, running, me, language, code, matchId]);

    // Ctrl+Enter: run examples · Ctrl+Shift+Enter: submit
    useEffect(() => {
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
            e.preventDefault();
            if (e.shiftKey) submit(); else runExamples();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit, runExamples]);

    const forfeit = () => {
        const msg = state?.status === 'waiting' ? 'Cancel this invite?' : practice ? 'Stop practicing this problem?' : 'Give up? Your opponent wins.';
        if (window.confirm(msg)) socket.emit('battle:forfeit', { matchId });
    };

    const inviteUrl = state?.code ? `${window.location.origin}${window.location.pathname}#/battle/join/${state.code}` : '';
    const resultView = useMemo(() => {
        if (!ended) return null;
        const mine = ended.players.find(p => p.userId === myId);
        const theirs = ended.players.find(p => p.userId !== myId);
        let title;
        let tone;
        if (ended.result === 'solved') { title = 'Solved!'; tone = 'win'; }
        else if (ended.result === 'unsolved') { title = 'Practice ended'; tone = 'draw'; }
        else if (ended.result === 'draw') { title = 'Draw'; tone = 'draw'; }
        else if (ended.result === 'no-contest') { title = 'No contest'; tone = 'draw'; }
        else if (ended.winner === myId) { title = 'Victory'; tone = 'win'; }
        else { title = 'Defeat'; tone = 'loss'; }
        const delta = mine && ended.rated ? mine.ratingAfter - mine.ratingBefore : 0;
        return { title, tone, mine, theirs, delta };
    }, [ended, myId]);

    if (error) {
        return (
            <div className="bt-page bt-center">
                <div className="bt-card" style={{ maxWidth: 440, textAlign: 'center' }}>
                    <h2>Battle unavailable</h2>
                    <p className="bt-muted">{error}</p>
                    <Link className="bt-btn primary" to="/battle">Back to the lobby</Link>
                </div>
            </div>
        );
    }
    if (!state || !problem) return <div className="bt-page bt-center"><p className="bt-muted">Loading the battle…</p></div>;

    // Friend invite not accepted yet
    if (state.status === 'waiting') {
        return (
            <div className="bt-page bt-center">
                <div className="bt-card bt-waiting">
                    <span className="bt-spinner big" aria-hidden="true" />
                    <h2>Waiting for your friend…</h2>
                    <p className="bt-muted">Send them this link. The battle starts as soon as they open it ({problem.difficulty} problem).</p>
                    <div className="bt-invite">
                        <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                        <button className="bt-btn primary" onClick={() => { navigator.clipboard?.writeText(inviteUrl); setCopied(true); }}>{copied ? '✓ Copied' : 'Copy link'}</button>
                    </div>
                    <button className="bt-btn" onClick={forfeit}>Cancel invite</button>
                </div>
            </div>
        );
    }

    const countdown = state.status === 'countdown' ? Math.ceil((state.startsAt - now) / 1000) : 0;
    const timeLeft = state.endsAt ? state.endsAt - now : null;
    const elapsed = state.startsAt ? now - state.startsAt : 0;

    return (
        <div className="bt-arena">
            <div className="bt-topbar">
                <Link to="/battle" className="bt-back" title="Battle lobby">←</Link>
                <div className="bt-title">
                    <span className={`bt-diff ${problem.difficulty}`}>{problem.difficulty}</span>
                    <b>{problem.title}</b>
                    <span className="bt-muted">{practice ? 'Practice' : state.mode === 'ranked' ? 'Ranked' : 'Friendly'}</span>
                </div>
                <div className={`bt-clock ${timeLeft != null && timeLeft < 60000 ? 'low' : ''}`} aria-live="off">
                    {timeLeft != null ? clock(timeLeft) : clock(elapsed)}
                </div>
                {!ended && state.result && <button className="bt-btn" onClick={() => setEnded({ matchId, ...state.result })}>Show result</button>}
                {!ended && !state.result && state.status !== 'verifying' && <button className="bt-btn ghost" onClick={forfeit}>{practice ? 'Stop' : 'Give up'}</button>}
            </div>

            <div className="bt-race">
                <RaceBar player={me} total={total} isMe />
                {!practice && <RaceBar player={opponent} total={total} typing={opponentTyping} />}
            </div>

            <div className="bt-body">
                <article className="bt-statement">
                    <ReactMarkdown>{problem.statement}</ReactMarkdown>
                    <div className="bt-sig">
                        <code>{language === 'python' ? `${problem.fn.python}(${problem.params.map(p => p.name).join(', ')})` : `${problem.fn.javascript}(${problem.params.map(p => p.name).join(', ')})`}</code>
                        <span className="bt-muted"> → {problem.returns}</span>
                    </div>
                    <h3>Examples</h3>
                    {problem.examples.map((ex, i) => (
                        <pre key={i} className="bt-example">
                            <span className="bt-muted">Input: </span>{showArgs(problem.params, ex.args)}{'\n'}
                            <span className="bt-muted">Output: </span>{show(ex.expected)}
                        </pre>
                    ))}
                    <p className="bt-muted bt-small">
                        Your code is checked against {total} hidden tests, including edge cases. A new set is generated every battle.
                        {problem.compare === 'sorted' && ' The order of the returned items doesn\'t matter.'}
                        {problem.compare === 'groups' && ' Groups and the words inside them can be in any order.'}
                        {problem.compare === 'float' && ' Answers within 1e-6 are accepted.'}
                    </p>
                    <div className="bt-tags">{problem.tags.map(t => <span key={t}>{t}</span>)}</div>
                </article>

                <section className="bt-workspace">
                    <div className="bt-toolbar">
                        <select value={language} onChange={(e) => changeLanguage(e.target.value)} aria-label="Language" disabled={!!busy}>
                            {LANGS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                        <button className="bt-btn ghost" onClick={() => { if (window.confirm('Reset your code to the starter template?')) onEdit(problem.starter[language]); }}>Reset</button>
                        <span className="bt-status">{status}</span>
                        <button className="bt-btn" onClick={runExamples} disabled={!!busy} title="Ctrl+Enter">{busy === 'examples' ? 'Running…' : '▶ Run examples'}</button>
                        <button className="bt-btn primary" onClick={submit} disabled={!!busy || !running || me?.solved} title="Ctrl+Shift+Enter">{busy === 'submit' ? 'Submitting…' : me?.solved ? '✓ Solved' : 'Submit'}</button>
                    </div>
                    <div className="bt-editor">
                        <Editor
                            height="100%"
                            language={language}
                            value={code}
                            onChange={onEdit}
                            theme="vs-dark"
                            options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 4, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 10 } }}
                        />
                    </div>
                    <div className="bt-output">
                        <div className="bt-tabs" role="tablist">
                            <button role="tab" aria-selected={panel === 'results'} className={panel === 'results' ? 'active' : ''} onClick={() => setPanel('results')}>Results</button>
                            <button role="tab" aria-selected={panel === 'console'} className={panel === 'console' ? 'active' : ''} onClick={() => setPanel('console')}>Console{logs.length ? ` (${logs.length})` : ''}</button>
                        </div>
                        {panel === 'console' ? (
                            <pre className="bt-console">{logs.length ? logs.join('\n') : 'print() / console.log() output from your last run shows up here.'}</pre>
                        ) : (
                            <div className="bt-results">
                                {submitResult && (
                                    <div className={`bt-verdict ${submitResult.solved ? 'ok' : 'bad'}`}>
                                        {submitResult.error && <span>✕ {submitResult.error}</span>}
                                        {submitResult.compileError && <span>✕ {submitResult.compileError}</span>}
                                        {submitResult.ok && (
                                            <>
                                                <b>{submitResult.solved ? '✓ All hidden tests passed!' : `${submitResult.passed}/${submitResult.total} hidden tests passed`}</b>
                                                {submitResult.firstFail && (
                                                    <div className="bt-fail">
                                                        <div><span className="bt-muted">First failing test #{submitResult.firstFail.index + 1}: </span>{submitResult.firstFail.reason}</div>
                                                        <div className="mono"><span className="bt-muted">Input: </span>{showArgs(problem.params, submitResult.firstFail.args)}</div>
                                                        {submitResult.firstFail.output != null && <div className="mono"><span className="bt-muted">Your output: </span>{submitResult.firstFail.output.slice(0, 300)}</div>}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                                {exampleResults?.compileError && <div className="bt-verdict bad">✕ {exampleResults.compileError}</div>}
                                {exampleResults && !exampleResults.compileError && exampleResults.items.map((r, i) => (
                                    <div key={i} className={`bt-case ${r.pass ? 'ok' : 'bad'}`}>
                                        <b>{r.pass ? '✓' : '✕'} Example {i + 1}</b>{r.ms != null && <span className="bt-muted"> · {r.ms} ms</span>}
                                        <div className="mono"><span className="bt-muted">Input: </span>{showArgs(problem.params, r.args)}</div>
                                        <div className="mono"><span className="bt-muted">Expected: </span>{show(r.expected)}</div>
                                        <div className="mono"><span className="bt-muted">Got: </span>{r.error ? <span className="err">{r.error}</span> : show(r.got)}</div>
                                    </div>
                                ))}
                                {!exampleResults && !submitResult && <p className="bt-muted">Run the examples to check your code, then Submit to run the hidden tests.</p>}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {state.status === 'countdown' && (
                <div className="bt-overlay">
                    <div className="bt-countdown" key={countdown}>{countdown > 0 ? countdown : 'Go!'}</div>
                    {!practice && opponent && <p>{me?.username || 'You'} vs {opponent.username}</p>}
                </div>
            )}

            {state.status === 'verifying' && !ended && (
                <div className="bt-overlay">
                    <span className="bt-spinner big" aria-hidden="true" />
                    <h2>Checking results…</h2>
                    <p className="bt-muted">Each player's browser re-runs the other's final code to confirm the score.</p>
                </div>
            )}

            {resultView && (
                <div className="bt-overlay">
                    <div className={`bt-result ${resultView.tone}`}>
                        <div className="bt-result-title">{resultView.title}</div>
                        <p className="bt-muted">
                            {ended.result === 'solved' && resultView.mine?.solvedMs != null ? `Solved in ${clock(resultView.mine.solvedMs)}` : ended.reason}
                        </p>
                        {ended.rated && (
                            <div className={`bt-delta ${resultView.delta >= 0 ? 'up' : 'down'}`}>
                                {resultView.mine.ratingBefore} → <b>{resultView.mine.ratingAfter}</b> ({resultView.delta >= 0 ? '+' : ''}{resultView.delta})
                            </div>
                        )}
                        <table className="bt-score">
                            <tbody>
                                {[resultView.mine, resultView.theirs].filter(Boolean).map(p => (
                                    <tr key={p.userId}>
                                        <td>{p.userId === myId ? 'You' : p.username}</td>
                                        <td>{p.passed}/{ended.total} tests</td>
                                        <td>{p.solvedMs != null ? clock(p.solvedMs) : '—'}</td>
                                        <td>{p.verified === true ? <span className="bt-tag ok" title="Re-run by the other player's browser">verified</span> : p.verified === false ? <span className="bt-tag warn">mismatch</span> : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="bt-result-actions">
                            {!practice && opponent && (
                                <button className="bt-btn primary" onClick={() => emit('battle:rematch', { matchId })} disabled={rematch.includes(myId)}>
                                    {rematch.includes(myId) ? 'Waiting for opponent…' : rematch.length ? `${opponent.username} wants a rematch: accept` : 'Rematch'}
                                </button>
                            )}
                            <Link className="bt-btn" to="/battle">Back to lobby</Link>
                            <button className="bt-btn ghost" onClick={() => setEnded(null)}>Review my code</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BattleArena;
