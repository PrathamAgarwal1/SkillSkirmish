// pages/BattlePage.jsx — the battle lobby: ranked queue, challenge a friend, practice, leaderboard.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import '../battle/battle.css';

const DIFFS = [['any', 'Any'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const RESULT_LABEL = { win: 'Win', draw: 'Draw', 'no-contest': 'No contest', solved: 'Solved', unsolved: 'Unsolved' };

const emit = (event, payload) => new Promise((resolve) => {
    socket.timeout(15000).emit(event, payload, (err, res) => resolve(err ? { error: "Couldn't reach the server. Try again." } : res));
});

const fmtWait = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function BattleJoin() {
    const { code } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        const join = async () => {
            const res = await emit('battle:join-friend', { code });
            if (cancelled) return;
            if (res?.ok) navigate(`/battle/m/${res.matchId}`, { replace: true });
            else if (res?.matchId) navigate(`/battle/m/${res.matchId}`, { replace: true });
            else setError(res?.error || 'Could not join this battle');
        };
        if (socket.connected) join(); else socket.once('connect', join);
        return () => { cancelled = true; socket.off('connect', join); };
    }, [code, navigate]);
    return (
        <div className="bt-page bt-center">
            {error ? (
                <div className="bt-card" style={{ maxWidth: 420, textAlign: 'center' }}>
                    <h2>Can't join</h2>
                    <p className="bt-muted">{error}</p>
                    <Link className="bt-btn primary" to="/battle">Go to the battle lobby</Link>
                </div>
            ) : <p className="bt-muted">Joining the battle…</p>}
        </div>
    );
}

