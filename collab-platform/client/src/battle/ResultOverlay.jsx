import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { emit, clock } from './useMatch';

const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

/** The end-of-battle card, for every mode. */
export default function ResultOverlay({ ended, state, myId, rematch, onClose }) {
    const [showSolution, setShowSolution] = useState(false);
    const engine = state.engine;
    const solo = ['practice', 'daily'].includes(state.mode);
    const mine = ended.players.find(p => p.userId === myId);
    const theirs = ended.players.find(p => p.userId !== myId);
    const opponent = state.players.find(p => p.userId !== myId);

    let title;
    let tone;
    if (ended.result === 'finished') { title = state.mode === 'daily' ? 'Daily done!' : 'Finished'; tone = 'win'; }
    else if (ended.result === 'solved') { title = 'Solved!'; tone = 'win'; }
    else if (ended.result === 'unsolved') { title = 'Practice ended'; tone = 'draw'; }
    else if (ended.result === 'draw') { title = 'Draw'; tone = 'draw'; }
    else if (ended.result === 'no-contest') { title = 'No contest'; tone = 'draw'; }
    else if (ended.winner === myId) { title = 'Victory'; tone = 'win'; }
    else { title = 'Defeat'; tone = 'loss'; }
    const delta = mine && ended.rated ? mine.ratingAfter - mine.ratingBefore : 0;

    const scoreCell = (p) => {
        if (engine === 'code') return `${p.passed}/${ended.total} tests`;
        if (engine === 'css') return `${p.score}% match`;
        if (state.kind === 'guessr' && !solo) return `${fmt(p.hp)} HP`;
        return `${fmt(p.score)} pts`;
    };

    let subtitle = ended.reason;
    if (ended.result === 'solved' && mine?.solvedMs != null) subtitle = `Solved in ${clock(mine.solvedMs)}`;
    if (state.mode === 'daily' && ended.daily) {
        subtitle = ended.daily.counted
            ? `${fmt(ended.daily.score)} points · #${ended.daily.rank} today · 🔥 ${ended.daily.streak}-day streak`
            : `${fmt(ended.daily.score)} points (you already played today, so this one isn't on the board)`;
    }

    return (
        <div className="bt-overlay">
            <div className={`bt-result ${tone}`}>
                <div className="bt-result-title">{title}</div>
                <p className="bt-muted">{subtitle}</p>
                {ended.rated && (
                    <div className={`bt-delta ${delta >= 0 ? 'up' : 'down'}`}>
                        {mine.ratingBefore} → <b>{mine.ratingAfter}</b> ({delta >= 0 ? '+' : ''}{delta})
                    </div>
                )}
                <table className="bt-score">
                    <tbody>
                        {[mine, theirs].filter(Boolean).map(p => (
                            <tr key={p.userId}>
                                <td>{p.userId === myId ? 'You' : p.username}</td>
                                <td>{scoreCell(p)}</td>
                                {engine !== 'rounds' && <td>{p.solvedMs != null ? clock(p.solvedMs) : '—'}</td>}
                                <td>{p.verified === true ? <span className="bt-tag ok" title="Re-checked on the other player's computer">verified</span> : p.verified === false ? <span className="bt-tag warn">mismatch</span> : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {engine === 'rounds' && state.history?.length > 0 && (
                    <div className="bt-rounds-summary">
                        {state.history.map(h => {
                            const r = h.results.find(x => x.userId === myId);
                            return (
                                <span key={h.index} className="bt-round-chip" title={`Round ${h.index + 1}: ${h.type}`}>
                                    {{ language: '🗺️', bug: '🐞', estimate: '🔢', quiz: '❓' }[h.type]} {fmt(r?.score)}
                                </span>
                            );
                        })}
                    </div>
                )}

                {ended.solution && (
                    <div className="bt-solution">
                        <button className="bt-btn ghost" onClick={() => setShowSolution(s => !s)}>{showSolution ? 'Hide' : 'Show'} a reference solution</button>
                        {showSolution && <pre>{ended.solution}</pre>}
                    </div>
                )}

                <div className="bt-result-actions">
                    {!solo && opponent && (
                        <button className="bt-btn primary" onClick={() => emit('battle:rematch', { matchId: state.matchId })} disabled={rematch.includes(myId)}>
                            {rematch.includes(myId) ? 'Waiting for opponent…' : rematch.length ? `${opponent.username} wants a rematch: accept` : 'Rematch'}
                        </button>
                    )}
                    <Link className="bt-btn" to="/battle">Back to lobby</Link>
                    <button className="bt-btn ghost" onClick={onClose}>{engine === 'rounds' ? 'See the rounds' : 'Review my work'}</button>
                </div>
            </div>
        </div>
    );
}
