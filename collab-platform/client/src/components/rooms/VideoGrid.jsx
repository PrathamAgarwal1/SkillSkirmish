import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import Draggable from 'react-draggable';
import { socket } from '../../socket';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaThumbtack, FaExpandAlt } from 'react-icons/fa';
import { MdScreenShare, MdStopScreenShare, MdCallEnd, MdMoreVert } from 'react-icons/md';
import { motion, AnimatePresence } from 'framer-motion';

// =====================================================================
// VideoGrid — mediasoup-powered multi-user video conferencing component
// =====================================================================
// Preserved API: roomId, user, onLeave, isActive, currentCallId, onCallLeave
// Preserved ref API: disconnect() method

const VideoGrid = forwardRef(({ roomId, user, onLeave, isActive = false, currentCallId = null, onCallLeave }, ref) => {
    // --- State ---
    const [connecting, setConnecting] = useState(false);
    const [connected, setConnected] = useState(false);
    const [localStream, setLocalStream] = useState(null);
    const [screenStream, setScreenStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // { socketId: { stream, kinds: Set } }
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCamOn, setIsCamOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [error, setError] = useState(null);
    const [roomUsersMap, setRoomUsersMap] = useState({}); // Identity mapping
    const [activeSpeakers, setActiveSpeakers] = useState({}); // For blue glow


    // --- Refs (persisted across renders) ---
    const deviceRef = useRef(null);
    const sendTransportRef = useRef(null);
    const recvTransportRef = useRef(null);
    const producersRef = useRef({}); // { trackKind: producer } — audio, video, screen
    const consumersRef = useRef({}); // { consumerId: consumer }
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const msRoomIdRef = useRef(null); // mediasoup room (= currentCallId)
    const cleaningUpRef = useRef(false);
    const controlBarRef = useRef(null);

    // =====================================================================
    // CLEANUP — close all mediasoup resources
    // =====================================================================
    const cleanup = useCallback(() => {
        if (cleaningUpRef.current) return;
        cleaningUpRef.current = true;

        console.log('[VideoGrid] Cleanup starting');

        // Stop local media tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }

        // Close all consumers
        Object.values(consumersRef.current).forEach(c => { try { c.close(); } catch (_) {} });
        consumersRef.current = {};

        // Close all producers
        Object.values(producersRef.current).forEach(p => { try { p.close(); } catch (_) {} });
        producersRef.current = {};

        // Close transports
        if (sendTransportRef.current) { try { sendTransportRef.current.close(); } catch (_) {} sendTransportRef.current = null; }
        if (recvTransportRef.current) { try { recvTransportRef.current.close(); } catch (_) {} recvTransportRef.current = null; }

        // Notify server
        if (msRoomIdRef.current) {
            socket.emit('ms-leaveRoom', { roomId: msRoomIdRef.current });
            msRoomIdRef.current = null;
        }

        deviceRef.current = null;

        setLocalStream(null);
        setScreenStream(null);
        setRemoteStreams({});
        setConnected(false);
        setConnecting(false);
        setIsScreenSharing(false);
        setIsMicOn(true);
        setIsCamOn(true);
        setError(null);

        cleaningUpRef.current = false;
    }, []);

    // --- Ref API for parent component ---
    useImperativeHandle(ref, () => ({
        disconnect: () => {
            cleanup();
        }
    }));

    // =====================================================================
    // CONSUME a single producer (create consumer, attach to stream)
    // =====================================================================
    const consumeProducer = useCallback(async (producerId, socketId, kind, appData) => {
        if (!deviceRef.current || !recvTransportRef.current) return;

        const msRoomId = msRoomIdRef.current;
        if (!msRoomId) return;

        try {
            const consumerParams = await new Promise((resolve, reject) => {
                socket.emit('ms-consume', {
                    roomId: msRoomId,
                    producerId,
                    rtpCapabilities: deviceRef.current.rtpCapabilities,
                }, (result) => {
                    if (result.error) reject(new Error(result.error));
                    else resolve(result);
                });
            });

            const consumer = await recvTransportRef.current.consume({
                id: consumerParams.consumerId,
                producerId: consumerParams.producerId,
                kind: consumerParams.kind,
                rtpParameters: consumerParams.rtpParameters,
            });

            consumersRef.current[consumer.id] = consumer;

            // Attach consumer track to remote stream
            setRemoteStreams(prev => {
                const existing = prev[socketId] || { stream: new MediaStream(), screenStream: new MediaStream() };
                
                if (appData && appData.mediaType === 'screen') {
                    // It's a screen share
                    existing.screenStream.getTracks().forEach(t => {
                        if (t.kind === consumer.kind) existing.screenStream.removeTrack(t);
                    });
                    existing.screenStream.addTrack(consumer.track);
                } else {
                    // It's camera or mic
                    existing.stream.getTracks().forEach(t => {
                        if (t.kind === consumer.kind) existing.stream.removeTrack(t);
                    });
                    existing.stream.addTrack(consumer.track);
                }
                
                return { ...prev, [socketId]: { ...existing } };
            });

            // Resume the consumer on the server
            await new Promise((resolve) => {
                socket.emit('ms-resumeConsumer', {
                    roomId: msRoomId,
                    consumerId: consumer.id,
                }, resolve);
            });

            console.log('[VideoGrid] Consuming producer %s (kind: %s) from socket %s', producerId, kind, socketId);
        } catch (err) {
            console.error('[VideoGrid] Error consuming producer:', err);
        }
    }, []);

    // =====================================================================
    // CONNECT — full mediasoup connection flow
    // =====================================================================
    useEffect(() => {
        if (!isActive || !currentCallId || !user || !roomId) {
            if (connected || connecting) {
                cleanup();
            }
            return;
        }

        let cancelled = false;
        const msRoomId = currentCallId;

        const connect = async () => {
            try {
                setConnecting(true);
                setError(null);

                // 1. Join the mediasoup room & get RTP capabilities
                const { rtpCapabilities, error: joinError } = await new Promise((resolve) => {
                    socket.emit('ms-joinRoom', { roomId: msRoomId }, resolve);
                });
                if (joinError) throw new Error(joinError);
                if (cancelled) return;

                msRoomIdRef.current = msRoomId;

                // 2. Create mediasoup-client Device
                const device = new Device();
                await device.load({ routerRtpCapabilities: rtpCapabilities });
                deviceRef.current = device;

                // 3. Create send transport
                const sendParams = await new Promise((resolve) => {
                    socket.emit('ms-createTransport', { roomId: msRoomId, direction: 'send' }, resolve);
                });
                if (sendParams.error) throw new Error(sendParams.error);
                if (cancelled) return;

                const sendTransport = device.createSendTransport(sendParams);
                sendTransportRef.current = sendTransport;

                sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    try {
                        await new Promise((resolve, reject) => {
                            socket.emit('ms-connectTransport', {
                                roomId: msRoomId,
                                transportId: sendTransport.id,
                                dtlsParameters,
                            }, (result) => {
                                if (result.error) reject(new Error(result.error));
                                else resolve(result);
                            });
                        });
                        callback();
                    } catch (err) {
                        errback(err);
                    }
                });

                sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                    try {
                        const result = await new Promise((resolve, reject) => {
                            socket.emit('ms-produce', {
                                roomId: msRoomId,
                                transportId: sendTransport.id,
                                kind,
                                rtpParameters,
                                appData,
                            }, (res) => {
                                if (res.error) reject(new Error(res.error));
                                else resolve(res);
                            });
                        });
                        callback({ id: result.producerId });
                    } catch (err) {
                        errback(err);
                    }
                });

                // 4. Create recv transport
                const recvParams = await new Promise((resolve) => {
                    socket.emit('ms-createTransport', { roomId: msRoomId, direction: 'recv' }, resolve);
                });
                if (recvParams.error) throw new Error(recvParams.error);
                if (cancelled) return;

                const recvTransport = device.createRecvTransport(recvParams);
                recvTransportRef.current = recvTransport;

                recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    try {
                        await new Promise((resolve, reject) => {
                            socket.emit('ms-connectTransport', {
                                roomId: msRoomId,
                                transportId: recvTransport.id,
                                dtlsParameters,
                            }, (result) => {
                                if (result.error) reject(new Error(result.error));
                                else resolve(result);
                            });
                        });
                        callback();
                    } catch (err) {
                        errback(err);
                    }
                });

                // 5. Get local media and produce (Graceful Fallback)
                let stream = null;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            frameRate: { ideal: 24 },
                        },
                    });
                } catch (mediaErr) {
                    console.warn('[VideoGrid] Failed to get camera/mic. Trying audio only.', mediaErr);
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        setIsCamOn(false);
                    } catch (audioErr) {
                        console.warn('[VideoGrid] Failed to get audio. Joining as viewer only.', audioErr);
                        setIsCamOn(false);
                        setIsMicOn(false);
                    }
                }

                if (cancelled) { 
                    if (stream) stream.getTracks().forEach(t => t.stop()); 
                    return; 
                }

                if (stream) {
                    localStreamRef.current = stream;
                    setLocalStream(stream);

                    // Produce audio
                    const audioTrack = stream.getAudioTracks()[0];
                    if (audioTrack) {
                        const audioProducer = await sendTransport.produce({
                            track: audioTrack,
                            appData: { mediaType: 'audio' },
                        });
                        producersRef.current.audio = audioProducer;
                    } else {
                        setIsMicOn(false);
                    }

                    // Produce video
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        const videoProducer = await sendTransport.produce({
                            track: videoTrack,
                            appData: { mediaType: 'video' },
                        });
                        producersRef.current.video = videoProducer;
                    } else {
                        setIsCamOn(false);
                    }
                }

                // 6. Consume all existing producers in the room
                const existingProducers = await new Promise((resolve) => {
                    socket.emit('ms-getProducers', { roomId: msRoomId }, resolve);
                });

                for (const p of existingProducers) {
                    await consumeProducer(p.producerId, p.socketId, p.kind, p.appData);
                }

                if (cancelled) { cleanup(); return; }

                setConnected(true);
                setConnecting(false);
                console.log('[VideoGrid] Connected to mediasoup room:', msRoomId);

            } catch (err) {
                console.error('[VideoGrid] Connection error:', err);
                setError(err.message || 'Failed to connect');
                setConnecting(false);
            }
        };

        connect();

        return () => {
            cancelled = true;
        };
    }, [isActive, currentCallId, user, roomId, cleanup, consumeProducer]);

    // Identity sync listener
    useEffect(() => {
        const handleRoomUsers = (users) => {
            setRoomUsersMap(prev => {
                const map = { ...prev };
                users.forEach(u => { map[u.socketId] = u.username; });
                return map;
            });
        };
        socket.on('roomUsers', handleRoomUsers);
        socket.emit('getRoomUsers', { roomId }); // request if we missed it
        return () => socket.off('roomUsers', handleRoomUsers);
    }, [roomId]);

    // =====================================================================
    // SOCKET EVENT LISTENERS — new/closed producers
    // =====================================================================
    useEffect(() => {
        if (!connected) return;

        const handleNewProducer = async ({ producerId, socketId, kind, appData }) => {
            console.log('[VideoGrid] New producer from socket %s:', producerId);
            await consumeProducer(producerId, socketId, kind, appData);
        };

        const handleProducerClosed = ({ producerId, socketId }) => {
            console.log('[VideoGrid] Producer closed: %s from socket %s', producerId, socketId);

            let closedConsumer = null;
            // Find and close the consumer for this producer
            for (const [consumerId, consumer] of Object.entries(consumersRef.current)) {
                if (consumer.producerId === producerId) {
                    closedConsumer = consumer;
                    consumer.close();
                    delete consumersRef.current[consumerId];
                    break;
                }
            }

            if (closedConsumer) {
                // Remove the remote stream track
                setRemoteStreams(prev => {
                    const updated = { ...prev };
                    if (updated[socketId]) {
                        const { stream, screenStream } = updated[socketId];
                        
                        // Remove track from stream
                        if (stream) {
                            stream.getTracks().forEach(t => {
                                if (t.id === closedConsumer.track.id) stream.removeTrack(t);
                            });
                        }
                        
                        // Remove track from screenStream
                        if (screenStream) {
                            screenStream.getTracks().forEach(t => {
                                if (t.id === closedConsumer.track.id) screenStream.removeTrack(t);
                            });
                        }

                        // If neither stream has any tracks left, safely delete the user entry
                        if (stream.getTracks().length === 0 && screenStream.getTracks().length === 0) {
                            delete updated[socketId];
                        }
                    }
                    return updated;
                });
            }
        };

        socket.on('ms-newProducer', handleNewProducer);
        socket.on('ms-producerClosed', handleProducerClosed);

        return () => {
            socket.off('ms-newProducer', handleNewProducer);
            socket.off('ms-producerClosed', handleProducerClosed);
        };
    }, [connected, consumeProducer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    // =====================================================================
    // CONTROL HANDLERS
    // =====================================================================
    const toggleMic = useCallback(() => {
        const producer = producersRef.current.audio;
        if (producer) {
            if (isMicOn) {
                producer.pause();
            } else {
                producer.resume();
            }
            setIsMicOn(!isMicOn);
        }
    }, [isMicOn]);

    const toggleCamera = useCallback(() => {
        const producer = producersRef.current.video;
        if (producer) {
            if (isCamOn) {
                producer.pause();
                // Also disable the track visually
                const videoTrack = localStreamRef.current?.getVideoTracks()[0];
                if (videoTrack) videoTrack.enabled = false;
            } else {
                producer.resume();
                const videoTrack = localStreamRef.current?.getVideoTracks()[0];
                if (videoTrack) videoTrack.enabled = true;
            }
            setIsCamOn(!isCamOn);
        }
    }, [isCamOn]);

    const toggleScreenShare = useCallback(async () => {
        const msRoomId = msRoomIdRef.current;

        if (isScreenSharing) {
            // Stop screen share
            if (producersRef.current.screen) {
                const producerId = producersRef.current.screen.id;
                producersRef.current.screen.close();
                delete producersRef.current.screen;
                socket.emit('ms-closeProducer', { roomId: msRoomId, producerId });
            }
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop());
                screenStreamRef.current = null;
            }
            setScreenStream(null);
            setIsScreenSharing(false);
        } else {
            // Start screen share
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: false,
                });

                screenStreamRef.current = stream;
                setScreenStream(stream);

                const screenTrack = stream.getVideoTracks()[0];
                const screenProducer = await sendTransportRef.current.produce({
                    track: screenTrack,
                    appData: { mediaType: 'screen' },
                });
                producersRef.current.screen = screenProducer;

                // Handle user clicking "Stop sharing" in browser UI
                screenTrack.onended = () => {
                    if (producersRef.current.screen) {
                        const pid = producersRef.current.screen.id;
                        producersRef.current.screen.close();
                        delete producersRef.current.screen;
                        socket.emit('ms-closeProducer', { roomId: msRoomId, producerId: pid });
                    }
                    if (screenStreamRef.current) {
                        screenStreamRef.current.getTracks().forEach(t => t.stop());
                        screenStreamRef.current = null;
                    }
                    setScreenStream(null);
                    setIsScreenSharing(false);
                };

                setIsScreenSharing(true);
            } catch (err) {
                console.error('[VideoGrid] Screen share error:', err);
            }
        }
    }, [isScreenSharing]);

    const handleLeave = useCallback(() => {
        cleanup();
        if (onCallLeave) {
            onCallLeave();
        } else if (onLeave) {
            onLeave();
        }
    }, [cleanup, onCallLeave, onLeave]);

    // =====================================================================
    // RENDER
    // =====================================================================

    // Not in a call
    if (!isActive) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <p>No active video call</p>
                <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Use the video call controls to start or join a call</p>
            </div>
        );
    }

    // Connecting
    if (connecting || (!connected && !error)) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                flexDirection: 'column',
                gap: '12px',
            }}>
                <div className="ms-spinner" />
                <span>Initializing secure video uplink...</span>
            </div>
        );
    }

    // Error
    if (error) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f85149',
                flexDirection: 'column',
                gap: '12px',
            }}>
                <span>⚠ Connection failed</span>
                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{error}</span>
            </div>
        );
    }

    // =====================================================================
    // BUILD DYNAMIC PRESENCE LISTS
    // =====================================================================
    const activeVideoTiles = [];
    const avatarList = [];

    // Local user
    if (localStream) {
        const hasVideo = isCamOn;
        const hasAudio = isMicOn;
        if (hasVideo) {
            activeVideoTiles.push({ id: 'local', stream: localStream, name: `${user.username} (You)`, muted: true, mirror: true, hasAudio });
        } else if (hasAudio || true) { // Always show local as Avatar if camera is off
            avatarList.push({ id: 'local', stream: localStream, name: `${user.username} (You)`, isLocal: true, hasAudio });
        }
    }

    if (screenStream) {
        activeVideoTiles.push({ id: 'screen-local', stream: screenStream, name: `${user.username} (Screen)`, muted: true, isScreen: true, hasAudio: false });
    }

    // Remote users
    for (const [socketId, data] of Object.entries(remoteStreams)) {
        const username = roomUsersMap[socketId] || `Guest ${socketId.substring(0, 4)}`;
        
        if (data.stream && data.stream.getTracks().length > 0) {
            const hasVideo = data.stream.getVideoTracks().length > 0;
            const hasAudio = data.stream.getAudioTracks().length > 0;
            const isSpeaking = activeSpeakers[socketId]; // Stub for actual speaking detection later

            if (hasVideo) {
                activeVideoTiles.push({ id: socketId, stream: data.stream, name: username, hasAudio, isSpeaking });
            } else if (hasAudio) {
                avatarList.push({ id: socketId, stream: data.stream, name: username, hasAudio, isSpeaking });
            }
        }
        
        if (data.screenStream && data.screenStream.getTracks().length > 0) {
            activeVideoTiles.push({ id: `screen-${socketId}`, stream: data.screenStream, name: `${username}'s Screen`, isScreen: true, hasAudio: false });
        }
    }

    // Layout calculation
    let gridClass = 'layout-full';
    const tileCount = activeVideoTiles.length;
    if (tileCount === 2) gridClass = 'layout-split';
    else if (tileCount >= 3 && tileCount <= 6) gridClass = 'layout-grid';
    else if (tileCount > 6) gridClass = 'layout-scale';

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            {/* Avatar Trays (For users with Cam OFF) */}
            <motion.div layout className="premium-avatar-tray">
                <AnimatePresence>
                    {avatarList.map(av => (
                        <AvatarFallback key={av.id} {...av} />
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* Dynamic Video Grid */}
            <motion.div layout className={`premium-video-grid ${gridClass}`}>
                <AnimatePresence>
                    {activeVideoTiles.map(tile => (
                        <ParticipantTile key={tile.id} {...tile} />
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* Discord Style Control Bar */}
            <Draggable bounds="parent" cancel="button" nodeRef={controlBarRef}>
                <div ref={controlBarRef} className="discord-control-bar" style={{ cursor: 'move' }}>
                    {/* Media Group */}
                    <div className="discord-control-group">
                        <button
                            className={`discord-btn ${!isMicOn ? 'discord-btn-off' : ''}`}
                            onClick={toggleMic}
                            title={isMicOn ? 'Mute Mic' : 'Unmute Mic'}
                        >
                            {isMicOn ? <FaMicrophone size={20} /> : <FaMicrophoneSlash size={20} color="#f23f43" />}
                        </button>
                        <button
                            className={`discord-btn ${!isCamOn ? 'discord-btn-off' : ''}`}
                            onClick={toggleCamera}
                            title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
                        >
                            {isCamOn ? <FaVideo size={20} /> : <FaVideoSlash size={20} color="#f23f43" />}
                        </button>
                    </div>

                    {/* Sharing Group */}
                    <div className="discord-control-group">
                        <button
                            className={`discord-btn ${isScreenSharing ? 'discord-btn-active' : ''}`}
                            onClick={toggleScreenShare}
                            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                        >
                            {isScreenSharing ? <MdStopScreenShare size={24} color="#23a55a" /> : <MdScreenShare size={24} />}
                        </button>
                    </div>

                    {/* Leave Group */}
                    <button
                        className="discord-btn-leave"
                        onClick={handleLeave}
                        title="Leave Call"
                    >
                        <MdCallEnd size={24} />
                    </button>
                </div>
            </Draggable>
        </div>
    );
});

VideoGrid.displayName = 'VideoGrid';

// =====================================================================
// ParticipantTile — Framer Motion enabled video tile
// =====================================================================
function ParticipantTile({ id, stream, name, muted = false, mirror = false, isScreen = false, hasAudio, isSpeaking }) {
    const videoRef = useRef(null);
    const [hover, setHover] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (videoEl && stream) {
            videoEl.srcObject = stream;
        }
        return () => {
            if (videoEl) videoEl.srcObject = null;
        };
    }, [stream]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.5, filter: 'blur(10px)' }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            className={`premium-video-tile ${isSpeaking ? 'active-speaker' : ''} ${isScreen ? 'screen-tile' : ''} ${isExpanded ? 'tile-expanded' : ''}`}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                className="premium-video-el"
                style={{
                    transform: mirror ? 'scaleX(-1)' : 'none',
                    objectFit: isScreen ? 'contain' : 'cover',
                }}
            />
            
            {/* Overlay Info */}
            <div className="premium-tile-overlay">
                <div className="identity-tag">
                    {!hasAudio && <FaMicrophoneSlash color="#f23f43" size={12} />}
                    <span className="identity-name">{name}</span>
                </div>
            </div>

            {/* Quick Actions on Hover */}
            <AnimatePresence>
                {hover && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -10 }} 
                        className="quick-actions"
                    >
                        <button className={`quick-btn ${isExpanded ? 'active-btn' : ''}`} title={isExpanded ? "Collapse" : "Expand"} onClick={() => setIsExpanded(!isExpanded)}><FaExpandAlt size={12} color={isExpanded ? "#5865F2" : "white"}/></button>
                        <button className="quick-btn" title="Pin User"><FaThumbtack size={12}/></button>
                        <button className="quick-btn" title="More Options"><MdMoreVert size={16}/></button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// =====================================================================
// AvatarFallback — Minimal bubble for cam-off presences
// =====================================================================
function AvatarFallback({ id, name, hasAudio, isSpeaking }) {
    const initials = name.substring(0, 2).toUpperCase();
    
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className={`avatar-bubble ${isSpeaking ? 'active-speaker-ring' : ''}`}
            title={name}
        >
            <div className="avatar-circle">
                {initials}
                {!hasAudio && (
                    <div className="avatar-muted-indicator">
                        <FaMicrophoneSlash size={10} color="white" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export default VideoGrid;
