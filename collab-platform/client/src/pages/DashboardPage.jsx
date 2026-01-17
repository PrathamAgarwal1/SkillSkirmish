import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import EditRoomModal from '../components/rooms/EditRoomModal';
import { socket } from '../socket';

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [myRooms, setMyRooms] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [roomName, setRoomName] = useState('');
    const [roomDescription, setRoomDescription] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingRoom, setEditingRoom] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const fetchRooms = async () => {
        try {
            const res = await axios.get('/api/rooms/myrooms');
            setMyRooms(res.data);
        } catch (err) {
            console.error("Failed to fetch rooms", err);
        }
    };

    const fetchNotifications = async () => {
        try {
            const res = await axios.get('/api/notifications');
            setNotifications(res.data);
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        }
    };

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchRooms(), fetchNotifications()]);
            setLoading(false);
        };
        fetchData();

        const handleDashboardUpdate = (data) => {
            if (data.userId === user._id) {
                fetchRooms();
                fetchNotifications();
            }
        };
        const handleNewNotification = () => { fetchNotifications(); };

        socket.on('dashboard-update', handleDashboardUpdate);
        socket.on('new-notification', handleNewNotification);

        return () => {
            socket.off('dashboard-update', handleDashboardUpdate);
            socket.off('new-notification', handleNewNotification);
        };
    }, [user]);

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        if (!roomName) return alert('Please enter a room name');
        try {
            await axios.post('/api/rooms', { name: roomName, description: roomDescription });
            setRoomName(''); setRoomDescription('');
            fetchRooms();
        } catch (err) {
            console.error("Failed to create room:", err);
            alert(`Failed to create room: ${err.response?.data?.msg || 'An error occurred.'}`);
        }
    };

    const handleDelete = async (roomId) => {
        if (window.confirm('Delete this room?')) {
            try { await axios.delete(`/api/rooms/${roomId}`); fetchRooms(); }
            catch (err) { alert('Failed to delete room.'); }
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.get(`/api/rooms/search?q=${searchQuery}`);
            setSearchResults(res.data);
        } catch (err) { console.error("Search failed:", err); }
    };

    const handleRequestJoin = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            alert('Join request sent!');
            setSearchResults(prev => prev.filter(r => r._id !== roomId));
        } catch (err) { alert('Failed to send join request.'); }
    };

    // --- FIX: More Robust Accept Invite Logic ---
    const handleAcceptInvite = async (roomId) => {
        if (!roomId) {
            console.error("Cannot join room: Room ID is missing from invite.");
            return;
        }

        try {
            console.log(`Attempting to join room: ${roomId}`);

            // 1. Call Backend to add user to member list
            // We await this to ensure the user is a member BEFORE navigating
            const response = await axios.post(`/api/rooms/${roomId}/accept-invite`);

            console.log("Join response:", response.data);

            if (response.data.msg === 'Joined successfully' || response.data.msg === 'Already a member') {
                // 2. Navigate to the room immediately
                // Using replace: false to allow going back
                navigate(`/rooms/${roomId}`);
            } else {
                alert(`Could not join room: ${response.data.msg}`);
            }

            // 3. Refresh room list in background (don't await this to block nav)
            fetchRooms();

        } catch (err) {
            console.error("Failed to join room:", err);
            const errorMsg = err.response?.data?.msg || "Error joining room. It may have been deleted.";
            alert(errorMsg);
        }
    };

    const handleApproveJoin = async (roomID, userId, notificationId) => {
        try {
            await axios.post(`/api/rooms/${roomID}/approve-join`, { userId, notificationId });
            alert('User approved!');
            fetchNotifications(); // Refresh list to remove the request
        } catch (err) {
            console.error("Failed to approve:", err);
            alert("Failed to approve request.");
        }
    };

    if (loading || !user) return <div className="dashboard-layout" style={{ padding: '2rem' }}><h1>Loading...</h1></div>;

    return (
        <>
            {editingRoom && <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onRoomUpdated={() => { setEditingRoom(null); fetchRooms(); }} />}

            {editingRoom && <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onRoomUpdated={() => { setEditingRoom(null); fetchRooms(); }} />}

            <div className="dashboard-container">
                <header className="dashboard-header">
                    <h2>~/dashboard</h2>
                    <div className="sys-status">
                        <span className="status-dot online"></span> SYSTEM ONLINE
                    </div>
                </header>

                <div className="dashboard-grid">
                    {/* LEFT COL: Notifications & Actions */}
                    <div className="dashboard-sidebar">

                        {/* 1. Notifications */}
                        <div className="term-card">
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
                                                    <button className="btn-term-action" onClick={() => handleAcceptInvite(n.relatedId)}>
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

                        {/* 2. Quick Match */}
                        <div className="term-card" style={{ marginTop: '1.5rem' }}>
                            <div className="term-header">
                                <span>quick_match.exe</span>
                            </div>
                            <div className="term-body">
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input type="text" className="term-input" placeholder="Enter skill..." />
                                    <button className="btn-term">GO</button>
                                </div>
                                <div style={{ marginTop: '0.8rem' }}>
                                    <Link to="/forum" className="term-link">&gt; Advanced Search...</Link>
                                </div>
                            </div>
                        </div>

                        {/* 3. Join Room */}
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
                    </div>

                    {/* RIGHT COL: Main Room Management */}
                    <div className="dashboard-main">

                        {/* Create Room */}
                        <div className="term-card mb-4">
                            <div className="term-header">
                                <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                                <span>mkdir new_room</span>
                            </div>
                            <div className="term-body">
                                <form onSubmit={handleCreateRoom} className="create-room-form">
                                    <div className="form-group">
                                        <label>&gt; Room Name:</label>
                                        <input type="text" className="term-input" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label>&gt; Description:</label>
                                        <input type="text" className="term-input" value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} />
                                    </div>
                                    <button type="submit" className="btn-term-primary">EXECUTE CREATE</button>
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
        </>
    );
};

export default DashboardPage;