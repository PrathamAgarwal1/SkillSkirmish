import React, { useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaMicrophone, FaMicrophoneSlash, FaHeadphones, FaVideo, FaVideoSlash, FaCog } from 'react-icons/fa';
import { MdHeadsetOff, MdScreenShare, MdStopScreenShare, MdCallEnd, MdSignalCellularAlt, MdExpandLess, MdExpandMore } from 'react-icons/md';
import AuthContext from '../../context/AuthContext';
import { useVoice } from '../../voice/voiceContext';
import { pingColor } from '../../voice/ui';
import Avatar from './Avatar';
import VideoView from './VideoView';
import { OPEN_CALL_EVENT } from './FloatingCall';
import './voice.css';

/**
 * "Voice Connected" panel, shown on every page while you're in a call (except the room's own call
 * view): status, ping, quick controls, and a mini video of whoever is sharing/speaking.
 */
const VoiceDock = () => {
    const voice = useVoice();
    const { user } = useContext(AuthContext);
    const location = useLocation();
    const navigate = useNavigate();
    const channel = voice.channel;
    const [minimized, setMinimized] = useState(() => { try { return localStorage.getItem('ss-voice-dock-min') === '1'; } catch { return false; } });
    const toggleMinimized = () => setMinimized(m => {
        try { localStorage.setItem('ss-voice-dock-min', m ? '0' : '1'); } catch { /* ignore */ }
        return !m;
    });
    const onRoomPage = channel && location.pathname === `/rooms/${channel.roomId}`;

    // Mini video: a screen share first, then whoever is talking on camera, then any camera
    const pip = useMemo(() => {
        if (!channel) return null;
        const others = voice.members.filter(m => m.socketId !== voice.selfId);
        const sharer = others.find(m => m.screen && voice.remote[m.socketId]?.screen);
        if (sharer) return { stream: voice.remote[sharer.socketId].screen, label: `${sharer.username}'s screen` };
        const cams = others.filter(m => m.video && voice.remote[m.socketId]?.camera);
        const talker = cams.find(m => voice.speaking[m.socketId]) || cams[0];
        return talker ? { stream: voice.remote[talker.socketId].camera, label: talker.username } : null;
    }, [channel, voice.members, voice.remote, voice.speaking, voice.selfId]);

    if (!channel || onRoomPage) return null;

    const reconnecting = voice.status !== 'connected';
    // In the IDE of the same room, open the floating call window instead of leaving the editor
    const goToRoom = () => (window.__ssCallWindow === channel.roomId
        ? window.dispatchEvent(new Event(OPEN_CALL_EVENT))
        : navigate(`/rooms/${channel.roomId}`));

    if (minimized) {
        return (
            <div className="vc-dock vc-dock-min">
                <MdSignalCellularAlt size={18} color={reconnecting ? 'var(--gh-f0b232)' : pingColor(voice.ping)} />
                <span className="sub" onClick={goToRoom} title="Back to the call">{channel.name}</span>
                <button className={`vc-btn small ${voice.muted ? 'off' : ''}`} onClick={voice.toggleMute} disabled={!voice.hasMic} title={voice.muted ? 'Unmute' : 'Mute'}>
                    {voice.muted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                </button>
                <button className={`vc-btn small ${voice.deafened ? 'off' : ''}`} onClick={voice.toggleDeafen} title={voice.deafened ? 'Undeafen' : 'Deafen'}>
                    {voice.deafened ? <MdHeadsetOff size={18} /> : <FaHeadphones />}
                </button>
                <button className="vc-btn small" onClick={() => voice.leave()} title="Disconnect"><MdCallEnd size={18} color="var(--gh-f23f43)" /></button>
                <button className="vc-btn small" onClick={toggleMinimized} title="Expand"><MdExpandLess size={18} /></button>
            </div>
        );
    }

    return (
        <div className="vc-dock">
            {pip && (
                <div className="vc-pip" onClick={goToRoom} title="Back to the call">
                    <VideoView stream={pip.stream} />
                    <span className="label">{pip.label}</span>
                </div>
            )}
            <div className="vc-dock-status">
                <MdSignalCellularAlt size={20} color={reconnecting ? 'var(--gh-f0b232)' : pingColor(voice.ping)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title" style={{ color: reconnecting ? 'var(--gh-f0b232)' : 'var(--gh-23a55a)' }}>
                        {voice.status === 'reconnecting' ? 'Reconnecting…' : voice.status === 'connecting' ? 'Connecting…' : 'Voice Connected'}
                        {voice.ping != null && !reconnecting && <span style={{ color: 'var(--gh-949ba4)', fontWeight: 400 }}> · {voice.ping} ms</span>}
                    </div>
                    <div className="sub" onClick={goToRoom} title="Back to the call">
                        {channel.name}{channel.roomName ? ` / ${channel.roomName}` : ''} · {voice.members.length} in call
                    </div>
                </div>
                <button className="vc-btn small" onClick={toggleMinimized} title="Minimize"><MdExpandMore size={20} /></button>
                <button className="vc-btn small" onClick={() => voice.leave()} title="Disconnect"><MdCallEnd size={20} color="var(--gh-f23f43)" /></button>
            </div>
            <div className="vc-dock-row">
                <button className={`vc-wide ${voice.cameraTrack ? 'active' : ''}`} onClick={voice.toggleCamera} title={voice.cameraTrack ? 'Turn off camera' : 'Turn on camera'}>
                    {voice.cameraTrack ? <FaVideo /> : <FaVideoSlash />}
                </button>
                <button className={`vc-wide ${voice.screenTrack ? 'active' : ''}`} onClick={voice.toggleScreen} title={voice.screenTrack ? 'Stop sharing' : 'Share your screen'}>
                    {voice.screenTrack ? <MdStopScreenShare size={18} /> : <MdScreenShare size={18} />}
                </button>
            </div>
            <div className="vc-dock-user">
                <Avatar userId={user?._id} name={user?.username} size={30} speaking={!!voice.speaking.self && !voice.muted} />
                <span className="name">{user?.username}</span>
                <button className={`vc-btn small ${voice.muted ? 'off' : ''}`} onClick={voice.toggleMute} disabled={!voice.hasMic} title={voice.muted ? 'Unmute' : 'Mute'}>
                    {voice.muted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                </button>
                <button className={`vc-btn small ${voice.deafened ? 'off' : ''}`} onClick={voice.toggleDeafen} title={voice.deafened ? 'Undeafen' : 'Deafen'}>
                    {voice.deafened ? <MdHeadsetOff size={18} /> : <FaHeadphones />}
                </button>
                <button className="vc-btn small" onClick={voice.openSettings} title="Voice & video settings"><FaCog /></button>
            </div>
        </div>
    );
};

export default VoiceDock;
