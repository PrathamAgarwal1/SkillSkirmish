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

    useEffect(() => {
        async function fetchData() {
            try {
                if (activeTab === 'browse') {
                    const res = await axios.get('/api/profile');
                    const validDevs = res.data.filter(dev => dev.user && dev.user._id);
                    setDevelopers(validDevs);
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
                {['matchmake', 'browse'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        background: activeTab === tab ? 'var(--term-green)' : 'transparent',
                        color: activeTab === tab ? '#fff' : 'var(--text-muted)',
                        border: activeTab === tab ? 'none' : '1px solid var(--border-subtle)',
                        padding: '0.5rem 1.2rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 'bold',
                        textTransform: 'uppercase', letterSpacing: '1px', transition: 'all 0.2s'
                    }}>
                        {tab === 'matchmake' ? '⚡ AI Matchmaking' : '👥 Browse Developers'}
                    </button>
                ))}
            </div>

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
                <div className="room-grid-display">
                    {developers.length > 0 ? developers.map(dev => (
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
            )}

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