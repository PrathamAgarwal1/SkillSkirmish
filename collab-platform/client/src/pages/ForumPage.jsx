import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const ForumPage = () => {
    const [activeTab, setActiveTab] = useState('matchmake');
    const [requiredSkills, setRequiredSkills] = useState('');
    const [matchResult, setMatchResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [developers, setDevelopers] = useState([]);
    const navigate = useNavigate();

    const [myRooms, setMyRooms] = useState([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [selectedUserToInvite, setSelectedUserToInvite] = useState(null);
    const [selectedRoomId, setSelectedRoomId] = useState('new');

    // Filter State
    const [filterSkill, setFilterSkill] = useState('');
    const [filterMinElo, setFilterMinElo] = useState('');
    const [filterMaxElo, setFilterMaxElo] = useState('');
    const [filterName, setFilterName] = useState('');

    // Discover Rooms State
    const [recommendedRooms, setRecommendedRooms] = useState([]);
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const [discoverLoaded, setDiscoverLoaded] = useState(false);

    useEffect(() => {
        async function fetchData() {
            try {
                if (activeTab === 'browse') {
                    const res = await axios.get('/api/profile');
                    const validDevs = res.data.filter(dev => dev.user && dev.user._id);
                    setDevelopers(validDevs);
                }
                if (activeTab === 'discover' && !discoverLoaded) {
                    setDiscoverLoading(true);
                    try {
                        const res = await axios.get('/api/rooms/recommend');
                        setRecommendedRooms(res.data.recommendations || []);
                        setDiscoverLoaded(true);
                    } catch (err) {
                        console.error('Failed to load recommendations:', err);
                    } finally {
                        setDiscoverLoading(false);
                    }
                }
                const roomRes = await axios.get('/api/rooms/myrooms');
                setMyRooms(roomRes.data);
            } catch (err) {
                console.error("Error loading data:", err);
            }
        }
        fetchData();
    }, [activeTab]);

    const handleAIMatchmake = async () => {
        setLoading(true);
        setMatchResult(null);
        try {
            const skillsArray = requiredSkills.split(',').map(s => s.trim());
            const res = await axios.post('/api/matchmaking/find-match', {
                requiredSkills: skillsArray,
                minElo: 1200
            });
            setMatchResult(res.data);
        } catch (err) {
            console.error(err);
            toast.error(`Couldn't search right now: ${err.response?.data?.reason || err.response?.data?.msg || 'try again in a moment'}`);
        } finally {
            setLoading(false);
        }
    };

    const clickInvite = (userId) => {
        setSelectedUserToInvite(userId);
        setShowInviteModal(true);
    };

    const confirmInvite = async () => {
        if (!selectedUserToInvite) return;
        try {
            let roomId = selectedRoomId;
            let roomName = "";

            if (selectedRoomId === 'new') {
                roomName = `Collab-${Date.now().toString().slice(-4)}`;
                const roomRes = await axios.post('/api/rooms', {
                    name: roomName,
                    description: "Instant Matchmaking Session"
                });
                roomId = roomRes.data._id;
            } else {
                const targetRoom = myRooms.find(r => r._id === selectedRoomId);
                roomName = targetRoom ? targetRoom.name : 'Collaboration Room';
            }

            await axios.post('/api/notifications/invite', {
                targetUserId: selectedUserToInvite,
                roomId: roomId,
                roomName: roomName
            });

            toast.success(`Invite sent for ${roomName}`);
            setShowInviteModal(false);

            if (selectedRoomId === 'new' && window.confirm("Open the new room now?")) {
                navigate(`/rooms/${roomId}`);
            }
        } catch (err) {
            console.error("Invite failed:", err);
            toast.error(err.response?.data?.msg || "Couldn't send the invite.");
        }
    };

    const handleRequestJoinRoom = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            toast.success('Join request sent to the owner');
            setRecommendedRooms(prev => prev.filter(r => r.roomId !== roomId));
        } catch (err) {
            toast.error(err.response?.data?.msg || "Couldn't send the join request.");
        }
    };

    const filteredDevelopers = developers.filter(dev => {
        const username = dev.user?.username || '';
        const skills = dev.skills || [];
        const best = skills.length > 0 ? Math.max(...skills.map(s => s.elo || 0)) : 0;
        return (!filterName || username.toLowerCase().includes(filterName.toLowerCase())) &&
            (!filterSkill || skills.some(s => s.name.toLowerCase().includes(filterSkill.toLowerCase()))) &&
            best >= (filterMinElo ? parseInt(filterMinElo, 10) : 0) &&
            best <= (filterMaxElo ? parseInt(filterMaxElo, 10) : 10000);
    });

    const TABS = [
        { key: 'matchmake', label: 'Find teammates' },
        { key: 'browse', label: 'Browse developers' },
        { key: 'discover', label: 'Rooms for you' }
    ];

    return (
        <div className="ui-page">
            <header className="ui-head">
                <div>
                    <h1>Discover</h1>
                    <p>Find people to build with, and rooms that are looking for your skills.</p>
                </div>
            </header>

            <div className="ui-tabs" role="tablist" aria-label="Discover">
                {TABS.map(tab => (
                    <button key={tab.key} role="tab" aria-selected={activeTab === tab.key} className={`ui-tab${activeTab === tab.key ? ' active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'matchmake' && (
                <div style={{ maxWidth: 720 }}>
                    <form className="ui-card" onSubmit={(e) => { e.preventDefault(); if (requiredSkills.trim()) handleAIMatchmake(); }}>
                        <div className="ui-card-head"><h2>Who are you looking for?</h2></div>
                        <p>List the skills you need. The AI suggests people whose ratings and skills fit, and says why.</p>
                        <div className="ui-inline">
                            <input className="ui-input" value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)} placeholder="React, Node.js" aria-label="Skills you need" />
                            <button type="submit" className="ui-btn primary" disabled={loading || !requiredSkills.trim()}>{loading ? 'Searching…' : 'Find people'}</button>
                        </div>
                    </form>

                    {matchResult?.matches && (
                        <section className="ui-card" style={{ marginTop: 16 }}>
                            <div className="ui-card-head"><h2>Suggestions</h2></div>
                            {matchResult.matches.length > 0 ? (
                                <ul className="ui-list">
                                    {matchResult.matches.map((match, idx) => (
                                        <li key={idx} className="ui-row" style={{ alignItems: 'flex-start' }}>
                                            <div className="ui-row-main">
                                                <Link to={`/profile/${match.userId}`} className="ui-row-title">{match.username || 'Unknown user'}</Link>
                                                <span className="ui-row-sub" style={{ whiteSpace: 'normal', marginTop: 2 }}>{match.reason}</span>
                                            </div>
                                            <button onClick={() => clickInvite(match.userId)} className="ui-btn small">Invite</button>
                                        </li>
                                    ))}
                                </ul>
                            ) : <div className="ui-empty">Nobody fits those skills yet. Try fewer or different skills.</div>}
                        </section>
                    )}
                </div>
            )}

            {activeTab === 'browse' && (
                <section className="ui-card">
                    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 8 }}>
                        <label className="ui-field" style={{ margin: 0 }}><span>Name</span><input className="ui-input" value={filterName} onChange={e => setFilterName(e.target.value)} placeholder="Search by name" /></label>
                        <label className="ui-field" style={{ margin: 0 }}><span>Skill</span><input className="ui-input" value={filterSkill} onChange={e => setFilterSkill(e.target.value)} placeholder="React" /></label>
                        <label className="ui-field" style={{ margin: 0 }}><span>Min rating</span><input className="ui-input" type="number" value={filterMinElo} onChange={e => setFilterMinElo(e.target.value)} placeholder="0" /></label>
                        <label className="ui-field" style={{ margin: 0 }}><span>Max rating</span><input className="ui-input" type="number" value={filterMaxElo} onChange={e => setFilterMaxElo(e.target.value)} placeholder="3000" /></label>
                    </div>
                    {filteredDevelopers.length > 0 ? (
                        <ul className="ui-list">
                            {filteredDevelopers.map(dev => {
                                const rated = (dev.skills || []).filter(s => s.elo != null && s.matchesPlayed > 0);
                                const best = rated.length ? Math.max(...rated.map(s => s.elo)) : null;
                                return (
                                    <li key={dev._id} className="ui-row">
                                        <div className="ui-row-main">
                                            <Link to={`/profile/${dev.user?._id}`} className="ui-row-title">{dev.user?.username || 'Unknown user'}</Link>
                                            <span className="ui-row-sub">{(dev.skills || []).slice(0, 5).map(s => s.name).join(', ') || 'No skills listed'}</span>
                                        </div>
                                        {best != null && <span className="ui-num">{best}</span>}
                                        <button onClick={() => clickInvite(dev.user?._id)} className="ui-btn small">Invite</button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : <div className="ui-empty">No developers match these filters.</div>}
                </section>
            )}

            {activeTab === 'discover' && (
                <>
                    {discoverLoading && <p className="ui-muted">Finding rooms that fit your skills…</p>}
                    {!discoverLoading && discoverLoaded && recommendedRooms.length === 0 && (
                        <div className="ui-card"><div className="ui-empty" style={{ paddingTop: 6 }}>No rooms are looking for people right now. When someone creates a room with "Let people find this room" turned on, it shows up here.</div></div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                        {recommendedRooms.map(room => (
                            <article key={room.roomId} className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-bright)' }}>{room.name}</h2>
                                        {room.owner && <span className="ui-muted ui-small">by {room.owner.username}</span>}
                                    </div>
                                    <span className={`ui-tag ${room.matchScore >= 60 ? 'green' : 'blue'}`} title="How well your skills fit this room">{room.matchScore}% fit</span>
                                </div>
                                {room.description && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-main)', lineHeight: 1.5 }}>{room.description}</p>}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {room.requiredSkills.map(skill => <span key={skill.name} className="ui-tag">{skill.name}</span>)}
                                </div>
                                {room.reason && <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{room.reason}</p>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                    <span className="ui-muted ui-small">{room.memberCount} of {room.capacity} members</span>
                                    <button className="ui-btn small primary" onClick={() => handleRequestJoinRoom(room.roomId)}>Ask to join</button>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}

            {showInviteModal && (
                <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowInviteModal(false)}>
                    <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="forum-invite-title">
                        <h2 id="forum-invite-title">Invite to a room</h2>
                        <label className="ui-field">
                            <span>Room</span>
                            <select className="ui-select" value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)}>
                                <option value="new">Create a new room</option>
                                {myRooms.length > 0 && (
                                    <optgroup label="Your rooms">
                                        {myRooms.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </label>
                        <div className="ui-modal-actions">
                            <button className="ui-btn ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                            <button className="ui-btn primary" onClick={confirmInvite}>Send invite</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForumPage;