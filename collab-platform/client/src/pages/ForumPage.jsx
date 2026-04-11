import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

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
            alert("Failed to find match. Ensure backend is running.");
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

            alert(`Invitation sent to join ${roomName}!`);
            setShowInviteModal(false);

            if (selectedRoomId === 'new' && window.confirm("Go to new room now?")) {
                navigate(`/rooms/${roomId}`);
            }
        } catch (err) {
            console.error("Invite failed:", err);
            alert(err.response?.data?.msg || "Failed to send invitation.");
        }
    };

    const handleRequestJoinRoom = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            alert('Join request sent to owner!');
            setRecommendedRooms(prev => prev.filter(r => r.roomId !== roomId));
        } catch (err) {
            alert(err.response?.data?.msg || 'Failed to send join request.');
        }
    };

    const getScoreColor = (score) => {
        if (score >= 60) return 'var(--term-green)';
        if (score >= 35) return 'var(--term-gold)';
        return 'var(--term-red, #e94560)';
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h2 style={{ fontFamily: 'var(--font-mono)' }}>~/forum</h2>
                <div className="sys-status">
                    <span className="status-dot online"></span> MATCHMAKING ENGINE
                </div>
            </header>

            {/* Tab Bar */}
            <div style={{
                display: 'flex', gap: '0.5rem', marginBottom: '2rem',
                borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem'
            }}>
                {['matchmake', 'browse', 'discover'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        background: activeTab === tab ? 'var(--term-green)' : 'transparent',
                        color: activeTab === tab ? '#fff' : 'var(--text-muted)',
                        border: activeTab === tab ? 'none' : '1px solid var(--border-subtle)',
                        padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 'bold',
                        textTransform: 'uppercase', letterSpacing: '1px', transition: 'all 0.2s'
                    }}>
                        {tab === 'matchmake' ? '⚡ AI Matchmaking' : tab === 'browse' ? '👥 Browse Developers' : '🔍 Discover Rooms'}
                    </button>
                ))}
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '0.5rem', minHeight: 0 }}>
                {activeTab === 'matchmake' && (
                <div style={{ maxWidth: '650px', margin: '0 auto' }}>
                    <div className="term-card">
                        <div className="term-header">
                            <div className="window-dots">
                                <div className="dot dot-red"></div>
                                <div className="dot dot-yellow"></div>
                                <div className="dot dot-green"></div>
                            </div>
                            <span>matchmaking_engine.exe</span>
                        </div>
                        <div className="term-body" style={{ padding: '2rem' }}>
                            <h3 style={{ color: 'var(--text-bright)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                                Find Your Ideal Teammate
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                Powered by Hybrid AI analysis.
                            </p>

                            <label style={{
                                display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem',
                                color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                            }}>REQUIRED_SKILLS</label>
                            <input className="term-input" type="text" placeholder="e.g. React, Node.js"
                                value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)}
                                style={{ marginBottom: '1rem' }} />

                            <button className="btn-term-primary" onClick={handleAIMatchmake}
                                disabled={loading || !requiredSkills} style={{ width: '100%', padding: '0.8rem' }}>
                                {loading ? 'ANALYZING CANDIDATES...' : '⚡ FIND MATCH'}
                            </button>
                        </div>
                    </div>

                    {matchResult && matchResult.matches && matchResult.matches.map((match, idx) => (
                        <div key={idx} className="term-card" style={{ marginTop: '1.5rem' }}>
                            <div className="term-header">
                                <span style={{ color: 'var(--term-green)' }}>match_result_{idx + 1}</span>
                                <span style={{ marginLeft: 'auto', color: 'var(--term-gold)' }}>Score: {match.matchScore}</span>
                            </div>
                            <div className="term-body" style={{ padding: '1.5rem' }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <span style={{ color: 'var(--term-blue)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>REASONING:</span>
                                    <p style={{ color: 'var(--text-main)', marginTop: '0.3rem' }}>{match.reason}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.8rem' }}>
                                    <Link to={`/profile/${match.userId}`} className="btn-term-primary"
                                        style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
                                        VIEW PROFILE
                                    </Link>
                                    <button onClick={() => clickInvite(match.userId)} className="btn-term"
                                        style={{ fontSize: '0.8rem' }}>
                                        INVITE TO ROOM
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'browse' && (
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    {/* Filter Bar */}
                    <div className="term-card" style={{ marginBottom: '1.5rem', padding: '1.2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: 2, minWidth: '200px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--term-blue)', display: 'block', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>FILTER SKILL</label>
                            <input
                                type="text" className="term-input"
                                placeholder="Search by skill (e.g. React)..."
                                value={filterSkill} onChange={e => setFilterSkill(e.target.value)}
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: '100px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--term-blue)', display: 'block', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>MIN RATING</label>
                            <input
                                type="number" className="term-input"
                                placeholder="0"
                                value={filterMinElo} onChange={e => setFilterMinElo(e.target.value)}
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: '100px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--term-blue)', display: 'block', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>MAX RATING</label>
                            <input
                                type="number" className="term-input"
                                placeholder="3000"
                                value={filterMaxElo} onChange={e => setFilterMaxElo(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="room-grid-display">
                        {developers.filter(dev => {
                            const skills = dev.skills || [];
                            const hasSkill = !filterSkill || skills.some(s => s.name.toLowerCase().includes(filterSkill.toLowerCase()));
                            const maxRating = skills.length > 0 ? Math.max(...skills.map(s => s.elo || 0)) : 0;
                            const minRating = filterMinElo ? parseInt(filterMinElo) : 0;
                            const maxRatingLimit = filterMaxElo ? parseInt(filterMaxElo) : 10000;
                            return hasSkill && maxRating >= minRating && maxRating <= maxRatingLimit;
                        }).length > 0 ? developers.filter(dev => {
                            const skills = dev.skills || [];
                            const hasSkill = !filterSkill || skills.some(s => s.name.toLowerCase().includes(filterSkill.toLowerCase()));
                            const maxRating = skills.length > 0 ? Math.max(...skills.map(s => s.elo || 0)) : 0;
                            const minRating = filterMinElo ? parseInt(filterMinElo) : 0;
                            const maxRatingLimit = filterMaxElo ? parseInt(filterMaxElo) : 10000;
                            return hasSkill && maxRating >= minRating && maxRating <= maxRatingLimit;
                        }).map(dev => (
                            <div key={dev._id} className="room-card-mini" style={{ flexDirection: 'column', gap: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div className="room-title">{dev.user?.username || 'Unknown User'}</div>
                                        <div style={{
                                            fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            {dev.skills && dev.skills.slice(0, 5).map(s => s.name).join(' • ')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                    <Link to={`/profile/${dev.user?._id}`} className="btn-term-sm"
                                        style={{ textDecoration: 'none' }}>VIEW</Link>
                                    <button onClick={() => clickInvite(dev.user?._id)} className="btn-term-sm"
                                        style={{ color: 'var(--term-green)', borderColor: 'var(--term-green)' }}>INVITE</button>
                                </div>
                            </div>
                        )) : (
                            <div className="term-empty">No developers found.</div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── DISCOVER ROOMS TAB ─── */}
            {activeTab === 'discover' && (
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <div className="term-card" style={{ marginBottom: '1.5rem' }}>
                        <div className="term-header">
                            <div className="window-dots">
                                <div className="dot dot-red"></div>
                                <div className="dot dot-yellow"></div>
                                <div className="dot dot-green"></div>
                            </div>
                            <span>room_discovery.exe</span>
                        </div>
                        <div className="term-body" style={{ padding: '1.5rem' }}>
                            <h3 style={{ color: 'var(--text-bright)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                                🔍 Discover Project Rooms
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Rooms ranked by your skill profile, rating, and growth potential.
                            </p>
                        </div>
                    </div>

                    {discoverLoading && (
                        <div className="term-card" style={{ padding: '2rem', textAlign: 'center' }}>
                            <span style={{ color: 'var(--term-green)', fontFamily: 'var(--font-mono)' }}>
                                SCANNING ROOMS... ▓▓▓░░░░░░
                            </span>
                        </div>
                    )}

                    {!discoverLoading && recommendedRooms.length === 0 && discoverLoaded && (
                        <div className="term-card" style={{ padding: '2rem' }}>
                            <div className="term-empty" style={{ textAlign: 'center' }}>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    &gt; No discoverable rooms found.
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    Rooms need to be created with <code style={{ color: 'var(--term-green)' }}>isDiscoverable: true</code> and <code style={{ color: 'var(--term-green)' }}>requiredSkills</code> to appear here.
                                </p>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                        {recommendedRooms.map((room, idx) => (
                            <div key={room.roomId} className="term-card" style={{ display: 'flex', flexDirection: 'column' }}>
                                <div className="term-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--term-green)', fontFamily: 'var(--font-mono)' }}>
                                        room_{idx + 1}
                                    </span>
                                    <span style={{
                                        color: getScoreColor(room.matchScore),
                                        fontFamily: 'var(--font-mono)',
                                        fontWeight: 'bold',
                                        fontSize: '0.75rem'
                                    }}>
                                        MATCH: {room.matchScore}/100
                                    </span>
                                </div>
                                <div className="term-body" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                                    {/* Room Name & Owner */}
                                    <div style={{ marginBottom: '0.6rem' }}>
                                        <h4 style={{ color: 'var(--text-bright)', margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                                            {room.name}
                                        </h4>
                                        {room.owner && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                by {room.owner.username}
                                            </span>
                                        )}
                                    </div>

                                    {/* Description */}
                                    {room.description && (
                                        <p style={{ color: 'var(--text-main)', fontSize: '0.75rem', marginBottom: '0.6rem', lineHeight: '1.3' }}>
                                            {room.description}
                                        </p>
                                    )}

                                    {/* Required Skills */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.6rem' }}>
                                        {room.requiredSkills.map(skill => (
                                            <span key={skill.name} style={{
                                                background: 'rgba(57, 134, 250, 0.15)',
                                                color: 'var(--term-blue)',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.65rem',
                                                fontFamily: 'var(--font-mono)',
                                                border: '1px solid rgba(57, 134, 250, 0.3)'
                                            }}>
                                                {skill.name} {skill.weight > 1 ? `×${skill.weight}` : ''}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Reasoning */}
                                    <div style={{
                                        background: 'rgba(0,0,0,0.2)',
                                        padding: '0.4rem 0.6rem',
                                        borderRadius: 'var(--radius-sm)',
                                        marginBottom: '0.8rem',
                                        fontSize: '0.7rem',
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--text-muted)',
                                        marginTop: 'auto'
                                    }}>
                                        <span style={{ color: 'var(--term-blue)' }}>ANALYSIS:</span> {room.reason}
                                    </div>

                                    {/* Footer: Members + Join Button */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{
                                            fontSize: '0.7rem', color: 'var(--text-muted)',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            👥 {room.memberCount}/{room.capacity}
                                        </span>
                                        <button
                                            className="btn-term-primary"
                                            onClick={() => handleRequestJoinRoom(room.roomId)}
                                            style={{ fontSize: '0.7rem', padding: '0.3rem 0.8rem' }}
                                        >
                                            REQUEST ACCESS
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>

            {/* INVITE MODAL */}
            {showInviteModal && (
                <div className="modal-backdrop">
                    <div className="term-card" style={{ width: '400px', maxWidth: '90%' }}>
                        <div className="term-header">
                            <div className="window-dots">
                                <div className="dot dot-red"></div>
                                <div className="dot dot-yellow"></div>
                                <div className="dot dot-green"></div>
                            </div>
                            <span>invite_user.exe</span>
                            <button onClick={() => setShowInviteModal(false)} style={{
                                marginLeft: 'auto', background: 'none', border: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem'
                            }}>×</button>
                        </div>
                        <div className="term-body" style={{ padding: '1.5rem' }}>
                            <p style={{ marginBottom: '1rem', color: 'var(--text-main)' }}>Select a room to invite this developer to:</p>

                            <select className="term-input" style={{ marginBottom: '1.5rem' }}
                                value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)}>
                                <option value="new">[+] Create New Room</option>
                                <optgroup label="My Rooms">
                                    {myRooms.map(r => (
                                        <option key={r._id} value={r._id}>{r.name}</option>
                                    ))}
                                </optgroup>
                            </select>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                                <button className="btn-term" onClick={() => setShowInviteModal(false)}>CANCEL</button>
                                <button className="btn-term-primary" onClick={confirmInvite}>SEND INVITE</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForumPage;