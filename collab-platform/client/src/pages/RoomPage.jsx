import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import VoiceChannelList from '../components/voice/VoiceChannelList';
import VoiceStage from '../components/voice/VoiceStage';
import RoomChat from '../components/chat/RoomChat';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import ManageMembersModal from '../components/projects/ManageMembersModal';
import { VscFolder, VscFileCode, VscChevronDown, VscChevronRight, VscNewFile, VscNewFolder, VscRefresh, VscEllipsis, VscAccount, VscSignOut, VscTrash, VscOrganization, VscAdd, VscCallOutgoing } from "react-icons/vsc";
import { FaTerminal, FaCrown, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash } from "react-icons/fa";

const RoomPage = () => {
    const { roomId: id } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    const [room, setRoom] = useState(null);
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);

    // Projects State
    const [projects, setProjects] = useState([]);
    const [showCreateProject, setShowCreateProject] = useState(false);
    const [manageMembersProject, setManageMembersProject] = useState(null);
    const [roomMembers, setRoomMembers] = useState([]);

    // Feature state: Tasks
    const [tasks, setTasks] = useState([]);
    const [taskInput, setTaskInput] = useState('');

    // Track users who have already sent join message to prevent duplicates.
    // A ref, not state: the socket handlers are created once per room, so state would be stale.
    const usersJoinedNotifiedRef = useRef(new Set());

    // --- 1. Load Data ---
    useEffect(() => {
        const fetchRoomData = async () => {
            try {
                const roomRes = await axios.get(`/api/rooms/${id}`);
                setRoom(roomRes.data);
                // Store actual room members from DB (includes owner)
                const allMembers = roomRes.data.members || [];
                const ownerData = roomRes.data.owner;
                // Build full members list including owner
                const ownerInMembers = allMembers.some(m => (m._id || m) === (ownerData._id || ownerData));
                const fullMembers = ownerInMembers ? allMembers : [ownerData, ...allMembers];
                setRoomMembers(fullMembers);
                // (Online users come from the socket 'roomUsers' event, not the member list)

                const msgRes = await axios.get(`/api/rooms/${id}/messages`);
                setMessages(msgRes.data);

                // Fetch Projects
                const projRes = await axios.get(`/api/projects/room/${id}`);
                setProjects(projRes.data);

            } catch (err) {
                console.error(err);
                const status = err.response?.status;
                if (status === 403 || status === 404) {
                    alert(status === 403 ? 'You are not a member of this room.' : 'This room no longer exists.');
                    navigate('/dashboard');
                } else {
                    alert('Failed to load room. Please try again.');
                }
            }
        };
        fetchRoomData();
    }, [id, navigate]);

    // --- 2. Socket Logic ---
    useEffect(() => {
        if (!user || !id) return;

        // Join the socket room (the server identifies us from the auth token).
        // Re-join after every reconnect, otherwise chat/presence silently stop after a network blip.
        const joinSocketRoom = () => socket.emit('joinRoom', { roomId: id });
        joinSocketRoom();
        socket.on('connect', joinSocketRoom);

        // Listeners
        const handleReceiveMessage = (msg) => {
            if (msg.parent) return; // thread replies are shown in their thread (RoomChat)
            // Filter out duplicate join messages
            const isJoinMessage = msg.sender?.username === 'System' && msg.text?.includes('has joined the room');
            if (isJoinMessage) {
                const username = msg.text.replace(' has joined the room.', '');
                if (usersJoinedNotifiedRef.current.has(username)) {
                    return; // Skip duplicate join message
                }
                usersJoinedNotifiedRef.current.add(username);
            }
            setMessages((prev) => [...prev, msg]);
        };

        const handleRoomDeleted = () => {
            alert('This room was deleted by its owner.');
            navigate('/dashboard');
        };

        const handleRoomError = (data) => {
            if (data?.roomId === id) console.warn('[room]', data.msg);
        };

        const handleRoomUsers = (users) => {
            const unique = [];
            const map = new Map();
            for (const item of users) {
                if (!map.has(item.userId)) {
                    map.set(item.userId, true);
                    unique.push(item);
                }
            }
            setActiveUsers(unique);
        };

        const handleRoomUpdate = () => {
            // Re-fetch rooms or projects if needed
            // For now, let's re-fetch projects as they might have changed
            const fetchProjects = async () => {
                try {
                    const res = await axios.get(`/api/projects/room/${id}`);
                    setProjects(res.data);
                } catch (e) { console.error(e); }
            };
            fetchProjects();
        };

        const handleRoomMembersUpdated = (data) => {
            // The member roster changed (not who is online) — rebuild the full list with the owner first
            const members = data.members || [];
            setRoom(prev => {
                if (!prev) return prev;
                const owner = prev.owner;
                const ownerId = owner?._id || owner;
                setRoomMembers(members.some(m => m._id === ownerId) ? members : [owner, ...members]);
                return { ...prev, members };
            });
        };

        socket.on('message', handleReceiveMessage);
        socket.on('roomUsers', handleRoomUsers);
        socket.on('room-update', handleRoomUpdate); // Listen for generic room updates (like new projects)
        socket.on('room-members-updated', handleRoomMembersUpdated);
        socket.on('room-deleted', handleRoomDeleted);
        socket.on('room-error', handleRoomError);

        return () => {
            socket.emit('leaveRoom', { roomId: id });
            socket.off('connect', joinSocketRoom);
            socket.off('room-deleted', handleRoomDeleted);
            socket.off('room-error', handleRoomError);
            socket.off('message', handleReceiveMessage);
            socket.off('roomUsers', handleRoomUsers);
            socket.off('room-update', handleRoomUpdate);
            socket.off('room-members-updated', handleRoomMembersUpdated);
        };
    }, [id, user, navigate]);

    // --- 5. Handlers ---
    const handleAddTask = (e) => {
        e.preventDefault();
        if (!taskInput.trim()) return;
        setTasks([...tasks, { id: Date.now(), text: taskInput, completed: false }]);
        setTaskInput('');
    };

    const toggleTask = (taskId) => {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    };

    const removeTask = (taskId) => {
        setTasks(tasks.filter(t => t.id !== taskId));
    };

    // Project Created Handler
    const handleProjectCreated = (newProject) => {
        // Optimistically add, or just wait for socket 'room-update'
        setProjects(prev => [newProject, ...prev]);
        setShowCreateProject(false);
    };

    // Delete Project Handler
    const handleDeleteProject = async (e, projectId, projectName) => {
        e.stopPropagation(); // Don't navigate to project
        if (!window.confirm(`Are you sure you want to delete "${projectName}"? This cannot be undone.`)) return;
        try {
            await axios.delete(`/api/projects/${projectId}`);
            setProjects(prev => prev.filter(p => p._id !== projectId));
        } catch (err) {
            console.error('Failed to delete project:', err);
            alert(err.response?.data?.msg || 'Failed to delete project.');
        }
    };

    // Members updated handler
    const handleMembersUpdated = () => {
        // Re-fetch projects to get updated member lists
        const fetchProjects = async () => {
            try {
                const res = await axios.get(`/api/projects/room/${id}`);
                setProjects(res.data);
            } catch (e) { console.error(e); }
        };
        fetchProjects();
    };

    const handleLeaveRoom = () => {
        socket.emit('leaveRoom', { roomId: id, userId: user._id });
        navigate('/dashboard');
    };

    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default OPEN for Tiling View
    const [isChatOpen, setIsChatOpen] = useState(true); // Default OPEN for Tiling View

    // Toggle Sidebar Key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 'b') { // VS Code default toggle sidebar
                e.preventDefault();
                setIsSidebarOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!room) return <div className="container" style={{ paddingTop: '3rem' }}>Loading Room...</div>;

    return (
        <div className="war-room-grid">

            {/* COLUMN 1: SIDEBAR (VS Code Style) */}
            <aside
                className="tiled-sidebar"
                style={{
                    width: isSidebarOpen ? '280px' : '0px',
                    backgroundColor: '#252526',
                    color: '#cccccc',
                    borderRight: '1px solid #000',
                    display: 'flex',
                    flexDirection: 'column',
                    fontSize: '15px'
                }}
            >
                <div style={{ padding: '0px', overflowY: 'auto', flex: 1 }}>

                    {/* EXPLORER HEADER */}
                    <div style={{
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#bbbbbb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        letterSpacing: '1px'
                    }}>
                        <span>EXPLORER</span>
                        <VscEllipsis style={{ cursor: 'pointer', fontSize: '16px' }} onClick={() => setIsSidebarOpen(false)} title="Close Sidebar" />
                    </div>

                    {/* SECTION: WORKSPACE (Projects) */}
                    <div className="vscode-section">
                        <div className="vscode-section-header group" style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold', justifyContent: 'space-between', fontSize: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <VscChevronDown style={{ marginRight: '6px', fontSize: '14px' }} />
                                <span>{room.name.toUpperCase()}</span>
                            </div>
                            {/* Action Icons */}
                            <div className="action-icons" style={{ display: 'flex', gap: '8px' }}>
                                <VscNewFile style={{ cursor: 'pointer', fontSize: '16px' }} onClick={() => setShowCreateProject(true)} title="New Project" />
                                <VscRefresh style={{ cursor: 'pointer', fontSize: '16px' }} onClick={() => socket.emit('room-update')} title="Refresh" />
                            </div>
                        </div>

                        {/* PROJECT LIST */}
                        <ul className="vscode-file-list" style={{ marginTop: '0' }}>
                            {projects.map(proj => (
                                <li key={proj._id} className="vscode-file-item"
                                    style={{
                                        padding: '7px 20px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        color: '#cccccc',
                                        fontSize: '14px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#37373d';
                                        e.currentTarget.querySelector('.proj-actions').style.opacity = '1';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.querySelector('.proj-actions').style.opacity = '0';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }} onClick={() => navigate(`/projects/${proj._id}`)}>
                                        <VscChevronRight style={{ marginRight: '5px', fontSize: '13px', flexShrink: 0 }} />
                                        <VscFolder style={{ marginRight: '6px', color: '#dcb67a', fontSize: '15px', flexShrink: 0 }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                                    </div>
                                    {/* Project Action Icons (show on hover) */}
                                    <div className="proj-actions" style={{ display: 'flex', gap: '6px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0, marginLeft: '8px' }}>
                                        <VscOrganization
                                            style={{ cursor: 'pointer', fontSize: '15px', color: '#58a6ff' }}
                                            title="Manage Members"
                                            onClick={(e) => { e.stopPropagation(); setManageMembersProject(proj); }}
                                        />
                                        <VscTrash
                                            style={{ cursor: 'pointer', fontSize: '15px', color: '#f85149' }}
                                            title="Delete Project"
                                            onClick={(e) => handleDeleteProject(e, proj._id, proj.name)}
                                        />
                                    </div>
                                </li>
                            ))}
                            <li className="vscode-file-item" onClick={() => setShowCreateProject(true)}
                                style={{ padding: '7px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7, fontSize: '14px' }}
                            >
                                <span style={{ marginLeft: '22px', fontStyle: 'italic' }}>+ Create Project...</span>
                            </li>
                        </ul>
                    </div>

                    {/* SECTION: VOICE CHANNELS (Discord-style, live presence) */}
                    <div className="vscode-section" style={{ marginTop: '10px' }}>
                        <div className="vscode-section-header" style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', fontWeight: 'bold', fontSize: '14px' }}>
                            <VscChevronDown style={{ marginRight: '6px', fontSize: '14px' }} />
                            <span>VOICE CHANNELS</span>
                        </div>
                        <VoiceChannelList
                            roomId={id}
                            roomName={room.name}
                            userId={user?._id}
                            isOwner={(room.owner?._id || room.owner) === user?._id}
                        />
                    </div>

                    {/* SECTION: TEAM MEMBERS (Room Members from DB) */}
                    <div className="vscode-section" style={{ marginTop: '10px' }}>
                        <div className="vscode-section-header" style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                            <VscChevronDown style={{ marginRight: '6px', fontSize: '14px' }} />
                            <span>TEAM MEMBERS ({roomMembers.length})</span>
                        </div>
                        <ul className="vscode-file-list">
                            {roomMembers.map((member, i) => {
                                const memberId = member._id || member;
                                const memberUsername = member.username || 'Unknown';
                                const isOwner = room.owner && (room.owner._id || room.owner) === memberId;
                                const isOnline = activeUsers.some(au => (au.userId || au._id) === memberId);
                                return (
                                    <li key={i} className="vscode-file-item" style={{ padding: '7px 20px', display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                                        {/* Online status dot */}
                                        <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: isOnline ? '#3fb950' : '#484f58',
                                            marginRight: '10px',
                                            flexShrink: 0,
                                            boxShadow: isOnline ? '0 0 6px rgba(63, 185, 80, 0.5)' : 'none'
                                        }} title={isOnline ? 'Online' : 'Offline'} />
                                        <VscAccount style={{ marginRight: '8px', color: isOwner ? '#f0883e' : '#58a6ff', fontSize: '16px', flexShrink: 0 }} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberUsername}</span>
                                        {isOwner && (
                                            <FaCrown style={{ color: '#f0883e', fontSize: '12px', marginLeft: '6px', flexShrink: 0 }} title="Room Owner" />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {/* Invite link + leave */}
                        <div style={{ padding: '12px 20px', display: 'grid', gap: 8 }}>
                            <button
                                className="ui-btn"
                                style={{ width: '100%' }}
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href)
                                        .then(() => toast.success('Invite link copied'))
                                        .catch(() => toast.error("Couldn't copy. Copy the address bar instead."));
                                }}
                            >
                                Copy invite link
                            </button>
                            <button className="ui-btn quiet danger" style={{ width: '100%' }} onClick={handleLeaveRoom}>
                                <VscSignOut style={{ fontSize: '16px' }} /> Leave room
                            </button>
                        </div>
                    </div>

                </div>
            </aside>

            {/* COLUMN 2: MAIN CONTENT (Video) */}
            <main className="tiled-main">
                {/* Sidebar Toggle (Visible if closed) */}
                {!isSidebarOpen && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 60, background: '#252526', border: '1px solid #333', color: '#fff', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}
                    >
                        <VscFolder />
                    </button>
                )}

                {/* Chat Toggle (Visible if closed) */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 60, background: 'rgba(0,0,0,0.6)', border: '1px solid #333', color: '#fff', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer' }}
                    >
                        <FaTerminal />
                    </button>
                )}

                {/* Center: the voice/video call (or a lobby to join one) */}
                <VoiceStage roomId={id} roomName={room.name} />
            </main>

            {/* COLUMN 3: TERMINAL CHAT */}
            <div className={`tiled-chat ${!isChatOpen ? 'collapsed' : ''}`}>
                <div className="terminal-header">
                    <span>CHAT · #{room.name}</span>
                    <button className="icon-btn" onClick={() => setIsChatOpen(false)} title="Hide Terminal">_</button>
                </div>

                {/* Shared goals for the session */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', background: '#0d1117' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '4px' }}>
                        GOALS ({tasks.filter(t => t.completed).length}/{tasks.length})
                    </div>
                    <div style={{ maxHeight: '70px', overflowY: 'auto', marginBottom: '4px' }}>
                        {tasks.map(t => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', marginBottom: '2px', color: '#c9d1d9' }}>
                                <span style={{ color: t.completed ? '#3fb950' : '#8b949e', marginRight: '6px' }}>{t.completed ? '[x]' : '[ ]'}</span>
                                <span style={{ textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.6 : 1, cursor: 'pointer', flex: 1 }} onClick={() => toggleTask(t.id)}>{t.text}</span>
                                <span style={{ color: '#6e7681', cursor: 'pointer', marginLeft: '6px' }} onClick={() => removeTask(t.id)} title="Remove">×</span>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleAddTask}>
                        <input
                            className="cmd-input"
                            style={{ padding: '4px', fontSize: '0.75rem', border: 'none', borderBottom: '1px solid #30363d', borderRadius: 0 }}
                            placeholder="+ Add goal…"
                            value={taskInput}
                            onChange={(e) => setTaskInput(e.target.value)}
                        />
                    </form>
                </div>

                <RoomChat
                    roomId={id}
                    roomName={room.name}
                    messages={messages}
                    setMessages={setMessages}
                    members={roomMembers}
                    currentUser={user}
                />
            </div>

            {/* Modals */}
            {showCreateProject && (
                <CreateProjectModal
                    roomId={id}
                    onClose={() => setShowCreateProject(false)}
                    onProjectCreated={handleProjectCreated}
                />
            )}
            {manageMembersProject && (
                <ManageMembersModal
                    project={manageMembersProject}
                    roomMembers={roomMembers}
                    roomOwner={room.owner}
                    onClose={() => setManageMembersProject(null)}
                    onMembersUpdated={handleMembersUpdated}
                />
            )}

        </div>
    );
};

export default RoomPage;