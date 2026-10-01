// battle/CodeArena.jsx — dev tasks, debug races and algorithm battles: statement, editor, tests.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { socket } from '../socket';
import { createRunner } from './runner';
import { matches } from './compare';
import { emit } from './useMatch';

const LANG_LABEL = { python: 'Python', javascript: 'JavaScript', sql: 'SQL (SQLite)' };

const show = (v) => {
    const text = JSON.stringify(v);
    return text && text.length > 300 ? `${text.slice(0, 300)}…` : text;
};
const showArgs = (problem, args) => (problem.type === 'sql' || !args ? 'the sample tables above' : problem.params.map((p, i) => `${p.name} = ${show(args[i])}`).join(', '));

const storeKey = (matchId, lang) => `ss-battle-${matchId}-${lang}`;
const loadCode = (matchId, lang, fallback) => { try { return localStorage.getItem(storeKey(matchId, lang)) ?? fallback; } catch { return fallback; } };
const saveCode = (matchId, lang, code) => { try { localStorage.setItem(storeKey(matchId, lang), code); } catch { /* storage full/blocked */ } };

export function RaceBar({ player, total, isMe, typing, label }) {
    if (!player) return <div className="bt-racer empty"><span className="bt-muted">Waiting for an opponent…</span></div>;
    const value = label ? player.score : player.passed;
    const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
    return (
        <div className={`bt-racer ${isMe ? 'me' : ''}`}>
            <div className="bt-racer-head">
                <b>{isMe ? 'You' : player.username}</b>
                <span className="bt-muted">{player.rating}</span>
                {player.language && <span className="bt-muted">{LANG_LABEL[player.language] || player.language}</span>}
                {!player.connected && <span className="bt-tag warn">disconnected</span>}
                {player.forfeited && <span className="bt-tag warn">gave up</span>}
                {player.solved && <span className="bt-tag ok">✓ solved</span>}
                {!isMe && typing && !player.solved && <span className="bt-typing">typing<i>.</i><i>.</i><i>.</i></span>}
                <span className="bt-racer-score">{label ? `${value}%` : `${value}/${total}`}</span>
            </div>
            <div className="bt-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={`${isMe ? 'Your' : `${player.username}'s`} progress`}>
                <div className="bt-fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function SampleTables({ tables }) {
    return (
        <div className="bt-tables">
            {tables.map(t => (
                <div key={t.name} className="bt-table-wrap">
                    <div className="bt-table-name">{t.name}</div>
                    <table className="bt-data">
                        <thead><tr>{t.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                            {t.rows.slice(0, 8).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? 'NULL' : String(v)}</td>)}</tr>)}
                        </tbody>
                    </table>
                    {t.rows.length > 8 && <div className="bt-muted bt-small">… {t.rows.length - 8} more rows</div>}
                </div>
            ))}
        </div>
    );
}

export default function CodeArena({ m, myId }) {
    const { state } = m;
    const problem = state.problem;
    const inputs = state.inputs;
    const matchId = state.matchId;
    const languages = problem.languages;
    const [language, setLanguage] = useState(() => {
        try {
            const saved = localStorage.getItem('ss-battle-lang');
            return languages.includes(saved) ? saved : languages[0];
        } catch { return languages[0]; }
    });
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState('');
    const [status, setStatus] = useState('');
    const [panel, setPanel] = useState('results');
    const [exampleResults, setExampleResults] = useState(null);
    const [submitResult, setSubmitResult] = useState(null);
    const [logs, setLogs] = useState([]);
    const runner = useRef(null);
    const lastTyping = useRef(0);
    runner.current ??= createRunner();
    useEffect(() => () => runner.current?.dispose(), []);

    const me = state.players.find(p => p.userId === myId);
    const opponent = state.players.find(p => p.userId !== myId);
    const running = state.status === 'running';
    const practice = ['practice', 'daily'].includes(state.mode);

    useEffect(() => {
        setCode(loadCode(matchId, language, problem.starter[language] || ''));
        runner.current.warm(language);
    }, [problem, language, matchId]);

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

    const runOpts = { language, code, fnName: problem.fn[language], harness: problem.harness, schema: problem.schema, onStatus: setStatus };

    const runExamples = useCallback(async () => {
        if (busy) return;
        setBusy('examples');
        setPanel('results');
        setStatus('');
        const r = await runner.current.run({ ...runOpts, inputs: problem.examples.map(e => e.args) });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy, language, code, problem]);

    const submit = useCallback(async () => {
        if (!inputs || busy || !running || me?.solved) return;
        setBusy('submit');
        setPanel('results');
        setStatus('Running the hidden tests…');
        const r = await runner.current.run({ ...runOpts, inputs });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputs, busy, running, me, language, code, matchId]);

    useEffect(() => {
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
            e.preventDefault();
            if (e.shiftKey) submit(); else runExamples();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit, runExamples]);

    const signature = problem.type === 'sql'
        ? 'Write one SELECT query'
        : problem.type === 'handler'
            ? 'function handler(req, res, db)'
            : `${problem.fn[language] || problem.fn[languages[0]]}(${problem.params.map(p => p.name).join(', ')}) → ${problem.returns}`;

    return (
        <>
            <div className="bt-race">
                <RaceBar player={me} total={state.total} isMe />
                {!practice && <RaceBar player={opponent} total={state.total} typing={Date.now() - m.typingAt < 2500} />}
            </div>
            <div className="bt-body">
                <article className="bt-statement">
                    {problem.bugs && <div className="bt-bug-banner">🐛 {problem.bugs} bug{problem.bugs === 1 ? '' : 's'} hidden in the starter code</div>}
                    <ReactMarkdown>{problem.statement}</ReactMarkdown>
                    <div className="bt-sig"><code>{signature}</code></div>
                    {problem.type === 'sql' && (
                        <>
                            <h3>Tables</h3>
                            <pre className="bt-example">{problem.schema}</pre>
                            <h3>Sample data</h3>
                            <SampleTables tables={problem.sample.tables} />
                            <h3>Expected output for the sample</h3>
                            <pre className="bt-example">{problem.examples[0].expected.map(r => r.join(' | ')).join('\n') || '(no rows)'}</pre>
                        </>
                    )}
                    {problem.type !== 'sql' && (
                        <>
                            <h3>Examples</h3>
                            {problem.examples.map((ex, i) => (
                                <pre key={i} className="bt-example">
                                    <span className="bt-muted">Input: </span>{showArgs(problem, ex.args)}{'\n'}
                                    <span className="bt-muted">Output: </span>{show(ex.expected)}
                                </pre>
                            ))}
                        </>
                    )}
                    <p className="bt-muted bt-small">
                        Checked against {state.total} hidden tests{problem.type === 'sql' ? ', each on a different random database' : ', including edge cases'}. A new set is generated every battle.
                        {problem.compare === 'sorted' && ' The order of the returned items doesn\'t matter.'}
                        {problem.compare === 'groups' && ' Groups and the words inside them can be in any order.'}
                        {problem.compare === 'float' && ' Answers within 1e-6 are accepted.'}
                    </p>
                    <div className="bt-tags">{problem.tags.map(t => <span key={t}>{t}</span>)}</div>
                </article>

                <section className="bt-workspace">
                    <div className="bt-toolbar">
                        {languages.length > 1 ? (
                            <select value={language} onChange={(e) => changeLanguage(e.target.value)} aria-label="Language" disabled={!!busy}>
                                {languages.map(id => <option key={id} value={id}>{LANG_LABEL[id]}</option>)}
                            </select>
                        ) : <span className="bt-lang-label">{LANG_LABEL[language]}</span>}
                        <button className="bt-btn ghost" onClick={() => { if (window.confirm('Reset your code to the starting code?')) onEdit(problem.starter[language]); }}>Reset</button>
                        <span className="bt-status">{status}</span>
                        <button className="bt-btn" onClick={runExamples} disabled={!!busy} title="Ctrl+Enter">{busy === 'examples' ? 'Running…' : problem.type === 'sql' ? '▶ Run on sample' : '▶ Run examples'}</button>
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
                                                        {submitResult.firstFail.args
                                                            ? <div className="mono"><span className="bt-muted">Input: </span>{showArgs(problem, submitResult.firstFail.args)}</div>
                                                            : <div className="bt-muted">(it uses a different random database than the sample)</div>}
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
                                        <b>{r.pass ? '✓' : '✕'} {problem.type === 'sql' ? 'Sample' : `Example ${i + 1}`}</b>{r.ms != null && <span className="bt-muted"> · {r.ms} ms</span>}
                                        {problem.type !== 'sql' && <div className="mono"><span className="bt-muted">Input: </span>{showArgs(problem, r.args)}</div>}
                                        <div className="mono"><span className="bt-muted">Expected: </span>{show(r.expected)}</div>
                                        <div className="mono"><span className="bt-muted">Got: </span>{r.error ? <span className="err">{r.error}</span> : show(r.got)}</div>
                                    </div>
                                ))}
                                {!exampleResults && !submitResult && <p className="bt-muted">{problem.type === 'sql' ? 'Run on the sample data first, then Submit to run the hidden databases.' : 'Run the examples to check your code, then Submit to run the hidden tests.'}</p>}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
