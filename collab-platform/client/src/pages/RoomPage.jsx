import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import VideoGrid from '../components/rooms/VideoGrid';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import { VscFolder, VscFileCode, VscChevronDown, VscChevronRight, VscNewFile, VscNewFolder, VscRefresh, VscEllipsis, VscAccount, VscPlay, VscDebugRestart, VscDebugPause, VscSignOut } from "react-icons/vsc";
import { FaTerminal } from "react-icons/fa";

const RoomPage = () => {
    const { roomId: id } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);
    const [room, setRoom] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeUsers, setActiveUsers] = useState([]);

    // Projects State
    const [projects, setProjects] = useState([]);
    const [showCreateProject, setShowCreateProject] = useState(false);

    // Feature state: Timer
    const [timer, setTimer] = useState(25 * 60);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [timerMode, setTimerMode] = useState('focus'); // focus | break

    // Feature state: Tasks
    const [tasks, setTasks] = useState([]);
    const [taskInput, setTaskInput] = useState('');

    // Refs
    const chatEndRef = useRef(null);

    // --- 1. Load Data ---
    useEffect(() => {
        const fetchRoomData = async () => {
            try {
                const roomRes = await axios.get(`/api/rooms/${id}`);
                setRoom(roomRes.data);
                // Initial members from DB, but socket will update likely
                setActiveUsers(roomRes.data.members || []);

                const msgRes = await axios.get(`/api/rooms/${id}/messages`);
                setMessages(msgRes.data);

                // Fetch Projects
                const projRes = await axios.get(`/api/projects/room/${id}`);
                setProjects(projRes.data);

            } catch (err) {
                console.error(err);
                alert("Failed to load room. Check console needed.");
                // navigate('/dashboard'); // DEBUG: Disable auto-redirect
            }
        };
        fetchRoomData();
    }, [id /*, navigate */]); // Remove navigate dependency for now

    // --- 2. Socket Logic ---
    useEffect(() => {
        if (!user || !id) return;

        // Join the socket room WITH user info
        socket.emit('joinRoom', { roomId: id, user });

        // Listeners
        const handleReceiveMessage = (msg) => setMessages((prev) => [...prev, msg]);

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

        const handleTimerUpdate = ({ timer: t, isRunning: r, mode: m }) => {
            setTimer(t);
            setIsTimerRunning(r);
            setTimerMode(m);
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

        socket.on('message', handleReceiveMessage);
        socket.on('roomUsers', handleRoomUsers);
        socket.on('timerUpdate', handleTimerUpdate);
        socket.on('room-update', handleRoomUpdate); // Listen for generic room updates (like new projects)

        return () => {
            socket.emit('leaveRoom', { roomId: id, userId: user._id });
            socket.off('message', handleReceiveMessage);
            socket.off('roomUsers', handleRoomUsers);
            socket.off('timerUpdate', handleTimerUpdate);
            socket.off('room-update', handleRoomUpdate);
        };
    }, [id, user]);

    // --- 3. Auto-scroll Chat ---
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- 4. Timer Logic (Owner/Sync) ---
    useEffect(() => {
        let interval = null;
        if (isTimerRunning && timer > 0) {
            interval = setInterval(() => {
                setTimer(prev => {
                    const newVal = prev - 1;
                    return newVal;
                });
            }, 1000);
        } else if (timer === 0) {
            setIsTimerRunning(false);
        }
        return () => clearInterval(interval);
    }, [isTimerRunning, timer]);

    const broadcastTimer = (newTimer, newRunning, newMode) => {
        socket.emit('timerUpdate', { roomId: id, timer: newTimer, isRunning: newRunning, mode: newMode });
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const toggleTimer = () => {
        const newState = !isTimerRunning;
        setIsTimerRunning(newState);
        broadcastTimer(timer, newState, timerMode);
    };

    const resetTimer = () => {
        const newTime = timerMode === 'focus' ? 25 * 60 : 5 * 60;
        setIsTimerRunning(false);
        setTimer(newTime);
        broadcastTimer(newTime, false, timerMode);
    };

    const switchMode = (mode) => {
        setTimerMode(mode);
        setIsTimerRunning(false);
        const newTime = mode === 'focus' ? 25 * 60 : 5 * 60;
        setTimer(newTime);
        broadcastTimer(newTime, false, mode);
    };

    const handleCustomTime = (minutes) => {
        const newTime = minutes * 60;
        setTimer(newTime);
        setIsTimerRunning(true); // Auto-start custom timer
        broadcastTimer(newTime, true, 'custom');
    };



    // --- 5. Handlers ---
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const payload = {
            roomId: id,
            text: newMessage,
            senderId: user._id
        };

        socket.emit('chatMessage', payload);
        setNewMessage('');
    };

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
                    width: isSidebarOpen ? '250px' : '0px',
                    backgroundColor: '#252526', // Official VS Code Sidebar Color
                    color: '#cccccc',
                    borderRight: '1px solid #000',
                    display: 'flex',
                    flexDirection: 'column',
                    fontSize: '13px' // VS Code default font size
                }}
            >
                <div style={{ padding: '0px' }}>

                    {/* EXPLORER HEADER */}
                    <div style={{
                        padding: '10px 20px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: '#bbbbbb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span>EXPLORER</span>
                        <VscEllipsis style={{ cursor: 'pointer' }} onClick={() => setIsSidebarOpen(false)} title="Close Sidebar" />
                    </div>

                    {/* SECTION: OPEN EDITORS (Fake) */}
                    <div className="vscode-section" style={{ borderTop: 'none' }}>
                        <div className="vscode-section-header" style={{ display: 'flex', alignItems: 'center', padding: '4px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
                            <VscChevronDown style={{ marginRight: '4px' }} />
                            <span>OPEN EDITORS</span>
                        </div>
                        {/* Empty for now, or maybe show active file */}
                    </div>

                    {/* SECTION: WORKSPACE (Projects) */}
                    <div className="vscode-section">
                        <div className="vscode-section-header group" style={{ display: 'flex', alignItems: 'center', padding: '4px 20px', cursor: 'pointer', fontWeight: 'bold', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <VscChevronDown style={{ marginRight: '4px' }} />
                                <span>{room.name.toUpperCase()}</span>
                            </div>
                            {/* Action Icons (Horizontal) */}
                            <div className="action-icons" style={{ display: 'flex', gap: '5px' }}>
                                <VscNewFile style={{ cursor: 'pointer' }} onClick={() => setShowCreateProject(true)} title="New Project" />
                                <VscRefresh style={{ cursor: 'pointer' }} onClick={() => socket.emit('room-update')} title="Refresh" />
                            </div>
                        </div>

                        {/* PROJECT LIST */}
                        <ul className="vscode-file-list" style={{ marginTop: '0' }}>
                            {projects.map(proj => (
                                <li key={proj._id} className="vscode-file-item" onClick={() => navigate(`/projects/${proj._id}`)}
                                    style={{
                                        padding: '3px 20px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: '#cccccc'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <VscChevronRight style={{ marginRight: '5px', fontSize: '12px' }} />
                                    <VscFolder style={{ marginRight: '6px', color: '#dcb67a' }} />
                                    <span>{proj.name}</span>
                                </li>
                            ))}
                            <li className="vscode-file-item" onClick={() => setShowCreateProject(true)}
                                style={{ padding: '3px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                            >
                                <span style={{ marginLeft: '22px', fontStyle: 'italic' }}>+ Create Project...</span>
                            </li>
                        </ul>
                    </div>

                    {/* SECTION: TEAM MEMBERS */}
                    <div className="vscode-section" style={{ marginTop: '10px' }}>
                        <div className="vscode-section-header" style={{ display: 'flex', alignItems: 'center', padding: '4px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
                            <VscChevronDown style={{ marginRight: '4px' }} />
                            <span>TEAM MEMBERS ({activeUsers.length})</span>
                        </div>
                        <ul className="vscode-file-list">
                            {activeUsers.map((u, i) => (
                                <li key={i} className="vscode-file-item" style={{ padding: '3px 20px', display: 'flex', alignItems: 'center' }}>
                                    <VscAccount style={{ marginRight: '8px', color: '#58a6ff' }} />
                                    <span>{u.username}</span>
                                </li>
                            ))}
                        </ul>
                        {/* Invite Link */}
                        <div style={{ padding: '10px 20px' }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    alert('Invite Link Copied!');
                                }}
                                style={{
                                    background: '#0e639c',
                                    color: 'white',
                                    border: 'none',
                                    width: '100%',
                                    padding: '5px',
                                    cursor: 'pointer',
                                    fontSize: '11px'
                                }}
                            >
                                Copy Invite Link
                            </button>
                        </div>
                        {/* Leave Button */}
                        <div style={{ padding: '0 20px 10px 20px' }}>
                            <button
                                onClick={handleLeaveRoom}
                                style={{
                                    background: '#d32f2f',
                                    color: 'white',
                                    border: 'none',
                                    width: '100%',
                                    padding: '5px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px'
                                }}
                            >
                                <VscSignOut /> Leave Room
                            </button>
                        </div>
                    </div>

                </div>
            </aside>

            {/* COLUMN 2: MAIN CONTENT (Video + Overlay Timer) */}
            <main className="tiled-main">
                {/* Timer Overlay */}
                <div className="overlay-timer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontSize: '1.2rem', fontFamily: 'monospace' }}>{formatTime(timer)}</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="icon-btn" onClick={toggleTimer} title={isTimerRunning ? "Pause" : "Start"}>
                                {isTimerRunning ? <VscDebugPause /> : <VscPlay />}
                            </button>
                            <button className="icon-btn" onClick={resetTimer} title="Reset">
                                <VscDebugRestart />
                            </button>
                        </div>
                        {/* Custom Time Input */}
                        <div className="timer-presets" style={{ display: 'flex', gap: '5px', marginLeft: '10px' }}>
                            <button className="timer-btn" onClick={() => handleCustomTime(25)}>25m</button>
                            <button className="timer-btn" onClick={() => handleCustomTime(5)}>5m</button>
                            <input
                                type="number"
                                placeholder="Min"
                                style={{ width: '40px', background: 'rgba(0,0,0,0.5)', border: '1px solid #555', color: 'white', fontSize: '10px', padding: '2px' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleCustomTime(parseInt(e.target.value) || 25);
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

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

                {/* Main Video Grid */}
                <VideoGrid roomId={id} user={user} onLeave={handleLeaveRoom} />
            </main>

            {/* COLUMN 3: TERMINAL CHAT */}
            <div className={`tiled-chat ${!isChatOpen ? 'collapsed' : ''}`}>
                <div className="terminal-header">
                    <span>TERMINAL LOG (~/chat)</span>
                    <button className="icon-btn" onClick={() => setIsChatOpen(false)} title="Hide Terminal">_</button>
                </div>

                <div className="terminal-log-area">
                    {/* Welcome / System Message */}
                    <div className="log-entry">
                        <span className="log-timestamp">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                        <span className="log-system">System: Connected to {room.name}...</span>
                    </div>

                    {messages.map((m, i) => (
                        <div key={i} className="log-entry">
                            <span className="log-timestamp">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                            <span className="log-user" style={{ color: m.sender?._id === user._id ? '#f0883e' : '#3fb950' }}>{m.sender?.username || 'Anon'}:</span>
                            <span className="log-content">{m.text}</span>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Tasks / Controls Mini-Panel */}
                <div style={{ padding: '10px', borderTop: '1px solid var(--border-subtle)', background: '#0d1117' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>GOALS ({tasks.filter(t => t.completed).length}/{tasks.length})</span>
                    </div>
                    <div style={{ maxHeight: '80px', overflowY: 'auto', marginBottom: '8px' }}>
                        {tasks.map(t => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', marginBottom: '2px', color: '#c9d1d9' }}>
                                <span style={{ color: t.completed ? '#3fb950' : '#8b949e', marginRight: '6px' }}>{t.completed ? '[x]' : '[ ]'}</span>
                                <span style={{ textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.6 : 1, cursor: 'pointer' }} onClick={() => toggleTask(t.id)}>{t.text}</span>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleAddTask}>
                        <input
                            className="cmd-input"
                            style={{ padding: '4px', fontSize: '0.75rem', border: 'none', borderBottom: '1px solid #30363d', borderRadius: 0 }}
                            placeholder="+ Add task..."
                            value={taskInput}
                            onChange={(e) => setTaskInput(e.target.value)}
                        />
                    </form>
                </div>

                <div className="terminal-input-area">
                    <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0' }}>
                        <span style={{ padding: '8px', color: '#3fb950', fontWeight: 'bold' }}>$</span>
                        <input
                            className="cmd-input"
                            placeholder="echo 'Hello world...'"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            autoFocus
                        />
                    </form>
                </div>
            </div>

            {/* Modals */}
            {showCreateProject && (
                <CreateProjectModal
                    roomId={id}
                    onClose={() => setShowCreateProject(false)}
                    onProjectCreated={handleProjectCreated}
                />
            )}
        </div>
    );
};

export default RoomPage;