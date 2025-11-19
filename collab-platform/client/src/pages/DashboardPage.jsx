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

    if (loading || !user) return <div className="dashboard-layout" style={{ padding: '2rem' }}><h1>Loading...</h1></div>;

    return (
        <>
            {editingRoom && <EditRoomModal room={editingRoom} onClose={() => setEditingRoom(null)} onRoomUpdated={() => { setEditingRoom(null); fetchRooms(); }} />}
            
            <div className="dashboard-layout">
                <div className="notifications-panel">
                    <h2>Notifications</h2>
                    {notifications.length > 0 ? (
                        <ul className="notifications-list">
                            {notifications.map(n => (
                                <li key={n._id} className="notification-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <div style={{ fontSize: '0.95rem' }}>{n.message}</div>
                                    
                                    {/* BUTTON VISIBLE ONLY IF TYPE IS INVITE AND ROOM ID EXISTS */}
                                    {n.type === 'invite' && n.relatedId && (
                                        <button 
                                            className="btn" 
                                            style={{ 
                                                padding: '0.4rem 1rem', 
                                                fontSize: '0.8rem', 
                                                backgroundColor: 'var(--accent-primary)',
                                                color: '#000',
                                                fontWeight: 'bold',
                                                marginTop: '5px',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => handleAcceptInvite(n.relatedId)}
                                        >
                                            Accept & Join
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : <p>No new notifications.</p>}
                </div>
                
                <div className="main-panel">
                    <div className="my-rooms-panel">
                        <h2>My Rooms</h2>
                        {myRooms.length > 0 ? (
                            <ul className="rooms-list">
                                {myRooms.map(room => (
                                    <li key={room._id} className="room-list-item">
                                        <Link to={`/rooms/${room._id}`}><strong>{room.name}</strong></Link>
                                        {user._id === room.owner._id && (
                                            <div className="room-actions">
                                                <button className="btn-action btn-edit" onClick={() => setEditingRoom(room)}>Edit</button>
                                                <button className="btn-action btn-delete" onClick={() => handleDelete(room._id)}>Delete</button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : <p>No rooms created.</p>}
                    </div>
                    <div className="create-room-panel">
                        <h2>Create Room</h2>
                        <form onSubmit={handleCreateRoom}>
                            <input type="text" placeholder="Room Name" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
                            <textarea placeholder="Description" value={roomDescription} onChange={(e) => setRoomDescription(e.target.value)} rows="2"></textarea>
                            <button type="submit" className="btn">Create</button>
                        </form>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="join-panel">
                        <h2>Quick Match</h2>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" placeholder="Skill..." style={{ marginBottom: 0 }} />
                            <button className="btn" style={{ padding: '0.5rem' }}>Go</button>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <Link to="/forum" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>Advanced Search &rarr;</Link>
                        </div>
                    </div>
                    <div className="join-panel">
                        <h2>Join Room</h2>
                        <form onSubmit={handleSearch}>
                            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            <button type="submit" className="btn">Search</button>
                        </form>
                        <ul className="rooms-list" style={{marginTop: '1rem'}}>
                            {searchResults.map(room => (
                                <li key={room._id} className="room-list-item">
                                    <span>{room.name}</span>
                                    {room.members?.some(m => m._id === user._id) ? 
                                        <span className="status-label member">Member</span> : 
                                        <button className="btn-action btn-join" onClick={() => handleRequestJoin(room._id)}>Request</button>
                                    }
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardPage;