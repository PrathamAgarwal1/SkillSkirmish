import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import VideoGrid from '../components/rooms/VideoGrid';
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
    const [newMessage, setNewMessage] = useState('');
    const [activeUsers, setActiveUsers] = useState([]);

    // Projects State
    const [projects, setProjects] = useState([]);
    const [showCreateProject, setShowCreateProject] = useState(false);
    const [manageMembersProject, setManageMembersProject] = useState(null);
    const [roomMembers, setRoomMembers] = useState([]);

    // Feature state: Tasks
    const [tasks, setTasks] = useState([]);
    const [taskInput, setTaskInput] = useState('');

    // Video Call State
    const [activeCalls, setActiveCalls] = useState([]);
    const [currentCallId, setCurrentCallId] = useState(null);
    const [isUserInCall, setIsUserInCall] = useState(false);
    const [canStartNewCall, setCanStartNewCall] = useState(true);
    const [videoCallError, setVideoCallError] = useState(null);

    // Create Call Modal State
    const [showCreateCallModal, setShowCreateCallModal] = useState(false);
    const [createCallName, setCreateCallName] = useState('');
    const [createCallMaxParticipants, setCreateCallMaxParticipants] = useState(10);
    const [expandedCalls, setExpandedCalls] = useState({});

    // Track users who have already sent join message to prevent duplicates
    const [usersJoinedNotified, setUsersJoinedNotified] = useState(new Set());

    // Refs
    const chatEndRef = useRef(null);
    const videoGridRef = useRef(null);

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
                setActiveUsers(roomRes.data.members || []);

                const msgRes = await axios.get(`/api/rooms/${id}/messages`);
                setMessages(msgRes.data);

                // Fetch Projects
                const projRes = await axios.get(`/api/projects/room/${id}`);
                setProjects(projRes.data);

                // Fetch active video calls
                try {
                    const callsRes = await axios.get(`/api/rooms/${id}/video-calls`);
                    setActiveCalls(callsRes.data.activeCalls || []);
                    setCanStartNewCall(callsRes.data.canStartNewCall || false);

                    // Check if current user is in any of the active calls
                    const calls = callsRes.data.activeCalls || [];
                    const userInCall = calls.some(call =>
                        call.participants.some(p => p.userId === user._id)
                    );
                    setIsUserInCall(userInCall);

                    // If user is in a call, set current call ID
                    if (userInCall) {
                        const userCall = calls.find(call =>
                            call.participants.some(p => p.userId === user._id)
                        );
                        if (userCall) {
                            setCurrentCallId(userCall.callId);
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch video calls:', err);
                }

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
        const handleReceiveMessage = (msg) => {
            // Filter out duplicate join messages
            const isJoinMessage = msg.sender?.username === 'System' && msg.text?.includes('has joined the room');
            if (isJoinMessage) {
                // Extract username from message
                const username = msg.text.replace(' has joined the room.', '');
                if (usersJoinedNotified.has(username)) {
                    return; // Skip duplicate join message
                }
                // Mark this user as notified
                setUsersJoinedNotified(prev => new Set([...prev, username]));
            }
            setMessages((prev) => [...prev, msg]);
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

        const handleVideoCallStarted = (data) => {
            setIsVideoCallActive(true);
            setVideoCallParticipants(data.participants || []);
            setVideoCallMaxSlots(data.maxSlots || 10);
            setVideoCallError(null);
        };

        const handleVideoCallEnded = () => {
            setIsVideoCallActive(false);
            setVideoCallParticipants([]);
            setIsUserInCall(false);
        };

        const handleVideoParticipantJoined = (data) => {
            setVideoCallParticipants(prev => {
                const exists = prev.some(p => p.userId === data.userId);
                return exists ? prev : [...prev, data];
            });
        };

        const handleVideoParticipantLeft = (data) => {
            setVideoCallParticipants(prev => prev.filter(p => p.userId !== data.userId));
        };

        const handleMultipleCallsUpdate = (data) => {
            setActiveCalls(data.activeCalls || []);
            setCanStartNewCall(data.canStartNewCall || false);

            // Check if current user is in any of the updated calls
            const calls = data.activeCalls || [];
            const userInCall = calls.some(call =>
                call.participants.some(p => p.userId === user._id)
            );
            setIsUserInCall(userInCall);
        };

        const handleRoomMembersUpdated = (data) => {
            // Update active users when members list is updated
            setActiveUsers(data.members || []);
        };

        socket.on('message', handleReceiveMessage);
        socket.on('roomUsers', handleRoomUsers);
        socket.on('room-update', handleRoomUpdate); // Listen for generic room updates (like new projects)
        socket.on('room-members-updated', handleRoomMembersUpdated);
        socket.on('videoCallStarted', handleVideoCallStarted);
        socket.on('videoCallEnded', handleVideoCallEnded);
        socket.on('videoParticipantJoined', handleVideoParticipantJoined);
        socket.on('videoParticipantLeft', handleVideoParticipantLeft);
        socket.on('multipleCallsUpdate', handleMultipleCallsUpdate);

        return () => {
            socket.emit('leaveRoom', { roomId: id, userId: user._id });
            socket.off('message', handleReceiveMessage);
            socket.off('roomUsers', handleRoomUsers);
            socket.off('room-update', handleRoomUpdate);
            socket.off('room-members-updated', handleRoomMembersUpdated);
            socket.off('videoCallStarted', handleVideoCallStarted);
            socket.off('videoCallEnded', handleVideoCallEnded);
            socket.off('videoParticipantJoined', handleVideoParticipantJoined);
            socket.off('videoParticipantLeft', handleVideoParticipantLeft);
            socket.off('multipleCallsUpdate', handleMultipleCallsUpdate);
        };
    }, [id, user]);

    // --- 3. Auto-scroll Chat ---
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- Video Call Handlers ---
    const handleStartCall = async (callName, maxSlots) => {
        // Auto-leave current call if in one
        if (isUserInCall && currentCallId) {
            await handleLeaveCall();
        }

        try {
            const response = await axios.post(`/api/rooms/${id}/video-calls/start`, {
                userId: user._id,
                callName: callName || 'Call',
                maxSlots: maxSlots || 10
            });
            const newCall = response.data;
            setActiveCalls(prev => [...prev, {
                callId: newCall.callId,
                callName: newCall.callName || callName || 'Call',
                maxSlots: newCall.maxSlots || maxSlots || 10,
                startedBy: newCall.startedBy,
                participants: newCall.participants,
                participantCount: newCall.participants.length
            }]);
            setCurrentCallId(newCall.callId);
            setIsUserInCall(true);
            setVideoCallError(null);
            setCanStartNewCall(activeCalls.length + 1 < 3);
            setExpandedCalls(prev => ({ ...prev, [newCall.callId]: true }));
            socket.emit('videoCallStarted', { roomId: id, callId: newCall.callId });
        } catch (err) {
            console.error('Failed to start call:', err);
            setVideoCallError(err.response?.data?.msg || 'Failed to start video call');
        }
    };

    const handleCreateCallSubmit = async (e) => {
        e.preventDefault();
        const name = createCallName.trim() || 'Call';
        const max = Math.max(2, Math.min(50, parseInt(createCallMaxParticipants) || 10));
        await handleStartCall(name, max);
        setShowCreateCallModal(false);
        setCreateCallName('');
        setCreateCallMaxParticipants(10);
    };

    const toggleCallExpanded = (callId) => {
        setExpandedCalls(prev => ({ ...prev, [callId]: !prev[callId] }));
    };

    const handleDeleteCall = async (callId) => {
        try {
            await axios.delete(`/api/rooms/${id}/video-calls/${callId}`);
            setActiveCalls(prev => prev.filter(c => c.callId !== callId));
            if (currentCallId === callId) {
                setCurrentCallId(null);
                setIsUserInCall(false);
                if (videoGridRef.current?.disconnect) {
                    await videoGridRef.current.disconnect();
                }
            }
            setCanStartNewCall(true);
        } catch (err) {
            console.error('Failed to delete call:', err);
            setVideoCallError(err.response?.data?.msg || 'Failed to delete call');
        }
    };

    const handleJoinCall = async (callId) => {
        // Auto-leave current call if in a different one
        if (isUserInCall && currentCallId !== callId) {
            await handleLeaveCall();
        }

        try {
            const response = await axios.post(`/api/rooms/${id}/video-calls/${callId}/join`, { userId: user._id });

            // Check if the response indicates we weren't able to join
            if (response.status === 200 && response.data.msg) {
                setActiveCalls(prev => prev.map(call =>
                    call.callId === callId ? { ...call, participants: response.data.participants || call.participants, participantCount: response.data.participants?.length || call.participantCount } : call
                ));
                setCurrentCallId(callId);
                setIsUserInCall(true);
                setVideoCallError(null);
                socket.emit('videoCallJoin', { roomId: id, callId: callId, userId: user._id });
            }
        } catch (err) {
            console.error('Failed to join call:', err);
            // If it's a stale call error, try to clear it and refresh
            if (err.response?.status === 400) {
                // Refresh the calls list
                try {
                    const callsRes = await axios.get(`/api/rooms/${id}/video-calls`);
                    setActiveCalls(callsRes.data.activeCalls || []);
                    setCanStartNewCall(callsRes.data.canStartNewCall || false);
                    setVideoCallError('Call state was out of sync. Please try again.');
                } catch (refreshErr) {
                    console.error('Failed to refresh calls:', refreshErr);
                    setVideoCallError('Failed to refresh call list');
                }
            } else {
                setVideoCallError(err.response?.data?.msg || 'Failed to join video call');
            }
        }
    };

    const handleLeaveCall = async () => {
        if (!currentCallId) return;

        const callIdToLeave = currentCallId;

        try {
            // Update state to hide video first (this will trigger token clear in VideoGrid)
            setCurrentCallId(null);
            setIsUserInCall(false);

            // Give the component a moment to start cleanup
            await new Promise(resolve => setTimeout(resolve, 100));

            // Then try to disconnect if the ref method exists
            if (videoGridRef.current?.disconnect) {
                await videoGridRef.current.disconnect();
            }

            // Then notify backend
            const response = await axios.post(`/api/rooms/${id}/video-calls/${callIdToLeave}/leave`, { userId: user._id });
            setActiveCalls(response.data.activeCalls || []);
            setCanStartNewCall(response.data.activeCalls.length < 3);
            socket.emit('videoCallLeave', { roomId: id, callId: callIdToLeave, userId: user._id });
        } catch (err) {
            console.error('Failed to leave call:', err);
            // Still clear state even if API call fails
            setCurrentCallId(null);
            setIsUserInCall(false);
        }
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

                    {/* SECTION: VOICE CHANNELS (Discord-like) */}
                    <div className="vscode-section" style={{ marginTop: '10px' }}>
                        <div className="vscode-section-header" style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <VscChevronDown style={{ marginRight: '6px', fontSize: '14px' }} />
                                <span>VOICE CHANNELS ({activeCalls.length})</span>
                            </div>
                            {canStartNewCall && (
                                <VscAdd
                                    style={{ cursor: 'pointer', fontSize: '16px', color: '#8b949e' }}
                                    title="Create Call"
                                    onClick={(e) => { e.stopPropagation(); setShowCreateCallModal(true); }}
                                />
                            )}
                        </div>

                        {/* Create Call Button */}
                        <div
                            style={{
                                padding: '6px 20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: canStartNewCall ? 'pointer' : 'not-allowed',
                                color: canStartNewCall ? '#8b949e' : '#484f58',
                                fontSize: '13px',
                                transition: 'all 0.15s'
                            }}
                            onClick={() => canStartNewCall && setShowCreateCallModal(true)}
                            onMouseEnter={(e) => canStartNewCall && (e.currentTarget.style.color = '#cccccc', e.currentTarget.style.backgroundColor = '#37373d')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e', e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <VscAdd style={{ fontSize: '14px' }} />
                            <span>Create Call</span>
                        </div>

                        {/* Call Channel List */}
                        <ul className="vscode-file-list" style={{ margin: 0 }}>
                            {activeCalls.length === 0 && (
                                <li style={{ padding: '7px 20px', color: '#484f58', fontStyle: 'italic', fontSize: '12px' }}>
                                    No voice channels active
                                </li>
                            )}
                            {activeCalls.map((call) => {
                                const isUserInThisCall = currentCallId === call.callId;
                                const maxSlots = call.maxSlots || 10;
                                const callIsFull = (call.participantCount || call.participants?.length || 0) >= maxSlots;
                                const isExpanded = expandedCalls[call.callId] !== false; // default expanded
                                const participantCount = call.participantCount || call.participants?.length || 0;

                                return (
                                    <li key={call.callId} style={{ listStyle: 'none' }}>
                                        {/* Channel Header */}
                                        <div
                                            style={{
                                                padding: '7px 14px 7px 20px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                cursor: 'pointer',
                                                backgroundColor: isUserInThisCall ? 'rgba(88, 166, 255, 0.12)' : 'transparent',
                                                borderLeft: isUserInThisCall ? '2px solid #58a6ff' : '2px solid transparent',
                                                transition: 'all 0.15s',
                                                fontSize: '14px'
                                            }}
                                            onClick={() => toggleCallExpanded(call.callId)}
                                            onMouseEnter={(e) => {
                                                if (!isUserInThisCall) e.currentTarget.style.backgroundColor = '#2a2d2e';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = isUserInThisCall ? 'rgba(88, 166, 255, 0.12)' : 'transparent';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                {isExpanded
                                                    ? <VscChevronDown style={{ fontSize: '12px', flexShrink: 0, color: '#8b949e' }} />
                                                    : <VscChevronRight style={{ fontSize: '12px', flexShrink: 0, color: '#8b949e' }} />
                                                }
                                                <VscCallOutgoing style={{ fontSize: '14px', flexShrink: 0, color: isUserInThisCall ? '#58a6ff' : '#8b949e' }} />
                                                <span style={{
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    color: isUserInThisCall ? '#58a6ff' : '#cccccc',
                                                    fontWeight: isUserInThisCall ? '600' : '400'
                                                }}>
                                                    {call.callName || `Call`}
                                                </span>
                                                {isUserInThisCall && <span style={{ fontSize: '11px', color: '#3fb950', fontWeight: 'bold' }}>✓</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '4px' }}>
                                                <span style={{ fontSize: '11px', color: '#8b949e' }}>
                                                    {participantCount}/{maxSlots}
                                                </span>
                                                {(call.startedBy?._id === user?._id || room?.owner?._id === user?._id) && (
                                                    <VscTrash
                                                        style={{ fontSize: '13px', color: '#484f58', cursor: 'pointer' }}
                                                        title="Delete call"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCall(call.callId); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.color = '#f85149'}
                                                        onMouseLeave={(e) => e.currentTarget.style.color = '#484f58'}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded: Participants List */}
                                        {isExpanded && (
                                            <div style={{ paddingLeft: '42px', paddingBottom: '4px' }}>
                                                {call.participants && call.participants.length > 0 ? (
                                                    call.participants.map((p, pi) => (
                                                        <div key={pi} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '3px 8px',
                                                            fontSize: '13px',
                                                            color: '#c9d1d9',
                                                            borderRadius: '3px'
                                                        }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2d2e'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <VscAccount style={{ fontSize: '14px', color: '#8b949e', flexShrink: 0 }} />
                                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {p.username || 'Unknown'}
                                                            </span>
                                                            <FaMicrophone style={{ fontSize: '11px', color: '#3fb950', flexShrink: 0 }} />
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ fontSize: '12px', color: '#484f58', fontStyle: 'italic', padding: '3px 8px' }}>
                                                        Empty channel
                                                    </div>
                                                )}

                                                {/* Join / Leave Button */}
                                                {isUserInThisCall ? (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '5px 8px',
                                                            marginTop: '4px',
                                                            fontSize: '12px',
                                                            color: '#f85149',
                                                            cursor: 'pointer',
                                                            borderRadius: '3px',
                                                            transition: 'background 0.15s'
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); handleLeaveCall(); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(248, 81, 73, 0.1)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <FaPhoneSlash style={{ fontSize: '11px' }} />
                                                        <span>Disconnect</span>
                                                    </div>
                                                ) : !callIsFull ? (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '5px 8px',
                                                            marginTop: '4px',
                                                            fontSize: '12px',
                                                            color: '#3fb950',
                                                            cursor: 'pointer',
                                                            borderRadius: '3px',
                                                            transition: 'background 0.15s'
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); handleJoinCall(call.callId); }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(63, 185, 80, 0.1)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <VscCallOutgoing style={{ fontSize: '12px' }} />
                                                        <span>Join Channel</span>
                                                    </div>
                                                ) : (
                                                    <div style={{ padding: '5px 8px', marginTop: '4px', fontSize: '12px', color: '#484f58' }}>
                                                        Channel full
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {videoCallError && (
                            <div style={{ padding: '6px 20px', fontSize: '12px', color: '#f85149' }}>
                                {videoCallError}
                            </div>
                        )}
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
                        {/* Invite Link */}
                        <div style={{ padding: '12px 20px' }}>
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
                                    padding: '10px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                }}
                            >
                                Copy Invite Link
                            </button>
                        </div>
                        {/* Leave Button */}
                        <div style={{ padding: '0 20px 12px 20px' }}>
                            <button
                                onClick={handleLeaveRoom}
                                style={{
                                    background: '#d32f2f',
                                    color: 'white',
                                    border: 'none',
                                    width: '100%',
                                    padding: '10px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                }}
                            >
                                <VscSignOut style={{ fontSize: '16px' }} /> Leave Room
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

                {/* Main Video Grid — center workspace becomes video when in call */}
                <VideoGrid
                    ref={videoGridRef}
                    roomId={id}
                    user={user}
                    onLeave={handleLeaveRoom}
                    isActive={isUserInCall}
                    currentCallId={currentCallId}
                    onCallLeave={handleLeaveCall}
                />


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
            {manageMembersProject && (
                <ManageMembersModal
                    project={manageMembersProject}
                    roomMembers={roomMembers}
                    roomOwner={room.owner}
                    onClose={() => setManageMembersProject(null)}
                    onMembersUpdated={handleMembersUpdated}
                />
            )}

            {/* Create Call Modal */}
            {showCreateCallModal && (
                <div
                    className="modal-backdrop"
                    onClick={() => setShowCreateCallModal(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #30363d',
                            borderRadius: '8px',
                            width: '380px',
                            overflow: 'hidden',
                            boxShadow: '0 16px 48px rgba(0,0,0,0.4)'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid #30363d',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#febc2e' }} />
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c840' }} />
                            <span style={{ marginLeft: '8px', fontSize: '13px', color: '#8b949e' }}>create_call.sh</span>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleCreateCallSubmit} style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', color: '#c9d1d9', marginBottom: '6px', fontWeight: '500' }}>
                                    Call Name
                                </label>
                                <input
                                    type="text"
                                    value={createCallName}
                                    onChange={(e) => setCreateCallName(e.target.value)}
                                    placeholder="e.g. Backend Sync, Interview Room..."
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        background: '#0d1117',
                                        border: '1px solid #30363d',
                                        borderRadius: '6px',
                                        color: '#c9d1d9',
                                        fontSize: '14px',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '13px', color: '#c9d1d9', marginBottom: '6px', fontWeight: '500' }}>
                                    Max Participants
                                </label>
                                <input
                                    type="number"
                                    value={createCallMaxParticipants}
                                    onChange={(e) => setCreateCallMaxParticipants(e.target.value)}
                                    min={2}
                                    max={50}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        background: '#0d1117',
                                        border: '1px solid #30363d',
                                        borderRadius: '6px',
                                        color: '#c9d1d9',
                                        fontSize: '14px',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateCallModal(false)}
                                    style={{
                                        padding: '8px 16px',
                                        background: 'transparent',
                                        border: '1px solid #30363d',
                                        borderRadius: '6px',
                                        color: '#8b949e',
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '8px 16px',
                                        background: '#238636',
                                        border: '1px solid #2ea043',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomPage;