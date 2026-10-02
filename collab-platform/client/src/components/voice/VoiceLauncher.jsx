// components/voice/VoiceLauncher.jsx — the one voice control for the whole site: a pill you can drag
// anywhere (it remembers where), showing your call's status with quick mute / hang up, and a floating
// call window with the room's channels, video and screen sharing.
import React, { useContext, useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import axios from 'axios';
import { MdHeadsetMic, MdClose, MdOpenInFull, MdCloseFullscreen, MdCallEnd, MdArrowBack } from 'react-icons/md';
import { FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';
import AuthContext from '../../context/AuthContext';
import { useVoice, useRoomVoice } from '../../voice/voiceContext';
import { useCurrentPageRoom } from '../../voice/pageRoom';
import { pingColor } from '../../voice/ui';
import VoiceStage from './VoiceStage';
import './voice.css';

const PILL_POS = 'ss-voice-pill-pos';
const WIN_POS = 'ss-voice-window-pos';
const OPEN_KEY = 'ss-ide-call-open';
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

/** Keeps a saved drag offset on screen after the window was resized. */
const clampPill = ({ x, y }) => ({
    x: Math.max(-window.innerWidth / 2 + 70, Math.min(window.innerWidth / 2 - 70, x)),
    y: Math.max(-window.innerHeight + 80, Math.min(0, y))
});

/** When you're not in a call and the page has no room: pick one of your rooms. */
function RoomPicker({ onPick }) {
    const [rooms, setRooms] = useState(null);
    useEffect(() => { axios.get('/api/rooms/myrooms').then(r => setRooms(r.data)).catch(() => setRooms([])); }, []);
    if (!rooms) return <div className="vc-pick-empty">Loading your rooms…</div>;
    if (!rooms.length) return <div className="vc-pick-empty">Voice channels live in rooms. Create or join a room first.</div>;
    return (
        <div className="vc-pick">
            <div className="vc-pick-title">Join voice in…</div>
            {rooms.map(r => (
                <button key={r._id} onClick={() => onPick({ roomId: r._id, roomName: r.name })}>
                    <MdHeadsetMic size={15} /> {r.name}
                </button>
            ))}
        </div>
    );
}

export default function VoiceLauncher() {
    const { isAuthenticated } = useContext(AuthContext);
    const voice = useVoice();
    const pageRoom = useCurrentPageRoom();
    const [picked, setPicked] = useState(null);
    const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } });
    const [big, setBig] = useState(false);
    const [pillPos, setPillPos] = useState(() => clampPill(readJson(PILL_POS, { x: 0, y: 0 })));
    const [winPos] = useState(() => readJson(WIN_POS, { x: 0, y: 0 }));
    const pillRef = useRef(null);
    const winRef = useRef(null);
    const dragged = useRef(false);
    const seenShares = useRef(new Set());

    // Whose channels: your call's room, else this page's room, else the one you picked
    const target = voice.channel ? { roomId: voice.channel.roomId, roomName: voice.channel.roomName } : pageRoom || picked;
    const { channels } = useRoomVoice(target?.roomId);
    const inCall = !!voice.channel;
    const peopleInCalls = (channels || []).reduce((n, c) => n + c.members.length, 0);

    const setOpenSaved = (value) => {
        setOpen(value);
        try { localStorage.setItem(OPEN_KEY, value ? '1' : '0'); } catch { /* ignore */ }
    };

    // Someone in your call starts sharing their screen: pop the window open once for that share
    useEffect(() => {
        if (!inCall) return;
        for (const m of voice.members) {
            if (!m.screen) seenShares.current.delete(m.socketId);
            else if (m.socketId !== voice.selfId && !seenShares.current.has(m.socketId)) {
                seenShares.current.add(m.socketId);
                setOpenSaved(true);
            }
        }
    }, [voice.members, voice.selfId, inCall]);

    // Keep the pill on screen when the window gets smaller
    useEffect(() => {
        const onResize = () => setPillPos(p => clampPill(p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    if (!isAuthenticated) return null;

    const reconnecting = inCall && voice.status !== 'connected';
    const statusColor = !inCall ? undefined : reconnecting ? 'var(--gh-f0b232)' : pingColor(voice.ping);
    const label = inCall ? voice.channel.name : 'Voice';

    return (
        <>
            <div className="vc-pill-anchor">
            <Draggable nodeRef={pillRef} position={pillPos} cancel=".vc-pill-btn"
                onStart={() => { dragged.current = false; }}
                onDrag={(e, d) => { if (Math.abs(d.deltaX) + Math.abs(d.deltaY) > 0) dragged.current = true; }}
                onStop={(e, d) => { const p = clampPill({ x: d.x, y: d.y }); setPillPos(p); writeJson(PILL_POS, p); }}>
                <div ref={pillRef} className={`vc-ide-toggle vc-pill ${inCall ? 'live' : ''}`} title="Drag me anywhere. Click for voice channels and screen sharing"
                    onClick={(e) => {
                        if (e.target.closest('.vc-pill-btn')) return; // mute / hang up
                        if (dragged.current) { dragged.current = false; return; } // end of a drag, not a click
                        setOpenSaved(!open);
                    }}>
                    <button type="button" className="vc-pill-main" aria-pressed={open} aria-label={open ? 'Hide the call window' : 'Open voice channels'}>
                        <MdHeadsetMic size={16} color={statusColor} />
                        <span>{reconnecting ? 'Reconnecting…' : label}</span>
                        {!inCall && peopleInCalls > 0 && <span className="vc-ide-count" title={`${peopleInCalls} in voice`}>{peopleInCalls}</span>}
                    </button>
                    {inCall && (
                        <>
                            <button type="button" className={`vc-pill-btn ${voice.muted ? 'off' : ''}`} onClick={voice.toggleMute} disabled={!voice.hasMic} title={voice.muted ? 'Unmute' : 'Mute'} aria-label={voice.muted ? 'Unmute' : 'Mute'}>
                                {voice.muted ? <FaMicrophoneSlash size={13} /> : <FaMicrophone size={13} />}
                            </button>
                            <button type="button" className="vc-pill-btn hangup" onClick={() => voice.leave()} title="Disconnect" aria-label="Disconnect">
                                <MdCallEnd size={16} />
                            </button>
                        </>
                    )}
                </div>
            </Draggable>
            </div>

            {open && (
                <Draggable nodeRef={winRef} handle=".vc-float-bar" bounds="body" cancel="button" defaultPosition={winPos}
                    onStop={(e, d) => writeJson(WIN_POS, { x: d.x, y: d.y })}>
                    <div ref={winRef} className={`vc-float ${big ? 'big' : ''}`} role="dialog" aria-label="Voice call">
                        <div className="vc-float-bar">
                            {!inCall && !pageRoom && picked && <button onClick={() => setPicked(null)} title="Pick another room"><MdArrowBack size={15} /></button>}
                            <MdHeadsetMic size={15} />
                            <span className="title">{inCall ? `${voice.channel.name} · ${voice.members.length} in call` : `Voice · ${target?.roomName || 'pick a room'}`}</span>
                            <button onClick={() => setBig(b => !b)} title={big ? 'Smaller' : 'Bigger'}>{big ? <MdCloseFullscreen size={15} /> : <MdOpenInFull size={15} />}</button>
                            <button onClick={() => setOpenSaved(false)} title="Hide (the call keeps going)"><MdClose size={16} /></button>
                        </div>
                        <div className="vc-float-body">
                            {target ? <VoiceStage roomId={target.roomId} roomName={target.roomName} /> : <RoomPicker onPick={setPicked} />}
                        </div>
                    </div>
                </Draggable>
            )}
        </>
    );
}
