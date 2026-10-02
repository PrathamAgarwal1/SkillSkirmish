import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import EditRoomModal from '../components/rooms/EditRoomModal';
import { socket } from '../socket';
import PageTitle from '../components/layout/PageTitle';
import CozyCat from '../components/layout/CozyCat';
import { Loading, EmptyState } from '../components/layout/Friendly';

const errMsg = (err, fallback = 'Something went wrong') => err.response?.data?.msg || err.response?.data?.reason || fallback;

const timeAgo = (timestamp) => {
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return '';
    const mins = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
    return new Date(timestamp).toLocaleDateString();
};

const greeting = () => {
    const h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Late-night coding';
};

const EMPTY_ROOM = { name: '', description: '', discoverable: false, projectDescription: '', skills: '', minRating: '', capacity: '', tags: '' };

/** "New room" dialog. Discovery settings only show when the room is discoverable. */
function CreateRoomModal({ onClose, onCreated }) {
    const [form, setForm] = useState(EMPTY_ROOM);
    const [saving, setSaving] = useState(false);
    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        const payload = { name: form.name.trim(), description: form.description };
        if (form.discoverable) {
            payload.isDiscoverable = true;
            if (form.projectDescription) payload.projectDescription = form.projectDescription;
            if (form.skills.trim()) {
                payload.requiredSkills = form.skills.split(',').map(s => {
                    const [name, weight] = s.trim().split(':');
                    return { name: (name || '').trim(), weight: weight ? Math.min(5, Math.max(1, parseInt(weight, 10))) || 1 : 1 };
                }).filter(s => s.name);
            }
            if (form.minRating) payload.minRating = parseInt(form.minRating, 10) || 0;
            if (form.capacity) payload.capacity = parseInt(form.capacity, 10) || 10;
            if (form.tags.trim()) payload.tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
        }
        setSaving(true);
        try {
            await axios.post('/api/rooms', payload);
            toast.success(`Room "${payload.name}" created`);
            onCreated();
        } catch (err) {
            toast.error(`Couldn't create the room: ${errMsg(err)}`);
            setSaving(false);
        }
    };

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <form className="ui-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-room-title">
                <h2 id="new-room-title">New room</h2>
                <label className="ui-field">
                    <span>Name</span>
                    <input className="ui-input" value={form.name} onChange={set('name')} placeholder="Hackathon team" required autoFocus />
                </label>
                <label className="ui-field">
                    <span>Description <small>(optional)</small></span>
                    <input className="ui-input" value={form.description} onChange={set('description')} placeholder="What's this room for?" />
                </label>
                <label className="ui-check">
                    <input type="checkbox" checked={form.discoverable} onChange={set('discoverable')} />
                    <span>Let people find this room<small>It shows up in room recommendations for people with matching skills.</small></span>
                </label>
                {form.discoverable && (
                    <>
                        <label className="ui-field">
                            <span>Project description</span>
                            <input className="ui-input" value={form.projectDescription} onChange={set('projectDescription')} placeholder="A study planner built with React and Node" />
                        </label>
                        <label className="ui-field">
                            <span>Skills you're looking for</span>
                            <input className="ui-input" value={form.skills} onChange={set('skills')} placeholder="React:5, Node.js" />
                            <small>Separate with commas. Add :1–5 to say how important a skill is.</small>
                        </label>
                        <div className="ui-inline">
                            <label className="ui-field" style={{ flex: 1 }}>
                                <span>Minimum rating</span>
                                <input className="ui-input" type="number" min="0" value={form.minRating} onChange={set('minRating')} placeholder="0" />
                            </label>
                            <label className="ui-field" style={{ flex: 1 }}>
                                <span>Max members</span>
                                <input className="ui-input" type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="10" />
                            </label>
                        </div>
                        <label className="ui-field">
                            <span>Tags</span>
                            <input className="ui-input" value={form.tags} onChange={set('tags')} placeholder="frontend, beginner-friendly" />
                        </label>
                    </>
                )}
                <div className="ui-modal-actions">
                    <button type="button" className="ui-btn ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="ui-btn primary" disabled={saving || !form.name.trim()}>{saving ? 'Creating…' : 'Create room'}</button>
                </div>
            </form>
        </div>
    );
}

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const [myRooms, setMyRooms] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);


    const [stats, setStats] = useState(null);
    const [activity, setActivity] = useState([]);
    const [analytics, setAnalytics] = useState(null);

    // --- data ---
    const fetchRooms = useCallback(async () => {
        try { setMyRooms((await axios.get('/api/rooms/myrooms')).data); } catch (err) { console.error('Failed to fetch rooms', err); }
    }, []);
    const fetchNotifications = useCallback(async () => {
        try { setNotifications((await axios.get('/api/notifications')).data); } catch (err) { console.error('Failed to fetch notifications', err); }
    }, []);
    const fetchDashboardData = useCallback(async () => {
        try {
            const [s, a, an] = await Promise.all([
                axios.get('/api/dashboard/stats'),
                axios.get('/api/dashboard/activity?limit=8'),
                axios.get('/api/dashboard/analytics')
            ]);
            setStats(s.data);
            setActivity(a.data);
            setAnalytics(an.data);
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        Promise.all([fetchRooms(), fetchNotifications(), fetchDashboardData()]).finally(() => setLoading(false));

        const onDashboardUpdate = (data) => {
            if (data.userId === user._id) { fetchRooms(); fetchNotifications(); fetchDashboardData(); }
        };
        socket.on('dashboard-update', onDashboardUpdate);
        socket.on('new-notification', fetchNotifications);
        socket.on('dashboard-stats-update', fetchDashboardData);
        return () => {
            socket.off('dashboard-update', onDashboardUpdate);
            socket.off('new-notification', fetchNotifications);
            socket.off('dashboard-stats-update', fetchDashboardData);
        };
    }, [user, fetchRooms, fetchNotifications, fetchDashboardData]);

    // --- actions ---
    const handleDelete = async (room) => {
        if (!window.confirm(`Delete the room "${room.name}"? This can't be undone.`)) return;
        try {
            await axios.delete(`/api/rooms/${room._id}`);
            toast.success('Room deleted');
            fetchRooms();
            fetchDashboardData();
        } catch (err) { toast.error(`Couldn't delete the room: ${errMsg(err)}`); }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        try { setSearchResults((await axios.get('/api/rooms/search', { params: { q: searchQuery } })).data); } catch (err) { toast.error(`Search failed: ${errMsg(err)}`); }
    };

    const handleRequestJoin = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            toast.success('Join request sent');
            setSearchResults(prev => (prev || []).filter(r => r._id !== roomId));
        } catch (err) { toast.error(`Couldn't send the request: ${errMsg(err)}`); }
    };



    const handleAcceptInvite = async (roomId, notificationId) => {
        if (!roomId) return;
        try {
            const res = await axios.post(`/api/rooms/${roomId}/accept-invite`, { notificationId });
            if (res.data.msg === 'Joined successfully' || res.data.msg === 'Already a member') navigate(`/rooms/${roomId}`);
            else toast.error(`Couldn't join: ${res.data.msg}`);
            fetchRooms();
        } catch (err) { toast.error(errMsg(err, "Couldn't join the room. It may have been deleted.")); }
    };

    const handleApproveJoin = async (roomId, userId, notificationId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/approve-join`, { userId, notificationId });
            toast.success('Request approved');
            fetchNotifications();
        } catch (err) { toast.error(`Couldn't approve: ${errMsg(err)}`); }
    };

    if (loading || !user) return <div className="ui-page"><Loading what="Loading your home" full /></div>;

    const pending = notifications.filter(n => (n.type === 'invite' && n.relatedId) || (n.type === 'join_request' && n.sender));
    const skills = analytics?.skills || [];
    const maxElo = Math.max(1600, ...skills.map(s => s.elo));
    const summary = [
        stats?.totalRooms ? `${stats.totalRooms} room${stats.totalRooms === 1 ? '' : 's'}` : null,
        stats?.skillCount ? `${stats.skillCount} skill${stats.skillCount === 1 ? '' : 's'}` : null,
        stats?.assessment?.total ? `${stats.assessment.total} assessment${stats.assessment.total === 1 ? '' : 's'}` : null
    ].filter(Boolean).join(' · ');

    return (
        <div className="ui-page">
            {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchRooms(); fetchDashboardData(); }} />}
            {editingRoom && <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onRoomUpdated={() => { setEditingRoom(null); fetchRooms(); }} />}

            <PageTitle path={`~/home/${user.username}`} title={`${greeting()}, ${user.username}`} sub={summary || 'Create a room to start building with others, or jump into a battle.'}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link className="ui-btn" to="/forum">Find teammates</Link>
                    <button className="ui-btn primary" onClick={() => setShowCreate(true)}>New room</button>
                </div>
            </PageTitle>

            {pending.length > 0 && (
                <section className="ui-card" style={{ marginBottom: 20, borderColor: 'rgba(56,139,253,0.45)' }} aria-label="Waiting for you">
                    <div className="ui-card-head"><h2>Waiting for you</h2></div>
                    <ul className="ui-list">
                        {pending.map(n => (
                            <li key={n._id} className="ui-row">
                                <div className="ui-row-main"><span className="ui-row-title" style={{ whiteSpace: 'normal' }}>{n.message}</span></div>
                                <div className="ui-row-end">
                                    {n.type === 'invite'
                                        ? <button className="ui-btn small primary" onClick={() => handleAcceptInvite(n.relatedId, n._id)}>Join room</button>
                                        : <button className="ui-btn small primary" onClick={() => handleApproveJoin(n.relatedId, n.sender, n._id)}>Approve</button>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="ui-grid">
                <div className="ui-stack">
                    <section className="ui-card" style={{ position: 'relative' }}>
                        {myRooms.length > 0 && <CozyCat style={{ position: 'absolute', top: -48, left: 210, width: 96, height: 64 }} />}
                        <div className="ui-card-head" style={{ flexWrap: 'wrap' }}>
                            <h2>Your rooms</h2>
                            <form onSubmit={handleSearch} className="ui-inline" role="search" style={{ maxWidth: 320, width: '100%' }}>
                                <input className="ui-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find a room to join" aria-label="Find a room to join" style={{ padding: '6px 10px' }} />
                                <button className="ui-btn small" type="submit">Search</button>
                            </form>
                        </div>

                        {searchResults && (
                            <div style={{ marginBottom: 14, padding: '4px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
                                <div className="ui-row" style={{ borderTop: 'none' }}>
                                    <span className="ui-row-main ui-muted ui-small">{searchResults.length ? `Rooms matching "${searchQuery}"` : `No public rooms match "${searchQuery}"`}</span>
                                    <button className="ui-link ui-small" onClick={() => setSearchResults(null)}>Close</button>
                                </div>
                                {searchResults.map(room => (
                                    <div key={room._id} className="ui-row">
                                        <div className="ui-row-main">
                                            <span className="ui-row-title">{room.name}</span>
                                            {room.description && <span className="ui-row-sub">{room.description}</span>}
                                        </div>
                                        {room.members?.some(m => (m._id || m) === user._id)
                                            ? <Link className="ui-btn small" to={`/rooms/${room._id}`}>Open</Link>
                                            : <button className="ui-btn small" onClick={() => handleRequestJoin(room._id)}>Ask to join</button>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {myRooms.length > 0 ? (
                            <ul className="ui-list">
                                {myRooms.map(room => {
                                    const owner = room.owner?._id === user._id;
                                    const members = room.members?.length || 0;
                                    return (
                                        <li key={room._id} className="ui-row">
                                            <div className="ui-row-main">
                                                <Link to={`/rooms/${room._id}`} className="ui-row-title">{room.name}</Link>
                                                <span className="ui-row-sub">{room.description || (owner ? 'No description' : `By ${room.owner?.username || 'someone'}`)}</span>
                                            </div>
                                            <div className="ui-row-end">
                                                {members > 1 && <span>{members} members</span>}
                                                {owner && <span className="ui-tag">Owner</span>}
                                                {owner && (
                                                    <>
                                                        <button className="ui-btn small quiet" onClick={() => setEditingRoom(room)} aria-label={`Edit ${room.name}`}>Edit</button>
                                                        <button className="ui-btn small quiet danger" onClick={() => handleDelete(room)} aria-label={`Delete ${room.name}`}>Delete</button>
                                                    </>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <EmptyState title="No rooms yet" action={{ label: 'Create your first room', onClick: () => setShowCreate(true), primary: true }}>
                                Rooms are where your team chats, talks in voice and builds projects together.
                            </EmptyState>
                        )}
                    </section>

                    <section className="ui-card">
                        <div className="ui-card-head"><h2>Recent activity</h2></div>
                        {activity.length > 0 ? (
                            <ul className="ui-log">
                                {activity.map((item, i) => (
                                    <li key={i}>
                                        <time>{timeAgo(item.timestamp) || '·'}</time>
                                        <span className="ui-log-text">
                                            {item.title}
                                            {item.detail && <small>{item.detail}</small>}
                                        </span>
                                        {item.ratingChange != null && (
                                            <span className={`ui-log-end ${item.ratingChange >= 0 ? 'ui-up' : 'ui-down'}`}>{item.ratingChange >= 0 ? '+' : '−'}{Math.abs(item.ratingChange)}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : <EmptyState compact art="mug" title="All quiet for now" action={{ label: 'Play a battle', to: '/battle' }}>Your assessments, rooms and invites will show up here.</EmptyState>}
                    </section>
                </div>

                <aside className="ui-stack">
                    <section className="ui-card">
                        <div className="ui-card-head">
                            <h2>Your skills</h2>
                            <Link to="/profile" className="ui-link ui-small">Take an assessment</Link>
                        </div>
                        {skills.length > 0 ? (
                            <ul className="ui-list">
                                {skills.slice(0, 6).map(s => {
                                    const rated = s.matchesPlayed > 0;
                                    return (
                                        <li key={s.name} className="ui-row" style={{ display: 'block' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: rated ? 6 : 0 }}>
                                                <span>{s.name}{rated && s.isProvisional && <span className="ui-tag" style={{ marginLeft: 8 }} title="Rating settles after a few more assessments">new</span>}</span>
                                                {rated ? <span className="ui-num">{s.elo}</span> : <span className="ui-muted ui-small">Not rated yet</span>}
                                            </div>
                                            {rated && <div className="ui-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, (s.elo / maxElo) * 100)}%` }} /></div>}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <EmptyState compact art="mug" title="No skills yet" action={{ label: 'Add a skill', to: '/profile' }}>Add the skills you use and take a short assessment to get a rating.</EmptyState>
                        )}
                    </section>

                    <section className="ui-card">
                        <div className="ui-card-head"><h2>Today</h2></div>
                        <ul className="ui-list">
                            <li className="ui-row">
                                <div className="ui-row-main">
                                    <span className="ui-row-title">Daily CodeGuessr</span>
                                    <span className="ui-row-sub">5 rounds, the same for everyone</span>
                                </div>
                                <Link className="ui-btn small primary" to="/battle">Play</Link>
                            </li>
                            <li className="ui-row">
                                <div className="ui-row-main">
                                    <span className="ui-row-title">Find a battle</span>
                                    <span className="ui-row-sub">Quiz, debug race, CSS and more</span>
                                </div>
                                <Link className="ui-btn small" to="/battle">Open</Link>
                            </li>
                        </ul>
                    </section>

                </aside>
            </div>
        </div>
    );
};

export default DashboardPage;
