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

    useEffect(() => {
        async function fetchDevs() {
            if (activeTab === 'browse') {
                try {
                    const res = await axios.get('/api/profile'); 
                    const validDevs = res.data.filter(dev => dev.user && dev.user._id);
                    setDevelopers(validDevs);
                } catch (err) { 
                    console.error("Error fetching developers:", err); 
                }
            }
        }
        fetchDevs();
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
    const handleInvite = async (targetUserId) => {
        if (!targetUserId) {
            alert("Invalid user ID.");
            return;
        }

        try {
            const roomName = `Collab-${Date.now().toString().slice(-4)}`;
            
            // 1. Create the Room
            const roomRes = await axios.post('/api/rooms', { 
                name: roomName, 
                description: "Instant Matchmaking Session" 
            });
            
            const roomId = roomRes.data._id;
            
            // 2. Send Invite Notification
            await axios.post('/api/notifications/invite', {
                targetUserId: targetUserId,
                roomId: roomId,
                roomName: roomName
            });

            // 3. Notify Sender and Redirect
            alert(`Room created! Invitation sent.`);
            navigate(`/rooms/${roomId}`);
            
        } catch (err) {
            console.error("Invite failed:", err);
            // Show specific server error
            const errorMsg = err.response?.data?.msg || "Failed to create collaboration room.";
            alert(errorMsg);
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

                        {matchResult && (
                            <div style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid var(--accent-primary)', borderRadius: '8px', background: 'rgba(255, 215, 0, 0.05)' }}>
                                <h3 style={{ color: 'var(--accent-primary)', marginTop: 0 }}>Match Found!</h3>
                                <div style={{ marginBottom: '1rem' }}>
                                    <strong>Reasoning:</strong>
                                    <p>{matchResult.reason}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <Link to={`/profile/${matchResult.userId}`} className="btn">View Profile</Link>
                                    <button onClick={() => handleInvite(matchResult.userId)} className="btn-secondary">Invite to Room</button>
                                </div>
                            </div>
                        )}
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
                                    <button onClick={() => handleInvite(dev.user?._id)} className="btn" style={{ fontSize: '0.8rem' }}>Invite</button>
                                </div>
                            </li>
                        )) : (
                            <p style={{ padding: '1rem', color: '#888' }}>No developers found.</p>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ForumPage;