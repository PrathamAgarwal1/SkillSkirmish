import React, { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { MdHeadsetMic, MdClose, MdOpenInFull, MdCloseFullscreen } from 'react-icons/md';
import { useVoice, useRoomVoice } from '../../voice/voiceContext';
import VoiceStage from './VoiceStage';
import './voice.css';

const OPEN_KEY = 'ss-ide-call-open';
export const OPEN_CALL_EVENT = 'ss-open-call-window';

/**
 * The room's voice channels and call, in a floating window over the IDE: join a channel, watch
 * screen shares and share your own screen without leaving the editor. Drag it by the title bar;
 * resize it from the bottom-right corner.
 */
const FloatingCall = ({ roomId, roomName }) => {
    const voice = useVoice();
    const { channels } = useRoomVoice(roomId);
    const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } });
    const [big, setBig] = useState(false);
    const nodeRef = useRef(null);
    const seenShares = useRef(new Set());

    const inThisRoom = voice.channel?.roomId === roomId;
    const peopleInCalls = channels.reduce((n, c) => n + c.members.length, 0);

    const setOpenSaved = (value) => {
        setOpen(value);
        try { localStorage.setItem(OPEN_KEY, value ? '1' : '0'); } catch { /* ignore */ }
    };

    // The voice dock's video preview opens this window instead of leaving the IDE
    useEffect(() => {
        const onOpen = () => setOpenSaved(true);
        window.addEventListener(OPEN_CALL_EVENT, onOpen);
        window.__ssCallWindow = roomId;
        return () => { window.removeEventListener(OPEN_CALL_EVENT, onOpen); if (window.__ssCallWindow === roomId) window.__ssCallWindow = null; };
    }, [roomId]);

    // Someone in your call starts sharing their screen: pop the window open once for that share
    useEffect(() => {
        if (!inThisRoom) return;
        for (const m of voice.members) {
            if (!m.screen) seenShares.current.delete(m.socketId);
            else if (m.socketId !== voice.selfId && !seenShares.current.has(m.socketId)) {
                seenShares.current.add(m.socketId);
                setOpenSaved(true);
            }
        }
    }, [voice.members, voice.selfId, inThisRoom]);

    if (!roomId) return null;

    return (
        <>
            <button
                className={`vc-ide-toggle ${inThisRoom ? 'live' : ''}`}
                onClick={() => setOpenSaved(!open)}
                title={open ? 'Hide the call window' : 'Voice channels & screen sharing'}
                aria-pressed={open}
            >
                <MdHeadsetMic size={16} />
                <span>{inThisRoom ? voice.channel.name : 'Voice'}</span>
                {!inThisRoom && peopleInCalls > 0 && <span className="vc-ide-count" title={`${peopleInCalls} in voice`}>{peopleInCalls}</span>}
            </button>

            {open && (
                <Draggable nodeRef={nodeRef} handle=".vc-float-bar" bounds="body" cancel="button">
                    <div ref={nodeRef} className={`vc-float ${big ? 'big' : ''}`} role="dialog" aria-label="Voice call">
                        <div className="vc-float-bar">
                            <MdHeadsetMic size={15} />
                            <span className="title">{inThisRoom ? `${voice.channel.name} · ${voice.members.length} in call` : `Voice · ${roomName || 'room'}`}</span>
                            <button onClick={() => setBig(b => !b)} title={big ? 'Smaller' : 'Bigger'}>{big ? <MdCloseFullscreen size={15} /> : <MdOpenInFull size={15} />}</button>
                            <button onClick={() => setOpenSaved(false)} title="Hide (the call keeps going)"><MdClose size={16} /></button>
                        </div>
                        <div className="vc-float-body">
                            <VoiceStage roomId={roomId} roomName={roomName} />
                        </div>
                    </div>
                </Draggable>
            )}
        </>
    );
};

export default FloatingCall;
