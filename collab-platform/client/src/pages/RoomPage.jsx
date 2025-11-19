import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';

const RoomPage = () => {
    const { roomId } = useParams();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    
    const [room, setRoom] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [newProjectName, setNewProjectName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState('');
    const messagesEndRef = useRef(null);

    // 1. Fetch Room Data & Projects
    const fetchRoomData = useCallback(async () => {
        try {
            // Fetch Room Details
            const roomRes = await axios.get(`/api/rooms/${roomId}`);
            setRoom(roomRes.data);

            // Fetch Projects for this Room
            const projRes = await axios.get(`/api/projects/room/${roomId}`);
            setProjects(projRes.data);
            
            // Fetch Chat History
            const msgRes = await axios.get(`/api/rooms/${roomId}/messages`);
            setMessages(msgRes.data);

            setLoading(false);
        } catch (err) {
            console.error("Error fetching room data:", err);
            if (err.response?.status === 404) {
                setError('Room not found.');
            } else if (err.response?.status === 403) {
                setError('Access Denied: You must join this room to view it.');
            } else {
                setError('Failed to load room data.');
            }
            setLoading(false);
        }
    }, [roomId]);

    useEffect(() => {
        if (user) fetchRoomData();
    }, [fetchRoomData, user]);

    // 2. Socket Connection & Chat
    useEffect(() => {
        if (!user || !room) return;

        // Join the socket room
        console.log("Joining room:", roomId);
        socket.emit('joinRoom', { roomId });

        const handleMessage = (msg) => {
            console.log("Received message:", msg);
            setMessages((prev) => [...prev, msg]);
        };
        
        // Listen for room updates (projects added/removed)
        const handleRoomUpdate = (data) => {
            console.log("Room updated:", data);
            // Re-fetch projects to ensure sync
            axios.get(`/api/projects/room/${roomId}`)
                .then(res => setProjects(res.data))
                .catch(err => console.error("Failed to refresh projects", err));
        };

        socket.on('message', handleMessage);
        socket.on('room-update', handleRoomUpdate);

        return () => {
            socket.off('message', handleMessage);
            socket.off('room-update', handleRoomUpdate);
            // Optional: socket.emit('leaveRoom', { roomId });
        };
    }, [roomId, user, room]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (messageInput.trim()) {
            console.log("Sending message:", messageInput);
            socket.emit('chatMessage', {
                roomId,
                senderId: user._id,
                text: messageInput
            });
            setMessageInput('');
        }
    };

    // 3. Create Project Logic
    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        try {
            setIsCreating(true);
            const res = await axios.post('/api/projects', {
                name: newProjectName,
                roomId: roomId, // Match backend expectation
                description: `Project created by ${user.username}`
            });
            
            // Optimistic update (Socket will also trigger refresh)
            setProjects([res.data, ...projects]);
            setNewProjectName('');
            setIsCreating(false);
        } catch (err) {
            console.error("Failed to create project:", err);
            alert("Failed to create project. Please try again.");
            setIsCreating(false);
        }
    };
    
    // Delete Project Logic
    const handleDeleteProject = async (projectId) => {
        if(!window.confirm("Are you sure you want to delete this project?")) return;
        try {
            await axios.delete(`/api/projects/${projectId}`);
            // Optimistic update
            setProjects(projects.filter(p => p._id !== projectId));
        } catch (err) {
            console.error("Failed to delete project", err);
            alert("Failed to delete project");
        }
    };

    // --- RENDER HELPERS ---

    if (loading) return <div className="container" style={{ paddingTop: '2rem', color: '#fff' }}>Loading Room...</div>;
    
    if (error) return (
        <div className="container" style={{ paddingTop: '2rem', color: '#fff', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--accent-primary)' }}>⚠️ {error}</h2>
            <button className="btn" onClick={() => navigate('/dashboard')}>Return to Dashboard</button>
        </div>
    );

    if (!room) return null;

    const isOwner = user._id === room.owner._id;

    return (
        <div className="room-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', padding: '2rem', height: 'calc(100vh - 80px)', boxSizing: 'border-box' }}>
            
            {/* --- LEFT COLUMN: CHAT --- */}
            <div className="main-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--accent-primary)' }}>{room.name}</h1>
                    <p style={{ color: '#888', margin: '5px 0 0 0' }}>{room.description || "No description"}</p>
                </div>

                <div className="chat-window" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', overflow: 'hidden' }}>
                    <div className="messages-area" style={{ flexGrow: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {messages.length === 0 && <div style={{ textAlign: 'center', color: '#555', marginTop: '2rem' }}>No messages yet. Start chatting!</div>}
                        {messages.map((msg, index) => {
                            const isMe = msg.sender._id === user._id;
                            return (
                                <div key={index} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#888', marginBottom: '2px' }}>{msg.sender.username}</span>
                                    <div style={{ background: isMe ? 'var(--accent-primary)' : '#21262d', color: isMe ? '#000' : '#c9d1d9', padding: '0.6rem 1rem', borderRadius: '12px', borderTopRightRadius: isMe ? '2px' : '12px', borderTopLeftRadius: isMe ? '12px' : '2px', wordBreak: 'break-word' }}>{msg.text}</div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={sendMessage} style={{ padding: '1rem', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            value={messageInput} 
                            onChange={(e) => setMessageInput(e.target.value)} 
                            placeholder="Type a message..." 
                            style={{ flexGrow: 1, padding: '0.8rem', borderRadius: '6px', border: '1px solid #30363d', background: '#0d1117', color: '#fff' }} 
                        />
                        <button type="submit" className="btn" style={{ padding: '0 1.5rem' }}>Send</button>
                    </form>
                </div>
            </div>

            {/* --- RIGHT COLUMN: SIDEBAR --- */}
            <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                
                {/* PROJECTS SECTION */}
                <div className="main-panel" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginTop: 0, color: '#fff', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>PROJECTS</h3>
                    
                    <ul className="project-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem 0' }}>
                        {projects.length > 0 ? projects.map(proj => (
                            <li key={proj._id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <Link to={`/projects/${proj._id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 'bold', display: 'block' }}>
                                        {proj.name} &rarr;
                                    </Link>
                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                                        {new Date(proj.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                {/* Allow delete if Owner OR if it's the user's own project */}
                                {(isOwner || proj.owner === user._id) && (
                                    <button 
                                        onClick={() => handleDeleteProject(proj._id)} 
                                        className="btn-delete" 
                                        style={{ padding: '2px 6px', fontSize: '0.7rem', marginLeft: '5px', background: 'transparent', border: '1px solid #d32f2f', color: '#d32f2f', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        Del
                                    </button>
                                )}
                            </li>
                        )) : (
                            <li style={{ color: '#666', padding: '0.5rem 0', fontStyle: 'italic' }}>No projects yet.</li>
                        )}
                    </ul>

                    {/* Create Project Form (Inline) */}
                    <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                        <input 
                            type="text" 
                            placeholder="New Project Name" 
                            value={newProjectName} 
                            onChange={(e) => setNewProjectName(e.target.value)} 
                            style={{ padding: '0.5rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} 
                        />
                        <button type="submit" className="btn-secondary" disabled={isCreating || !newProjectName}>
                            {isCreating ? 'Creating...' : '+ Create Project'}
                        </button>
                    </form>
                </div>
                
                {/* MEMBERS SECTION */}
                <div className="main-panel" style={{ padding: '1rem', flexGrow: 1 }}>
                    <h3 style={{ fontSize: '1rem', marginTop: 0, color: '#fff', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>MEMBERS ({room.members.length + 1})</h3>
                    <ul className="member-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {/* Owner */}
                        <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #333', color: 'var(--accent-primary)' }}>
                            {room.owner.username} <span style={{ fontSize: '0.7rem', border: '1px solid var(--accent-primary)', padding: '1px 4px', borderRadius: '4px', marginLeft: '5px' }}>OWNER</span>
                        </li>
                        {/* Members */}
                        {room.members.map(member => (
                            <li key={member._id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #333', color: '#c9d1d9' }}>
                                {member.username}
                            </li>
                        ))}
                    </ul>
                </div>
                
                <button className="btn-secondary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')}>Leave Room</button>
            </div>
        </div>
    );
};

export default RoomPage;