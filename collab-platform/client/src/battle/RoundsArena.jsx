// battle/RoundsArena.jsx — CodeGuessr (Language Map, Bug Locator, Output Estimate) and skill quizzes.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { socket } from '../socket';
import { emit, clock } from './useMatch';
import LanguageMap from './LanguageMap';

const START_HP = 6000;
const TYPE_INFO = {
    language: { icon: '🗺️', name: 'Language Map', ask: 'Which language is this? Drop a pin on the map.' },
    bug: { icon: '🐞', name: 'Bug Locator', ask: 'Click the line that causes this.' },
    estimate: { icon: '🔢', name: 'Output Estimate', ask: 'What number does this print? Get close.' },
    quiz: { icon: '❓', name: 'Quiz', ask: '' }
};
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

/** Text with `inline code` spans. */
const Inline = ({ text }) => String(text).split(/(`[^`]+`)/).map((part, i) => (
    part.startsWith('`') && part.endsWith('`') && part.length > 1 ? <code key={i} className="bt-inline-code">{part.slice(1, -1)}</code> : part
));

function HpBar({ player, isMe }) {
    if (!player) return null;
    const pct = Math.max(0, Math.min(100, (player.hp / START_HP) * 100));
    return (
        <div className={`bt-hp ${isMe ? 'me' : ''}`}>
            <div className="bt-hp-head">
                <b>{isMe ? 'You' : player.username}</b>
                <span className="bt-muted">{player.rating}</span>
                {!player.connected && <span className="bt-tag warn">disconnected</span>}
                <span className="bt-hp-num">{fmt(player.hp)} HP</span>
            </div>
            <div className="bt-hp-track"><div className={`bt-hp-fill ${pct < 30 ? 'low' : ''}`} style={{ width: `${pct}%` }} /></div>
        </div>
    );
}

function PointsBar({ player, isMe }) {
    if (!player) return null;
    return (
        <div className={`bt-points ${isMe ? 'me' : ''}`}>
            <b>{isMe ? 'You' : player.username}</b>
            {!player.connected && <span className="bt-tag warn">disconnected</span>}
            <span className="bt-points-num">{fmt(player.score)}</span>
        </div>
    );
}

/** Log-scale slider (1 … 10,000,000) plus a number box. */
function EstimateInput({ value, onChange, disabled }) {
    const toSlider = (v) => Math.log10(Math.max(1, v));
    return (
        <div className="bt-estimate">
            <input
                type="range" min="0" max="7" step="0.01"
                value={toSlider(value)}
                onChange={(e) => onChange(Math.max(1, Math.round(10 ** Number(e.target.value))))}
                disabled={disabled}
                aria-label="Your estimate (log scale)"
            />
            <div className="bt-estimate-scale"><span>1</span><span>10</span><span>100</span><span>1k</span><span>10k</span><span>100k</span><span>1M</span><span>10M</span></div>
            <label className="bt-estimate-box">
                Your guess
                <input type="number" min="1" value={value} disabled={disabled} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} />
            </label>
        </div>
    );
}

function CodeLines({ code, selected, onPick, disabled, answerLines, theirLine }) {
    return (
        <pre className={`bt-lines ${disabled ? 'locked' : ''}`}>
            {code.split('\n').map((text, i) => {
                const n = i + 1;
                const cls = [
                    answerLines?.includes(n) && 'answer',
                    selected === n && 'mine',
                    theirLine === n && 'theirs'
                ].filter(Boolean).join(' ');
                return (
                    <div
                        key={n}
                        className={`bt-line ${cls}`}
                        onClick={() => !disabled && onPick(n)}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(n); } }}
                        aria-label={`Line ${n}`}
                    >
                        <span className="bt-ln">{n}</span>
                        <span className="bt-lt">{text || ' '}</span>
                    </div>
                );
            })}
        </pre>
    );
}

export default function RoundsArena({ m, myId }) {
    const { state, now } = m;
    const prompt = state.prompt;
    const solo = ['practice', 'daily'].includes(state.mode);
    const me = state.players.find(p => p.userId === myId);
    const opponent = state.players.find(p => p.userId !== myId);
    const round = state.round;
    const reveal = state.reveal && prompt && state.reveal.index === prompt.index ? state.reveal : null;
    const [draft, setDraft] = useState(null);
    const [locked, setLocked] = useState(null);
    const [error, setError] = useState('');

    // New round: reset the draft (keep a guess the server already has, after a reload)
    useEffect(() => {
        setLocked(state.myGuess || null);
        setDraft(prompt?.type === 'estimate' ? { value: 100 } : null);
        setError('');
    }, [prompt?.index]); // eslint-disable-line react-hooks/exhaustive-deps

    const lockIn = async (guess = draft) => {
        if (!guess || locked || reveal) return;
        const res = await emit('battle:guess', { matchId: state.matchId, round: prompt.index, guess });
        if (res?.ok) { setLocked(guess); setError(''); } else setError(res?.error || 'Could not lock in');
    };

    // Enter locks in
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Enter' && !e.target.closest?.('input[type="number"]') && draft && !locked && !reveal) lockIn();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const timeLeft = round && !round.revealed ? round.endsAt - now : null;
    const opponentLocked = opponent && round?.guessed?.includes(opponent.userId) && !reveal;
    const info = TYPE_INFO[prompt?.type] || TYPE_INFO.quiz;
    const myResult = reveal?.results.find(r => r.userId === myId);
    const theirResult = reveal?.results.find(r => r.userId !== myId);

    const summary = useMemo(() => {
        if (!reveal) return null;
        const a = reveal.answer;
        if (reveal.type === 'language') return <>It was <b>{a.name}</b> ({a.region}).</>;
        if (reveal.type === 'bug') return <>The bug is on line <b>{a.lines.join(', ')}</b>. {a.explain}</>;
        if (reveal.type === 'estimate') return <>The answer is <b>{fmt(a.value)}</b>. {a.explain}</>;
        return <Inline text={a.explain} />;
    }, [reveal]);

    const detailFor = (r) => {
        if (!r?.guess) return 'no guess';
        if (reveal.type === 'language') return `${fmt(r.detail?.km)} km off${r.detail?.near ? ` (near ${r.detail.near})` : ''}`;
        if (reveal.type === 'bug') return r.detail?.off ? `${r.detail.off} line${r.detail.off === 1 ? '' : 's'} off` : 'exact line!';
        if (reveal.type === 'estimate') return `guessed ${fmt(r.guess.value)}`;
        return r.detail?.right ? 'right' : 'wrong';
    };

    if (!prompt) {
        return <div className="bt-rounds-wait"><span className="bt-spinner big" aria-hidden="true" /><p className="bt-muted">Get ready…</p></div>;
    }

    return (
        <div className="bt-rounds">
            <div className="bt-rounds-top">
                {state.kind === 'guessr' && !solo ? (
                    <>
                        <HpBar player={me} isMe />
                        <div className="bt-vs">VS</div>
                        <HpBar player={opponent} />
                    </>
                ) : (
                    <>
                        <PointsBar player={me} isMe />
                        {!solo && <div className="bt-vs">VS</div>}
                        {!solo && <PointsBar player={opponent} />}
                    </>
                )}
            </div>

            <div className="bt-round-head">
                <span className="bt-round-type">{info.icon} {info.name}</span>
                <span className="bt-muted">Round {prompt.index + 1}{state.kind === 'quiz' || solo ? ` / ${state.total}` : ''}</span>
                {round?.multiplier > 1 && <span className="bt-mult" title="Damage multiplier this round">×{round.multiplier} damage</span>}
                <span className="bt-flex" />
                {opponentLocked && <span className="bt-locked-them">🔒 {opponent.username} locked in</span>}
                {timeLeft != null && <span className={`bt-round-clock ${timeLeft < 10000 ? 'low' : ''}`}>{clock(timeLeft)}</span>}
            </div>

            {prompt.type === 'quiz' ? (
                <div className="bt-quiz">
                    <h2 className="bt-quiz-q"><Inline text={prompt.q} /></h2>
                    {prompt.code && <pre className="bt-code">{prompt.code}</pre>}
                    <div className="bt-options">
                        {prompt.options.map((o, i) => {
                            const right = reveal && reveal.answer.index === i;
                            const mine = (locked?.index ?? myResult?.guess?.index) === i;
                            const theirs = theirResult?.guess?.index === i;
                            return (
                                <button
                                    key={i}
                                    className={`bt-option ${right ? 'right' : ''} ${mine ? 'mine' : ''} ${reveal && mine && !right ? 'wrong' : ''}`}
                                    onClick={() => lockIn({ index: i })}
                                    disabled={!!locked || !!reveal}
                                >
                                    <span className="bt-option-key">{'ABCD'[i]}</span>
                                    <span><Inline text={o} /></span>
                                    {reveal && theirs && opponent && <span className="bt-option-them">{opponent.username}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className={`bt-guess bt-guess-${prompt.type}`}>
                    <div className="bt-guess-prompt">
                        <p className="bt-ask">{info.ask}</p>
                        {prompt.type === 'bug' && <pre className="bt-error">{prompt.error}</pre>}
                        {prompt.type === 'bug' ? (
                            <CodeLines
                                code={prompt.code}
                                selected={locked?.line ?? draft?.line ?? myResult?.guess?.line}
                                onPick={(line) => setDraft({ line })}
                                disabled={!!locked || !!reveal}
                                answerLines={reveal?.answer.lines}
                                theirLine={theirResult?.guess?.line}
                            />
                        ) : (
                            <pre className="bt-code">{prompt.code}</pre>
                        )}
                        {prompt.type === 'estimate' && (
                            <EstimateInput value={(locked || draft)?.value ?? 100} onChange={(value) => setDraft({ value })} disabled={!!locked || !!reveal} />
                        )}
                    </div>
                    {prompt.type === 'language' && (
                        <div className="bt-guess-map">
                            <LanguageMap
                                map={state.map}
                                guess={locked || draft}
                                onPick={(p) => setDraft(p)}
                                disabled={!!locked || !!reveal}
                                reveal={reveal}
                                myId={myId}
                                opponentName={opponent?.username}
                            />
                        </div>
                    )}
                </div>
            )}

            {!reveal && prompt.type !== 'quiz' && (
                <div className="bt-lock">
                    {error && <span className="err">{error}</span>}
                    {locked ? (
                        <span className="bt-muted">🔒 Locked in. {solo ? '' : opponent && !opponentLocked ? `Waiting for ${opponent.username}…` : ''}</span>
                    ) : (
                        <button className="bt-btn primary big-inline" disabled={!draft} onClick={() => lockIn()}>
                            {draft ? 'Lock in (Enter)' : prompt.type === 'language' ? 'Click the map to guess' : prompt.type === 'bug' ? 'Click a line to guess' : 'Lock in'}
                        </button>
                    )}
                </div>
            )}
            {!reveal && prompt.type === 'quiz' && locked && <div className="bt-lock"><span className="bt-muted">🔒 Answer locked in{opponent && !opponentLocked ? `, waiting for ${opponent.username}…` : '.'}</span></div>}

            {reveal && (
                <div className="bt-reveal">
                    <p className="bt-reveal-answer">{summary}</p>
                    {reveal.prompt?.questionId && <ReportLink id={reveal.prompt.questionId} />}
                    <div className="bt-reveal-scores">
                        {[myResult, theirResult].filter(Boolean).map(r => (
                            <div key={r.userId} className={`bt-reveal-score ${r.userId === myId ? 'me' : ''}`}>
                                <b>{r.userId === myId ? 'You' : opponent?.username}</b>
                                <span className="bt-reveal-pts">+{fmt(r.score)}</span>
                                <span className="bt-muted">{detailFor(r)}</span>
                                {r.damage > 0 && <span className="bt-damage">−{fmt(r.damage)} HP</span>}
                            </div>
                        ))}
                    </div>
                    {solo
                        ? (prompt.index + 1 < state.total && <button className="bt-btn primary" onClick={() => socket.emit('battle:next', { matchId: state.matchId })}>Next round →</button>)
                        : <span className="bt-muted bt-small">Next round in a few seconds…</span>}
                </div>
            )}
        </div>
    );
}

/** 🚩 Flag a quiz question as wrong or unclear (3 reports pull it for review). */
function ReportLink({ id }) {
    const [state, setState] = useState('');
    useEffect(() => setState(''), [id]);
    const send = async () => {
        const reason = window.prompt("What's wrong with this question? (optional)");
        if (reason === null) return;
        setState('sending');
        try {
            await axios.post(`/api/questions/${id}/report`, { reason });
            setState('done');
        } catch {
            setState('');
        }
    };
    return (
        <button type="button" className="bt-report" onClick={send} disabled={!!state}>
            {state === 'done' ? '🚩 Reported, thanks!' : state ? '🚩 Sending…' : '🚩 Wrong or unclear question?'}
        </button>
    );
}
