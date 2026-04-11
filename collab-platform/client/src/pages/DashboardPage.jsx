import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import EditRoomModal from '../components/rooms/EditRoomModal';
import InviteModal from '../components/rooms/InviteModal';
import StatsBar from '../components/dashboard/StatsBar';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import SkillAnalytics from '../components/dashboard/SkillAnalytics';
import PlatformPulse from '../components/dashboard/PlatformPulse';
import { socket } from '../socket';

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    // Existing state
    const [myRooms, setMyRooms] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [roomName, setRoomName] = useState('');
    const [roomDescription, setRoomDescription] = useState('');
    const [loading, setLoading] = useState(true);
    const [roomSkills, setRoomSkills] = useState('');
    const [roomMinRating, setRoomMinRating] = useState('');
    const [roomCapacity, setRoomCapacity] = useState('');
    const [roomTags, setRoomTags] = useState('');
    const [roomDiscoverable, setRoomDiscoverable] = useState(false);
    const [roomProjectDesc, setRoomProjectDesc] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [matchingSkill, setMatchingSkill] = useState('');
    const [matchResults, setMatchResults] = useState([]);
    const [matchLoading, setMatchLoading] = useState(false);
    const [selectedMatchUser, setSelectedMatchUser] = useState(null);
    const [inviteRoomOptions, setInviteRoomOptions] = useState([]);

    // NEW: Dashboard data state
    const [dashStats, setDashStats] = useState(null);
    const [activity, setActivity] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [platform, setPlatform] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // --- DATA FETCHERS ---
    const fetchRooms = useCallback(async () => {
        try {
            const res = await axios.get('/api/rooms/myrooms');
            setMyRooms(res.data);
        } catch (err) {
            console.error("Failed to fetch rooms", err);
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await axios.get('/api/notifications');
            setNotifications(res.data);
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        }
    }, []);

    const fetchDashboardData = useCallback(async () => {
        try {
            setStatsLoading(true);
            const [statsRes, activityRes, analyticsRes, platformRes] = await Promise.all([
                axios.get('/api/dashboard/stats'),
                axios.get('/api/dashboard/activity?limit=15'),
                axios.get('/api/dashboard/analytics'),
                axios.get('/api/dashboard/platform')
            ]);
            setDashStats(statsRes.data);
            setActivity(activityRes.data);
            setAnalytics(analyticsRes.data);
            setPlatform(platformRes.data);
        } catch (err) {
            console.error("Failed to fetch dashboard data:", err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    // --- INITIAL LOAD ---
    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchRooms(), fetchNotifications(), fetchDashboardData()]);

            // Restore search state
            const savedSkill = sessionStorage.getItem('dashboard_matchingSkill');
            const savedMatches = sessionStorage.getItem('dashboard_matchResults');
            if (savedSkill) setMatchingSkill(savedSkill);
            if (savedMatches) setMatchResults(JSON.parse(savedMatches));

            setLoading(false);
        };
        fetchData();

        // Socket listeners
        const handleDashboardUpdate = (data) => {
            if (data.userId === user._id) {
                fetchRooms();
                fetchNotifications();
                fetchDashboardData();
            }
        };
        const handleNewNotification = () => { fetchNotifications(); };
        const handleStatsUpdate = () => { fetchDashboardData(); };

        socket.on('dashboard-update', handleDashboardUpdate);
        socket.on('new-notification', handleNewNotification);
        socket.on('dashboard-stats-update', handleStatsUpdate);

        return () => {
            socket.off('dashboard-update', handleDashboardUpdate);
            socket.off('new-notification', handleNewNotification);
            socket.off('dashboard-stats-update', handleStatsUpdate);
        };
    }, [user, fetchRooms, fetchNotifications, fetchDashboardData]);

    // --- HANDLERS (unchanged logic) ---
    const handleCreateRoom = async (e) => {
        e.preventDefault();
        if (!roomName) return alert('Please enter a room name');
        try {
            const payload = { name: roomName, description: roomDescription };
            if (roomDiscoverable) {
                payload.isDiscoverable = true;
                if (roomProjectDesc) payload.projectDescription = roomProjectDesc;
                if (roomSkills.trim()) {
                    payload.requiredSkills = roomSkills.split(',').map(s => {
                        const trimmed = s.trim();
                        const parts = trimmed.split(':');
                        return {
                            name: parts[0].trim(),
                            weight: parts[1] ? Math.min(5, Math.max(1, parseInt(parts[1]))) || 1 : 1
                        };
                    }).filter(s => s.name);
                }
                if (roomMinRating) payload.minRating = parseInt(roomMinRating) || 0;
                if (roomCapacity) payload.capacity = parseInt(roomCapacity) || 10;
                if (roomTags.trim()) {
                    payload.tags = roomTags.split(',').map(t => t.trim()).filter(Boolean);
                }
            }

            await axios.post('/api/rooms', payload);
            setRoomName(''); setRoomDescription(''); setRoomSkills('');
            setRoomMinRating(''); setRoomCapacity(''); setRoomTags('');
            setRoomDiscoverable(false); setRoomProjectDesc('');
            setShowAdvanced(false);
            fetchRooms();
            fetchDashboardData(); // Refresh stats
        } catch (err) {
            console.error("Failed to create room:", err);
            alert(`Failed to create room: ${err.response?.data?.msg || 'An error occurred.'}`);
        }
    };

    const handleDelete = async (roomId) => {
        if (window.confirm('Delete this room?')) {
            try {
                await axios.delete(`/api/rooms/${roomId}`);
                fetchRooms();
                fetchDashboardData();
            } catch (err) { alert('Failed to delete room.'); }
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.get(`/api/rooms/search?q=${searchQuery}`);
            setSearchResults(res.data);
        } catch (err) { console.error("Search failed:", err); }
    };

    const handleQuickMatch = async (e) => {
        e.preventDefault();
        if (!matchingSkill.trim()) return alert('Please enter a skill');
        try {
            setMatchLoading(true);
            const res = await axios.post('/api/matchmaking/find-match', {
                requiredSkills: [matchingSkill],
                minElo: 0
            });
            const matches = res.data.matches || [];
            setMatchResults(matches);
            sessionStorage.setItem('dashboard_matchingSkill', matchingSkill);
            sessionStorage.setItem('dashboard_matchResults', JSON.stringify(matches));
            if (matches.length === 0) {
                alert('No matching developers found for this skill.');
            }
        } catch (err) {
            alert(`Failed: ${err.response?.data?.reason || 'An error occurred'}`);
        } finally {
            setMatchLoading(false);
        }
    };

    const handleInviteToRoom = useCallback((matchUser) => {
        setSelectedMatchUser(matchUser);
        setInviteRoomOptions(myRooms);
    }, [myRooms]);

    const handleSendRoomInvite = async (roomId, message) => {
        if (!selectedMatchUser) { alert('No user selected'); return; }
        try {
            await axios.post(`/api/rooms/${roomId}/send-invite`, {
                userId: selectedMatchUser.userId,
                message
            });
            alert('Invite sent!');
            setSelectedMatchUser(null);
            setInviteRoomOptions([]);
        } catch (err) { alert('Failed to send invite'); }
    };

    const handleRequestJoin = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            alert('Join request sent!');
            setSearchResults(prev => prev.filter(r => r._id !== roomId));
        } catch (err) {
            console.error('Failed to send join request:', err);
            alert(`Failed: ${err.response?.data?.msg || 'An error occurred'}`);
        }
    };

    // --- FIX: More Robust Accept Invite Logic ---
    const handleAcceptInvite = async (roomId, notificationId) => {
        if (!roomId) {
            console.error("Cannot join room: Room ID is missing from invite.");
            return;
        }

        try {
            console.log(`Attempting to join room: ${roomId}`);

            // 1. Call Backend to add user to member list
            // We await this to ensure the user is a member BEFORE navigating
            const response = await axios.post(`/api/rooms/${roomId}/accept-invite`, { notificationId });

            console.log("Join response:", response.data);

            if (response.data.msg === 'Joined successfully' || response.data.msg === 'Already a member') {
                navigate(`/rooms/${roomId}`);
            } else {
                alert(`Could not join room: ${response.data.msg}`);
            }
            fetchRooms();
        } catch (err) {
            console.error("Failed to join room:", err);
            alert(err.response?.data?.msg || "Error joining room. It may have been deleted.");
        }
    };

    const handleApproveJoin = async (roomID, userId, notificationId) => {
        try {
            await axios.post(`/api/rooms/${roomID}/approve-join`, { userId, notificationId });
            alert('User approved!');
            fetchNotifications();
        } catch (err) {
            console.error("Failed to approve:", err);
            alert("Failed to approve request.");
        }
    };

    if (loading || !user) return <div className="dashboard-layout" style={{ padding: '2rem' }}><h1>Loading...</h1></div>;

    return (
        <>
            {editingRoom && <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onRoomUpdated={() => { setEditingRoom(null); fetchRooms(); }} />}

            <div className="dashboard-container">
                <header className="dashboard-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', fontSize: '1.2rem', padding: '0.3rem 0.6rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Toggle Sidebar"
                        >
                            <span style={{ fontSize: '1.4rem', lineHeight: '1', display: 'flex', alignItems: 'center' }}>☰</span>
                        </button>
                        <h2 style={{ margin: 0 }}>~/dashboard</h2>
                    </div>
                    <div className="sys-status">
                        <span className="status-dot online"></span> SYSTEM ONLINE
                    </div>
                </header>

                <div className="dashboard-grid">
                    {/* LEFT COL: Activity, Notifications, Matchmaking */}
                    <div className={`dashboard-sidebar ${isSidebarOpen ? 'expanded' : 'collapsed'}`}>

                        <div className="sidebar-icon-bar">
                            <i className="fas fa-chart-line" title="Activity">📊</i>
                            <i className="fas fa-bell" title="Notifications">🔔</i>
                            <i className="fas fa-bolt" title="Quick Match">⚡</i>
                            <i className="fas fa-search" title="Find Room">🔍</i>
                            <i className="fas fa-heartbeat" title="Platform Pulse">💓</i>
                        </div>

                        <div className="sidebar-content-wrapper">
                            {/* Activity Feed (NEW) */}
                            <ActivityFeed activities={activity} loading={statsLoading} />

                            {/* Notifications */}
                            <div className="term-card" style={{ marginTop: '1rem' }}>
                                <div className="term-header">
                                    <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                                    <span>notifications.log</span>
                                </div>
                                <div className="term-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    {notifications.length > 0 ? (
                                        <ul className="term-list">
                                            {notifications.map(n => (
                                                <li key={n._id} className="term-list-item">
                                                    <span className="timestamp">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span> {n.message}
                                                    {n.type === 'invite' && n.relatedId && (
                                                        <button className="btn-term-action" onClick={() => handleAcceptInvite(n.relatedId, n._id)}>
                                                            [ACCEPT INVITE]
                                                        </button>
                                                    )}
                                                    {n.type === 'join_request' && n.sender && (
                                                        <button className="btn-term-action" onClick={() => handleApproveJoin(n.relatedId, n.sender, n._id)}>
                                                            [APPROVE ACCESS]
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : <div className="term-empty">&gt; No new system messages.</div>}
                                </div>
                            </div>

                            {/* Quick Match */}
                            <div className="term-card" style={{ marginTop: '1rem' }}>
                                <div className="term-header">
                                    <span>quick_match.exe</span>
                                </div>
                                <div className="term-body">
                                    <form onSubmit={handleQuickMatch} style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            className="term-input"
                                            placeholder="Enter skill (e.g., React, Python)..."
                                            value={matchingSkill}
                                            onChange={(e) => setMatchingSkill(e.target.value)}
                                        />
                                        <button type="submit" className="btn-term" disabled={matchLoading}>
                                            {matchLoading ? 'SEARCHING...' : 'GO'}
                                        </button>
                                    </form>
                                    {matchResults.length > 0 && (
                                        <ul className="term-list" style={{ marginTop: '1rem' }}>
                                            {matchResults.map(match => {
                                                const skillNames = match.skills && Array.isArray(match.skills) && match.skills.length > 0
                                                    ? match.skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean).join(', ')
                                                    : null;
                                                return (
                                                    <li key={match.userId} className="term-list-item">
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                            <span>
                                                                <strong><Link to={`/profile/${match.userId}`} className="text-white hover:underline">{match.username || 'Unknown User'}</Link></strong>
                                                                <br />
                                                                {skillNames ? (
                                                                    <span style={{ fontSize: '0.85em', color: '#999' }}>{skillNames}</span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.85em', color: '#999' }}>No skills listed</span>
                                                                )}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                <span className="status-tag">[SCORE: {match.matchScore}]</span>
                                                                <button className="btn-term-sm" onClick={() => handleInviteToRoom(match)}>INVITE</button>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    <div style={{ marginTop: '0.8rem' }}>
                                        <Link to="/forum" className="term-link">&gt; Advanced Search...</Link>
                                    </div>
                                </div>
                            </div>

                            {/* Join Room */}
                            <div className="term-card" style={{ marginTop: '1.5rem' }}>
                                <div className="term-header">
                                    <span>connect_remote.sh</span>
                                </div>
                                <div className="term-body">
                                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input type="text" className="term-input" placeholder="Search rooms..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                        <button type="submit" className="btn-term">FIND</button>
                                    </form>
                                    <ul className="term-list" style={{ marginTop: '1rem' }}>
                                        {searchResults.map(room => (
                                            <li key={room._id} className="term-list-item">
                                                <span>{room.name}</span>
                                                {room.members?.some(m => m._id === user._id) ?
                                                    <span className="status-tag">[MEMBER]</span> :
                                                    <button className="btn-term-sm" onClick={() => handleRequestJoin(room._id)}>REQ_ACCESS</button>
                                                }
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Platform Pulse (NEW) */}
                            <div style={{ marginTop: '1.5rem' }}>
                                <PlatformPulse platform={platform} loading={statsLoading} />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COL: Main Room Management + Analytics */}
                    <div className="dashboard-main">

                        {/* Expandable Skill Analytics */}
                        <div className="analytics-popout-container">
                            <div className="analytics-header-collapsed">
                                <span>~/metrics/skill_analytics.exe</span>
                                <span className="hint">[HOVER TO EXPAND]</span>
                            </div>
                            <div className="analytics-content">
                                <SkillAnalytics analytics={analytics} loading={statsLoading} />
                            </div>
                        </div>

                        {/* Top Stats */}
                        <StatsBar stats={dashStats} loading={statsLoading} />

                        {/* Create Room */}
                        <div className="term-card mb-4">
                            <div className="term-header">
                                <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                                <span>mkdir new_room</span>
                            </div>
                            <div className="term-body">
                                <form onSubmit={handleCreateRoom} className="create-room-form" style={{ gap: '0.6rem' }}>
                                    <div className="form-group">
                                        <label style={{ marginBottom: '0.2rem' }}>&gt; Room Name:</label>
                                        <input type="text" className="term-input" style={{ padding: '0.5rem' }} value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ marginBottom: '0.2rem' }}>&gt; Description:</label>
                                        <input type="text" className="term-input" style={{ padding: '0.5rem' }} value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} />
                                    </div>

                                    {/* Discoverable Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.4rem 0' }}>
                                        <label style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                            color: roomDiscoverable ? 'var(--term-green)' : 'var(--text-muted)'
                                        }}>
                                            <input type="checkbox" checked={roomDiscoverable}
                                                onChange={(e) => { setRoomDiscoverable(e.target.checked); setShowAdvanced(e.target.checked); }}
                                                style={{ accentColor: 'var(--term-green)' }} />
                                            🔍 Make Discoverable
                                        </label>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            (appears in room recommendations)
                                        </span>
                                    </div>

                                    {/* Advanced Discovery Fields */}
                                    {showAdvanced && (
                                        <div style={{
                                            background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
                                            padding: '0.8rem', marginBottom: '0.5rem',
                                            border: '1px solid var(--border-subtle)'
                                        }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--term-blue)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem' }}>
                                                PROJECT_DISCOVERY_CONFIG
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                                                    &gt; Project Description:
                                                </label>
                                                <input type="text" className="term-input" style={{ padding: '0.4rem' }} placeholder="What is this project about?"
                                                    value={roomProjectDesc} onChange={(e) => setRoomProjectDesc(e.target.value)} />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                                                    &gt; Required Skills <span style={{ color: 'var(--term-gold)' }}>(comma-separated)</span>:
                                                </label>
                                                <input type="text" className="term-input" style={{ padding: '0.4rem' }} placeholder="e.g. React:5, Node.js"
                                                    value={roomSkills} onChange={(e) => setRoomSkills(e.target.value)} />
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.5rem' }}>
                                                <div className="form-group" style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                                                        &gt; Min Rating:
                                                    </label>
                                                    <input type="number" className="term-input" style={{ padding: '0.4rem' }} placeholder="0"
                                                        value={roomMinRating} onChange={(e) => setRoomMinRating(e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                                                        &gt; Capacity:
                                                    </label>
                                                    <input type="number" className="term-input" style={{ padding: '0.4rem' }} placeholder="10"
                                                        value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} />
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                                                    &gt; Tags:
                                                </label>
                                                <input type="text" className="term-input" style={{ padding: '0.4rem' }} placeholder="e.g. frontend"
                                                    value={roomTags} onChange={(e) => setRoomTags(e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    <button type="submit" className="btn-term-primary" style={{ marginTop: '0' }}>EXECUTE CREATE</button>
                                </form>
                            </div>
                        </div>



                        {/* My Rooms List */}
                        <div className="term-card" style={{ flexGrow: 1 }}>
                            <div className="term-header">
                                <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                                <span>ls ./my_rooms</span>
                            </div>
                            <div className="term-body room-grid-display">
                                {myRooms.length > 0 ? (
                                    myRooms.map(room => (
                                        <div key={room._id} className="room-card-mini">
                                            <div className="room-icon">📁</div>
                                            <div className="room-info">
                                                <Link to={`/rooms/${room._id}`} className="room-title">{room.name}</Link>
                                                <span className="room-desc">{room.description || 'No description'}</span>
                                            </div>
                                            {user._id === room.owner._id && (
                                                <div className="room-actions">
                                                    <button className="icon-btn" onClick={() => setEditingRoom(room)} title="Edit">✎</button>
                                                    <button className="icon-btn danger" onClick={() => handleDelete(room._id)} title="Delete">×</button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : <div className="term-empty">&gt; Directory is empty. Create a room to start.</div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Invite to Room Modal */}
            {selectedMatchUser && (
                <InviteModal
                    user={selectedMatchUser}
                    rooms={inviteRoomOptions}
                    onSend={handleSendRoomInvite}
                    onClose={() => {
                        setSelectedMatchUser(null);
                        setInviteRoomOptions([]);
                    }}
                />
            )}
        </>
    );
};

export default DashboardPage;