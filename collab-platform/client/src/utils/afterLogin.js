// utils/afterLogin.js — remembers the page someone wanted before being sent to sign in, so they
// land back there afterwards (invite links, private apps, battle challenges...).
const KEY = 'ss-after-login';

export const rememberDestination = (path) => {
    if (!path || /^\/(login|register|auth)/.test(path)) return;
    try { sessionStorage.setItem(KEY, path); } catch { /* storage blocked */ }
};

/** The remembered path (once), or `fallback`. */
export const takeDestination = (fallback = '/dashboard') => {
    try {
        const path = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return path && path.startsWith('/') ? path : fallback;
    } catch {
        return fallback;
    }
};
