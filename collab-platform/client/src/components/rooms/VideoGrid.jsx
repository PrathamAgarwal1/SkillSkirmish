import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import {
    LiveKitRoom,
    VideoConference,
    GridLayout,
    ParticipantTile,
    RoomAudioRenderer,
    ControlBar,
    useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles/index.css';
import { Track } from 'livekit-client';

const VideoGrid = forwardRef(({ roomId, user, onLeave, isActive = false, currentCallId = null, onCallLeave }, ref) => {
    const [token, setToken] = useState("");
    const [connecting, setConnecting] = useState(false);
    const roomConnectionRef = useRef(null);

    useImperativeHandle(ref, () => ({
        disconnect: async () => {
            try {
                if (roomConnectionRef.current) {
                    await roomConnectionRef.current.disconnect();
                }
            } catch (error) {
                console.error('Error disconnecting from LiveKit room:', error);
            }
        }
    }));

    useEffect(() => {
        const fetchToken = async () => {
            try {
                setConnecting(true);
                const roomName = currentCallId || roomId; // Use callId for room name if available
                // Append random ID to username for multi-tab testing support
                const participantName = `${user.username}_${Math.floor(Math.random() * 1000)}`;
                const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'}/api/livekit/token?roomName=${roomName}&participantName=${participantName}`);
                const data = await response.json();
                setToken(data.token);
                setConnecting(false);
            } catch (error) {
                console.error("Error fetching LiveKit token:", error);
                setConnecting(false);
            }
        };

        // Only fetch token when joining a call
        if (roomId && user && isActive && currentCallId) {
            fetchToken();
        } else if (!isActive) {
            // Clear token when leaving
            setToken("");
            setConnecting(false);
        }
    }, [roomId, user, isActive, currentCallId]);

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

    if (!token) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)'
            }}>
                Initializing secure video uplink...
            </div>
        );
    }

    const handleDisconnected = () => {
        roomConnectionRef.current = null;
        if (onCallLeave) {
            onCallLeave();
        } else if (onLeave) {
            onLeave();
        }
    };

    const handleConnected = (room) => {
        roomConnectionRef.current = room;
    };

    return (
        <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL || "wss://codecolab-h50tpbmj.livekit.cloud"}
            data-lk-theme="default"
            style={{ height: '100%', fontFamily: 'Inter' }}
            onDisconnected={handleDisconnected}
            onConnected={handleConnected}
        >
            <MyVideoConference />
            <RoomAudioRenderer />
            <ControlBar />
        </LiveKitRoom>
    );
});

VideoGrid.displayName = 'VideoGrid';

function MyVideoConference() {
    // Custom layout to match "StudyStream" grid
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    return (
        <GridLayout
            tracks={tracks}
            style={{ height: 'calc(100% - 60px)' }} // Leave space for control bar
        >
            <ParticipantTile />
        </GridLayout>
    );
}

export default VideoGrid;
