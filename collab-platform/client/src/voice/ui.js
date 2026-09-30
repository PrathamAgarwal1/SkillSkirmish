// voice/ui.js — small helpers shared by the voice components.

/** Stable color per user (like Discord's default avatars). */
export const colorFor = (id = '') => {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h}, 55%, 45%)`;
};

export const initials = (name = '?') => name.trim().slice(0, 2).toUpperCase() || '?';

/** Signal color for a round-trip time. */
export const pingColor = (ms) => (ms == null ? '#949ba4' : ms < 120 ? '#23a55a' : ms < 250 ? '#f0b232' : '#f23f43');
