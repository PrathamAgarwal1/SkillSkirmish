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
    const [selectedRoomId, setSelectedRoomId] = useState('new'); // 'new' or borderRadius ID

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch Devs
                if (activeTab === 'browse') {
                    const res = await axios.get('/api/profile');
                    const validDevs = res.data.filter(dev => dev.user && dev.user._id);
                    setDevelopers(validDevs);
                }
                // Fetch My Rooms for Invites
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

    // --- INVITE LOGIC ---
    // --- INVITE LOGIC ---
    const clickInvite = (userId) => {
        setSelectedUserToInvite(userId);
        setShowInviteModal(true);
    };

    const confirmInvite = async () => {
        if (!selectedUserToInvite) return;

        try {
            let roomId = selectedRoomId;
            let roomName = "";

            // Case 1: Create New Room
            if (selectedRoomId === 'new') {
                roomName = `Collab-${Date.now().toString().slice(-4)}`;
                const roomRes = await axios.post('/api/rooms', {
                    name: roomName,
                    description: "Instant Matchmaking Session"
                });
                roomId = roomRes.data._id;
            } else {
                // Case 2: Existing Room
                const targetRoom = myRooms.find(r => r._id === selectedRoomId);
                roomName = targetRoom ? targetRoom.name : 'Collaboration Room';
            }

            // Send Invite Notification
            await axios.post('/api/notifications/invite', {
                targetUserId: selectedUserToInvite,
                roomId: roomId,
                roomName: roomName
            });

            alert(`Invitation sent to join ${roomName}!`);
            setShowInviteModal(false);

            // Optional: Redirect if new room, or just stay here?
            // User requested "Invite existing", usually implies they stay in Forum or go to room.
            // Let's ask via confirm or just stay.
            if (selectedRoomId === 'new' && window.confirm("Go to new room now?")) {
                navigate(`/rooms/${roomId}`);
            }

        } catch (err) {
            console.error("Invite failed:", err);
            alert(err.response?.data?.msg || "Failed to send invitation.");
        }
    };

    return (
        <div className="dashboard-layout" style={{ gridTemplateColumns: '1fr' }}>
            <div className="main-panel" style={{ padding: '2rem' }}>
                <h1>Developer Forum & Matchmaking</h1>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #333' }}>
                    <button className={`btn-secondary ${activeTab === 'matchmake' ? 'active' : ''}`} onClick={() => setActiveTab('matchmake')}>AI Matchmaking</button>
                    <button className={`btn-secondary ${activeTab === 'browse' ? 'active' : ''}`} onClick={() => setActiveTab('browse')}>Browse Developers</button>
                </div>

                {activeTab === 'matchmake' && (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <h2>Find Your Ideal Teammate</h2>
                        <p style={{ color: '#888', marginBottom: '1.5rem' }}>Powered by Hybrid AI.</p>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Required Skills</label>
                            <input type="text" placeholder="e.g. React, Node.js" value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff' }} />
                        </div>

                        <button className="btn" onClick={handleAIMatchmake} disabled={loading || !requiredSkills}>
                            {loading ? 'Analyzing Candidates...' : 'Find Match'}
                        </button>

                        {matchResult && matchResult.matches && matchResult.matches.map((match, idx) => (
                            <div key={idx} style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid var(--accent-primary)', borderRadius: '8px', background: 'rgba(255, 215, 0, 0.05)' }}>
                                <h3 style={{ color: 'var(--accent-primary)', marginTop: 0 }}>Match #{idx + 1} Found! (Score: {match.matchScore})</h3>
                                <div style={{ marginBottom: '1rem' }}>
                                    <strong>Reasoning:</strong>
                                    <p>{match.reason}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <Link to={`/profile/${match.userId}`} className="btn">View Profile</Link>
                                    <button onClick={() => clickInvite(match.userId)} className="btn-secondary">Invite to Room</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'browse' && (
                    <ul className="rooms-list">
                        {developers.length > 0 ? developers.map(dev => (
                            <li key={dev._id} className="room-list-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
                                <div>
                                    <strong style={{ fontSize: '1.1rem' }}>{dev.user?.username || 'Unknown User'}</strong>
                                    <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.2rem' }}>
                                        {dev.skills && dev.skills.slice(0, 5).map(s => `${s.name} (${s.elo || 1200})`).join(' • ')}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <Link to={`/profile/${dev.user?._id}`} className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem' }}>View</Link>
                                    <button onClick={() => clickInvite(dev.user?._id)} className="btn" style={{ fontSize: '0.8rem' }}>Invite</button>
                                </div>
                            </li>
                        )) : (
                            <p style={{ padding: '1rem', color: '#888' }}>No developers found.</p>
                        )}
                    </ul>
                )}
                )}
            </div>

            {/* INVITE MODAL */}
            {showInviteModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="term-card" style={{ width: '400px', maxWidth: '90%' }}>
                        <div className="term-header">
                            <span>invite_user.exe</span>
                            <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>×</button>
                        </div>
                        <div className="term-body">
                            <p style={{ marginBottom: '1rem' }}>Select a room to invite this developer to:</p>

                            <select
                                className="term-input"
                                style={{ width: '100%', marginBottom: '1.5rem' }}
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                            >
                                <option value="new">[+] Create New Room</option>
                                <optgroup label="My Rooms">
                                    {myRooms.map(r => (
                                        <option key={r._id} value={r._id}>{r.name}</option>
                                    ))}
                                </optgroup>
                            </select>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button className="btn-term-sm" onClick={() => setShowInviteModal(false)}>CANCEL</button>
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