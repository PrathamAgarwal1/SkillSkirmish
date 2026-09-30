// voice/voiceContext.js — React context for the global voice call + a hook for a room's channel list.
import { createContext, useContext, useEffect, useState } from 'react';
import { socket } from '../socket';

export const VoiceContext = createContext(null);

/** The current call (see VoiceProvider): state + controls. */
export const useVoice = () => useContext(VoiceContext);

/**
 * Live voice channels of a room for the sidebar: channels, who's in them, who's speaking.
 * Works whether or not you're in a call yourself.
 */
export function useRoomVoice(roomId) {
    const [state, setState] = useState({ channels: [], mode: 'mesh', maxUsers: 10 });
    const [speaking, setSpeaking] = useState({}); // socketId -> bool (people in other channels)

    useEffect(() => {
        if (!roomId) return undefined;
        const onState = (s) => { if (s.roomId === roomId) setState(s); };
        const onSpeaking = ({ socketId, speaking: on }) => setSpeaking(prev => ({ ...prev, [socketId]: on }));
        const refresh = () => socket.emit('voice:get-state', { roomId }, (s) => s && !s.error && onState(s));
        socket.on('voice:state', onState);
        socket.on('voice:speaking', onSpeaking);
        socket.on('connect', refresh); // presence is rebuilt after a reconnect
        refresh();
        return () => {
            socket.off('voice:state', onState);
            socket.off('voice:speaking', onSpeaking);
            socket.off('connect', refresh);
        };
    }, [roomId]);

    return { ...state, speaking };
}