const BattlePage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [me, setMe] = useState(null);
    const [board, setBoard] = useState(null);
    const [problems, setProblems] = useState(null);
    const [difficulty, setDifficulty] = useState('any');
    const [queued, setQueued] = useState(null); // { since, inQueue }
    const [friendDiff, setFriendDiff] = useState('easy');
    const [error, setError] = useState('');
    const [, tick] = useState(0);
    const queuedRef = useRef(null);
    queuedRef.current = queued;

    const load = useCallback(() => {
        axios.get('/api/battles/me').then(r => setMe(r.data)).catch(() => {});
        axios.get('/api/battles/leaderboard').then(r => setBoard(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        load();
        axios.get('/api/battles/problems').then(r => setProblems(r.data.problems)).catch(() => {});
    }, [load]);

    useEffect(() => {
        const onMatched = ({ matchId }) => navigate(`/battle/m/${matchId}`);
        const onQueue = ({ inQueue }) => setQueued(q => (q ? { ...q, inQueue } : q));
        socket.on('battle:matched', onMatched);
        socket.on('battle:queue-status', onQueue);
        return () => {
            socket.off('battle:matched', onMatched);
            socket.off('battle:queue-status', onQueue);
            if (queuedRef.current) socket.emit('battle:cancel-queue');
        };
    }, [navigate]);

    useEffect(() => {
        if (!queued) return undefined;
        const id = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, [queued]);

    const findMatch = async () => {
        setError('');
        const res = await emit('battle:queue', { difficulty });
        if (res?.matchId) return navigate(`/battle/m/${res.matchId}`);
        if (!res?.ok) return setError(res?.error || 'Could not join the queue');
        setQueued({ since: Date.now(), inQueue: res.inQueue });
    };
    const cancelQueue = () => { socket.emit('battle:cancel-queue'); setQueued(null); };

    const createInvite = async () => {
        setError('');
        const res = await emit('battle:create-friend', { difficulty: friendDiff });
        if (res?.matchId && !res.ok) return navigate(`/battle/m/${res.matchId}`);
        if (!res?.ok) return setError(res?.error || 'Could not create the invite');
        navigate(`/battle/m/${res.matchId}`);
    };

    const practice = async (problemId) => {
        setError('');
        const res = await emit('battle:practice', { problemId });
        if (res?.matchId) return navigate(`/battle/m/${res.matchId}`);
        setError(res?.error || 'Could not start practice');
    };

    const b = me?.battle;
    const waited = queued ? Math.round((Date.now() - queued.since) / 1000) : 0;

    return (
        <div className="bt-page">
            <header className="bt-hero">
                <div>
                    <h1>⚔️ Code Battles</h1>
                    <p className="bt-muted">Same problem, live race. Pass every hidden test first to win. Python or JavaScript, judged in real time.</p>
                </div>
                <div className="bt-rating-card">
                    <div className="bt-rating">{b ? b.rating : '—'}</div>
                    <div className="bt-muted">rating{me?.rank ? ` · #${me.rank}` : ''}</div>
                    {b && (
                        <div className="bt-record">
                            <span className="w">{b.wins}W</span> <span className="l">{b.losses}L</span> <span>{b.draws}D</span>
                            {b.streak > 1 && <span className="bt-streak">🔥 {b.streak}</span>}
                        </div>
                    )}
                </div>
            </header>

            {me?.active && (
                <div className="bt-banner">
                    You're in a battle right now.
                    <button className="bt-btn primary" onClick={() => navigate(`/battle/m/${me.active.matchId}`)}>Rejoin</button>
                </div>
            )}
            {error && <div className="bt-banner error">{error}</div>}

            <div className="bt-grid">
                <section className="bt-card bt-play">
                    <h2>Ranked match</h2>
                    <p className="bt-muted">Matched with someone near your rating. Wins and losses change your rating.</p>
                    <div className="bt-chips" role="radiogroup" aria-label="Difficulty">
                        {DIFFS.map(([id, label]) => (
                            <button key={id} role="radio" aria-checked={difficulty === id} className={difficulty === id ? 'active' : ''} onClick={() => setDifficulty(id)} disabled={!!queued}>{label}</button>
                        ))}
                    </div>
                    {queued ? (
                        <div className="bt-searching">
                            <span className="bt-spinner" aria-hidden="true" />
                            <div>
                                <b>Finding an opponent… {fmtWait(waited)}</b>
                                <div className="bt-muted">{queued.inQueue > 1 ? `${queued.inQueue} people searching` : 'Waiting for someone to join. Invite a friend to play right away.'}</div>
                            </div>
                            <button className="bt-btn" onClick={cancelQueue}>Cancel</button>
                        </div>
                    ) : (
                        <button className="bt-btn primary big" onClick={findMatch}>Find opponent</button>
                    )}
                    {board && <div className="bt-muted bt-live">● {board.live} live battle{board.live === 1 ? '' : 's'} · {board.inQueue} searching</div>}
                </section>

                <section className="bt-card">
                    <h2>Challenge a friend</h2>
                    <p className="bt-muted">Get a link to send to anyone. Friendly battles don't change ratings.</p>
                    <div className="bt-chips">
                        {DIFFS.slice(1).map(([id, label]) => (
                            <button key={id} className={friendDiff === id ? 'active' : ''} onClick={() => setFriendDiff(id)}>{label}</button>
                        ))}
                    </div>
                    <button className="bt-btn big" onClick={createInvite} disabled={!!queued}>Create invite link</button>
                </section>

                <section className="bt-card bt-board">
                    <h2>Leaderboard</h2>
                    {!board && <p className="bt-muted">Loading…</p>}
                    {board && !board.players.length && <p className="bt-muted">No ranked battles yet. Be the first!</p>}
                    <ol>
                        {board?.players.slice(0, 15).map(p => (
                            <li key={p.userId} className={String(p.userId) === String(user?._id) ? 'me' : ''}>
                                <span className="rank">{p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : p.rank}</span>
                                <Link to={`/profile/${p.userId}`}>{p.username}</Link>
                                <span className="bt-muted">{p.wins}-{p.losses}</span>
                                <b>{p.rating}</b>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="bt-card bt-practice">
                    <h2>Practice <span className="bt-muted" style={{ fontWeight: 400, fontSize: 13 }}>{problems ? `${problems.filter(p => p.solved).length}/${problems.length} solved` : ''}</span></h2>
                    <p className="bt-muted">Any problem, on your own, no clock and no rating.</p>
                    {['easy', 'medium', 'hard'].map(d => (
                        <div key={d} className="bt-plist">
                            <h3 className={`bt-diff ${d}`}>{d}</h3>
                            <ul>
                                {problems?.filter(p => p.difficulty === d).map(p => (
                                    <li key={p.id}>
                                        <button onClick={() => practice(p.id)} title={p.tags.join(', ')}>
                                            <span className={`bt-check ${p.solved ? 'on' : ''}`} aria-label={p.solved ? 'solved' : 'not solved'}>{p.solved ? '✓' : '○'}</span>
                                            {p.title}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </section>

                <section className="bt-card bt-history">
                    <h2>Your recent battles</h2>
                    {!me?.recent?.length && <p className="bt-muted">Nothing yet.</p>}
                    <ul>
                        {me?.recent?.map(r => {
                            const mine = r.players.find(p => String(p.userId) === String(user?._id));
                            const other = r.players.find(p => String(p.userId) !== String(user?._id));
                            const delta = mine && mine.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : 0;
                            const label = r.result === 'win' ? (r.won ? 'Won' : 'Lost') : RESULT_LABEL[r.result];
                            return (
                                <li key={r.id}>
                                    <span className={`bt-res ${r.result === 'win' ? (r.won ? 'won' : 'lost') : r.result}`}>{label}</span>
                                    <span className="title">{problems?.find(p => p.id === r.problem)?.title || r.problem}</span>
                                    <span className="bt-muted">{other ? `vs ${other.username}` : r.mode}</span>
                                    {r.mode === 'ranked' && delta !== 0 && <b className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</b>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default BattlePage;
