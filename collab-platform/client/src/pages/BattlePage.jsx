// pages/BattlePage.jsx — the battle lobby: pick a mode, then ranked / challenge a friend / practice;
// the CodeGuessr daily challenge; per-mode leaderboards; your recent battles.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import { emit } from '../battle/useMatch';
import '../battle/battle.css';
import { Loading, EmptyState } from '../components/layout/Friendly';

const MAIN_KINDS = ['guessr', 'quiz', 'task', 'debug', 'css'];
const DIFFS = [['any', 'Any'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const RESULT_LABEL = { win: 'Win', draw: 'Draw', 'no-contest': 'No contest', solved: 'Solved', unsolved: 'Unsolved', finished: 'Done' };
const KIND_ICON = { guessr: '🧭', quiz: '🧠', task: '🛠️', debug: '🐛', css: '🎨', algo: '🧮' };
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const fmtWait = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const LAST_KIND = 'ss-battle-kind';

export function BattleJoin() {
    const { code } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        const join = async () => {
            const res = await emit('battle:join-friend', { code });
            if (cancelled) return;
            if (res?.matchId) navigate(`/battle/m/${res.matchId}`, { replace: true });
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
    const [catalog, setCatalog] = useState(null);
    const [me, setMe] = useState(null);
    const [daily, setDaily] = useState(null);
    const [kind, setKind] = useState(() => { try { return localStorage.getItem(LAST_KIND) || 'guessr'; } catch { return 'guessr'; } });
    const [difficulty, setDifficulty] = useState('any');
    const [skill, setSkill] = useState('JavaScript');
    const [boardKind, setBoardKind] = useState(null);
    const [board, setBoard] = useState(null);
    const [queued, setQueued] = useState(null);
    const [showList, setShowList] = useState(false);
    const [error, setError] = useState('');
    const [, tick] = useState(0);
    const queuedRef = useRef(null);
    queuedRef.current = queued;

    const load = useCallback(() => {
        axios.get('/api/battles/me').then(r => setMe(r.data)).catch(() => {});
        axios.get('/api/battles/daily').then(r => setDaily(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        load();
        axios.get('/api/battles/catalog').then(r => setCatalog(r.data)).catch(err => setError(err.response?.data?.msg || err.message));
    }, [load]);

    const shownBoard = boardKind || kind;
    useEffect(() => {
        setBoard(null);
        axios.get('/api/battles/leaderboard', { params: { kind: shownBoard } }).then(r => setBoard(r.data)).catch(() => {});
    }, [shownBoard]);

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

    const pickKind = (k) => {
        if (queued) return;
        setKind(k);
        setBoardKind(null);
        setShowList(false);
        setDifficulty('any');
        try { localStorage.setItem(LAST_KIND, k); } catch { /* ignore */ }
    };

    const options = () => ({ kind, difficulty: difficulty === 'any' ? undefined : difficulty, skill: kind === 'quiz' ? skill : undefined });
    const go = (res) => {
        if (res?.matchId) navigate(`/battle/m/${res.matchId}`);
        else setError(res?.error || 'Something went wrong');
    };

    const findMatch = async () => {
        setError('');
        const res = await emit('battle:queue', { ...options(), difficulty });
        if (res?.matchId) return navigate(`/battle/m/${res.matchId}`);
        if (!res?.ok) return setError(res?.error || 'Could not join the queue');
        setQueued({ since: Date.now(), inQueue: res.inQueue, kind });
    };
    const cancelQueue = () => { socket.emit('battle:cancel-queue'); setQueued(null); };
    const invite = async () => { setError(''); go(await emit('battle:create-friend', { ...options(), difficulty: difficulty === 'any' ? 'easy' : difficulty })); };
    const practice = async (problemId) => { setError(''); go(await emit('battle:practice', { ...options(), problemId })); };
    const playDaily = async () => { setError(''); go(await emit('battle:practice', { kind: 'guessr', daily: true })); };

    if (!catalog) return <div className="bt-page bt-center">{error ? <p className="bt-muted">{error}</p> : <Loading what="Loading battles" />}</div>;

    const K = catalog.kinds;
    const stats = me?.modes?.[kind];
    const list = catalog.practice[kind];
    const waited = queued ? Math.round((Date.now() - queued.since) / 1000) : 0;
    const hasDifficulty = !['guessr', 'quiz'].includes(kind);

    return (
        <div className="bt-page">
            <header className="bt-hero">
                <div>
                    <h1>⚔️ Battles</h1>
                    <p className="bt-muted">Duel other developers live: guess, quiz, build, debug and style. Every mode has its own rating.</p>
                </div>
            </header>

            {me?.active && (
                <div className="bt-banner">
                    You're in a {K[me.active.kind]?.name || ''} battle right now.
                    <button className="bt-btn primary" onClick={() => navigate(`/battle/m/${me.active.matchId}`)}>Rejoin</button>
                </div>
            )}
            {error && <div className="bt-banner error">{error} <button className="bt-btn ghost" onClick={() => setError('')}>✕</button></div>}

            {/* Daily CodeGuessr */}
            <section className="bt-daily">
                <div className="bt-daily-main">
                    <div className="bt-daily-tag">DAILY CHALLENGE · {daily?.date || ''}</div>
                    <h2>🧭 Today's CodeGuessr</h2>
                    <p className="bt-muted">5 rounds, the same for everyone. Your first run counts for today's board.</p>
                    {me?.daily?.played ? (
                        <div className="bt-daily-done">
                            <b>{fmt(me.daily.score)}</b> points{daily?.mine?.rank ? ` · #${daily.mine.rank} of ${daily.players}` : ''}
                            {me.daily.streak > 0 && <span className="bt-streak"> · 🔥 {me.daily.streak}-day streak</span>}
                            <button className="bt-btn ghost" onClick={playDaily} title="Play again (won't count)">Play again</button>
                        </div>
                    ) : (
                        <button className="bt-btn primary big-inline" onClick={playDaily}>Play today's challenge</button>
                    )}
                </div>
                <ol className="bt-daily-board">
                    {daily?.top?.slice(0, 5).map(r => (
                        <li key={r.userId} className={String(r.userId) === String(user?._id) ? 'me' : ''}>
                            <span className="rank">{r.rank}</span><span className="name">{r.username}</span><b>{fmt(r.score)}</b>
                        </li>
                    ))}
                    {daily && !daily.top.length && <li className="bt-muted">No scores yet today. Be the first!</li>}
                </ol>
            </section>

            {/* Mode picker */}
            <div className="bt-modes" role="radiogroup" aria-label="Battle mode">
                {MAIN_KINDS.map(k => (
                    <button key={k} role="radio" aria-checked={kind === k} className={`bt-mode ${kind === k ? 'active' : ''} ${k === 'guessr' ? 'featured' : ''}`} onClick={() => pickKind(k)} disabled={!!queued && kind !== k}>
                        <span className="bt-mode-icon">{K[k].icon}</span>
                        <span className="bt-mode-name">{K[k].name}</span>
                        <span className="bt-mode-blurb">{K[k].blurb}</span>
                        <span className="bt-mode-rating">{me?.modes?.[k]?.played ? `${me.modes[k].rating} · ${me.modes[k].wins}W ${me.modes[k].losses}L` : 'Unrated'}</span>
                    </button>
                ))}
                <button role="radio" aria-checked={kind === 'algo'} className={`bt-mode side ${kind === 'algo' ? 'active' : ''}`} onClick={() => pickKind('algo')} disabled={!!queued && kind !== 'algo'}>
                    <span className="bt-mode-icon">{K.algo.icon}</span>
                    <span className="bt-mode-name">{K.algo.name}</span>
                    <span className="bt-mode-rating">{me?.modes?.algo?.played ? me.modes.algo.rating : 'side mode'}</span>
                </button>
            </div>

            <div className="bt-grid">
                <section className="bt-card bt-play">
                    <h2>{K[kind].icon} {K[kind].name}</h2>
                    <p className="bt-muted">{K[kind].blurb}</p>
                    {stats?.played > 0 && <p className="bt-muted bt-small">Your rating <b className="bt-gold">{stats.rating}</b> · {stats.wins}W {stats.losses}L {stats.draws}D{stats.streak > 1 ? ` · 🔥 ${stats.streak}` : ''}</p>}

                    {hasDifficulty && (
                        <div className="bt-chips" role="radiogroup" aria-label="Difficulty">
                            {DIFFS.map(([id, label]) => (
                                <button key={id} role="radio" aria-checked={difficulty === id} className={difficulty === id ? 'active' : ''} onClick={() => setDifficulty(id)} disabled={!!queued}>{label}</button>
                            ))}
                        </div>
                    )}
                    {kind === 'quiz' && (
                        <label className="bt-field">
                            Skill
                            <select value={skill} onChange={(e) => setSkill(e.target.value)} disabled={!!queued}>
                                {catalog.skills.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    )}

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
                        <div className="bt-play-actions">
                            <button className="bt-btn primary big" onClick={findMatch}>Find opponent (ranked)</button>
                            <div className="bt-play-row">
                                <button className="bt-btn" onClick={invite}>Challenge a friend</button>
                                <button className="bt-btn" onClick={() => practice()}>{kind === 'guessr' ? 'Solo game (5 rounds)' : kind === 'quiz' ? 'Practice quiz' : 'Random practice'}</button>
                            </div>
                        </div>
                    )}
                    {me && (
                        <div className="bt-muted bt-live">
                            ● {me.live?.[kind] || 0} live · {me.searching?.[kind] || 0} searching
                        </div>
                    )}

                    {list && (
                        <div className="bt-practice-list">
                            <button className="bt-linkish" onClick={() => setShowList(s => !s)}>
                                {showList ? '▾' : '▸'} Pick a {kind === 'css' ? 'target' : 'challenge'} to practice ({list.filter(p => p.solved).length}/{list.length} solved)
                            </button>
                            {showList && ['easy', 'medium', 'hard'].map(d => list.some(p => p.difficulty === d) && (
                                <div key={d} className="bt-plist">
                                    <h3 className={`bt-diff ${d}`}>{d}</h3>
                                    <ul>
                                        {list.filter(p => p.difficulty === d).map(p => (
                                            <li key={p.id}>
                                                <button onClick={() => practice(p.id)} title={p.tags.join(', ')}>
                                                    <span className={`bt-check ${p.solved ? 'on' : ''}`}>{p.solved ? '✓' : '○'}</span>{p.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="bt-card bt-board">
                    <h2>Leaderboard</h2>
                    <div className="bt-board-tabs" role="tablist">
                        {[...MAIN_KINDS, 'algo'].map(k => (
                            <button key={k} role="tab" aria-selected={shownBoard === k} className={shownBoard === k ? 'active' : ''} onClick={() => setBoardKind(k)} title={K[k].name}>{KIND_ICON[k]}</button>
                        ))}
                    </div>
                    <div className="bt-muted bt-small">{K[shownBoard].name}</div>
                    {!board && <p className="bt-muted">Loading…</p>}
                    {board && !board.players.length && <p className="bt-muted">No ranked {K[shownBoard].name} battles yet.</p>}
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

                <section className="bt-card bt-history">
                    <h2>Your recent battles</h2>
                    {!me?.recent?.length && <EmptyState compact title="No battles yet">Your matches show up here. Pick a mode and jump in.</EmptyState>}
                    <ul>
                        {me?.recent?.map(r => {
                            const mine = r.players.find(p => String(p.userId) === String(user?._id));
                            const other = r.players.find(p => String(p.userId) !== String(user?._id));
                            const delta = mine && mine.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : 0;
                            const label = r.result === 'win' ? (r.won ? 'Won' : 'Lost') : RESULT_LABEL[r.result];
                            const title = r.kind === 'quiz' ? `${r.skill || r.problem} quiz` : r.kind === 'guessr' ? (r.mode === 'daily' ? 'Daily CodeGuessr' : 'CodeGuessr') : catalog.practice[r.kind]?.find(p => p.id === r.problem)?.title || r.problem;
                            return (
                                <li key={r.id}>
                                    <span className={`bt-res ${r.result === 'win' ? (r.won ? 'won' : 'lost') : r.result}`}>{label}</span>
                                    <span className="title">{KIND_ICON[r.kind]} {title}</span>
                                    <span className="bt-muted">{other ? `vs ${other.username}` : r.mode}{mine?.score != null && r.kind === 'guessr' && !other ? ` · ${fmt(mine.score)} pts` : ''}</span>
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
