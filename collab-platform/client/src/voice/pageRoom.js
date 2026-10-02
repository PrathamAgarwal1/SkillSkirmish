// voice/pageRoom.js — which room the current page belongs to (a room page, or a project's IDE), so the
// site-wide voice launcher knows whose channels to show.
import { useEffect, useSyncExternalStore } from 'react';

let current = null; // { roomId, roomName }
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

/** Pages call this with their room; it's cleared again when they unmount. */
export function usePageRoom(roomId, roomName) {
    useEffect(() => {
        if (!roomId) return undefined;
        const mine = { roomId: String(roomId), roomName: roomName || '' };
        current = mine;
        emit();
        return () => { if (current === mine) { current = null; emit(); } };
    }, [roomId, roomName]);
}

/** The room of the page you're on, or null. */
export function useCurrentPageRoom() {
    return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}
