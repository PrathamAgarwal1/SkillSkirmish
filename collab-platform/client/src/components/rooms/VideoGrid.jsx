import React, { useEffect, useState } from 'react';
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

const VideoGrid = ({ roomId, user, onLeave }) => {
    const [token, setToken] = useState("");

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const roomName = roomId;
                // Append random ID to username for multi-tab testing support
                const participantName = `${user.username}_${Math.floor(Math.random() * 1000)}`;
                const response = await fetch(`http://localhost:5000/api/livekit/token?roomName=${roomName}&participantName=${participantName}`);
                const data = await response.json();
                setToken(data.token);
            } catch (error) {
                console.error("Error fetching LiveKit token:", error);
            }
        };

        if (roomId && user) {
            fetchToken();
        }
    }, [roomId, user]);

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

    return (
        <LiveKitRoom
            video={true}
            audio={true}
            token={token}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL || "wss://codecolab-h50tpbmj.livekit.cloud"}
            // Use the "StudyStream" dark theme by default
            data-lk-theme="default"
            style={{ height: '100%', fontFamily: 'Inter' }}
            onDisconnected={onLeave}
        >
            <MyVideoConference />
            <RoomAudioRenderer />
            <ControlBar />
        </LiveKitRoom>
    );
};

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
