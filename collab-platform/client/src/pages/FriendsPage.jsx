// pages/FriendsPage.jsx — friends, requests, finding people, and challenging friends to battles.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { socket } from '../socket';
import FriendButton from '../components/friends/FriendButton';
import '../components/friends/friends.css';

const Avatar = ({ user }) => (
    <span className="fr-avatar" aria-hidden="true">
        {user.profilePicture ? <img src={user.profilePicture} alt="" /> : (user.username || '?').slice(0, 1).toUpperCase()}
        {user.online !== undefined && <i className={user.online ? 'on' : ''} />}
    </span>
);

const emit = (event, payload) => new Promise((resolve) => {
    socket.timeout(15000).emit(event, payload, (err, res) => resolve(err ? { error: "Couldn't reach the server" } : res));
});

const FriendsPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [challenging, setChallenging] = useState(null); // friend being challenged

    const load = useCallback(() => {
        axios.get('/api/friends').then(r => setData(r.data)).catch(err => setError(err.response?.data?.msg || err.message));
    }, []);

    useEffect(() => {
        load();
        socket.on('friends:update', load);
        // Online dots refresh now and then
        const id = setInterval(load, 30000);
        return () => { socket.off('friends:update', load); clearInterval(id); };
    }, [load]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) { setResults(null); return undefined; }
        const t = setTimeout(() => {
            axios.get('/api/friends/search', { params: { q } }).then(r => setResults(r.data.users)).catch(() => setResults([]));
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    const respond = async (userId, action) => {
        try {
            if (action === 'accept') await axios.post(`/api/friends/${userId}/accept`);
            else await axios.post(`/api/friends/${userId}/decline`);
            load();
        } catch (err) {
            setError(err.response?.data?.msg || err.message);
        }
    };

    const challenge = async (friend, kind) => {
        const res = await emit('battle:create-friend', { kind, difficulty: 'easy', inviteUserId: friend._id });
        if (res?.matchId) navigate(`/battle/m/${res.matchId}`);
        else setError(res?.error || 'Could not create the challenge');
    };

    return (
        <div className="fr-page">
            <header className="fr-header">
                <h1>Friends</h1>
                <p className="fr-muted">Friends can open your friends-only deploys, and you can challenge them to code battles.</p>
            </header>
            {error && <div className="fr-error">✕ {error}</div>}

            <section className="fr-card">
                <h2>Find people</h2>
                <input
                    className="fr-search"
                    type="search"
                    placeholder="Search by username…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search people by username"
                />
                {results && !results.length && <p className="fr-muted">No one found.</p>}
                {results?.map(u => (
                    <div key={u._id} className="fr-row">
                        <Avatar user={u} />
                        <Link to={`/profile/${u._id}`} className="fr-name">{u.username}</Link>
                        <span className="fr-muted fr-rating">⚔️ {u.rating}</span>
                        <FriendButton userId={u._id} initialStatus={u.status} onChange={load} />
                    </div>
                ))}
            </section>

            {data?.incoming?.length > 0 && (
                <section className="fr-card fr-incoming">
                    <h2>Friend requests <span className="fr-count">{data.incoming.length}</span></h2>
                    {data.incoming.map(u => (
                        <div key={u._id} className="fr-row">
                            <Avatar user={u} />
                            <Link to={`/profile/${u._id}`} className="fr-name">{u.username}</Link>
                            <button className="fr-btn none" onClick={() => respond(u._id, 'accept')}>Accept</button>
                            <button className="fr-btn ghost" onClick={() => respond(u._id, 'decline')}>Decline</button>
                        </div>
                    ))}
                </section>
            )}

            <section className="fr-card">
                <h2>Your friends {data && <span className="fr-muted">({data.friends.length})</span>}</h2>
                {!data && <p className="fr-muted">Loading…</p>}
                {data && !data.friends.length && <p className="fr-muted">No friends yet. Search for people above, or add them from their profile.</p>}
                {data?.friends.map(u => (
                    <div key={u._id} className="fr-row">
                        <Avatar user={u} />
                        <div className="fr-who">
                            <Link to={`/profile/${u._id}`} className="fr-name">{u.username}</Link>
                            <span className="fr-muted">{u.online ? 'Online' : 'Offline'} · ⚔️ {u.rating}</span>
                        </div>
                        {challenging === u._id ? (
                            <span className="fr-challenge">
                                {[['guessr', '🧭', 'CodeGuessr'], ['quiz', '🧠', 'Skill quiz (JavaScript)'], ['task', '🛠️', 'Dev task'], ['debug', '🐛', 'Debug race'], ['css', '🎨', 'CSS battle']].map(([kind, icon, name]) => (
                                    <button key={kind} className="fr-btn" onClick={() => challenge(u, kind)} title={name} aria-label={`Challenge to ${name}`}>{icon}</button>
                                ))}
                                <button className="fr-btn ghost" onClick={() => setChallenging(null)}>✕</button>
                            </span>
                        ) : (
                            <button className="fr-btn none" onClick={() => setChallenging(u._id)} title="Start a friendly code battle; they get a notification">⚔️ Challenge</button>
                        )}
                        <FriendButton userId={u._id} initialStatus="friends" onChange={load} />
                    </div>
                ))}
            </section>

            {data?.outgoing?.length > 0 && (
                <section className="fr-card">
                    <h2>Sent requests</h2>
                    {data.outgoing.map(u => (
                        <div key={u._id} className="fr-row">
                            <Avatar user={u} />
                            <Link to={`/profile/${u._id}`} className="fr-name">{u.username}</Link>
                            <FriendButton userId={u._id} initialStatus="outgoing" onChange={load} />
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
};

export default FriendsPage;
