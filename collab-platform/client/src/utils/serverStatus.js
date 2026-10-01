// utils/serverStatus.js — keeps the app usable while the API server is asleep or briefly unreachable.
//
// Free hosting (Render) puts the server to sleep after ~15 idle minutes; the first request then takes
// 30–60 s while it boots. This module tracks whether the server is reachable, retries safe requests
// for a while instead of failing them at once, and turns raw "Network Error"s into readable messages.
import axios from 'axios';

const listeners = new Set();
let state = { status: 'unknown', since: Date.now() }; // unknown | ok | waking | offline

const set = (status) => {
    if (state.status === status) return;
    state = { status, since: Date.now() };
    listeners.forEach(fn => fn(state));
};

export const getServerState = () => state;

/** Calls `fn(state)` whenever the server status changes. Returns an unsubscribe function. */
export const onServerState = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export const FRIENDLY_OFFLINE = "Can't reach the server right now. It may be starting up, so please try again in a moment.";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** One health check. Resolves true when the server answered. */
export const pingServer = async (timeout = 70000) => {
    try {
        await axios.get('/api/health', { timeout, __noRetry: true, __silent: true });
        set('ok');
        return true;
    } catch (err) {
        if (err.response) { set('ok'); return true; } // it answered, just not with 200
        return false;
    }
};

let waiting = null;
/** Resolves once the server answers (or after `maxMs`). Shared by everyone waiting at the same time. */
export const waitForServer = (maxMs = 90000) => {
    if (waiting) return waiting;
    waiting = (async () => {
        const deadline = Date.now() + maxMs;
        set('waking');
        while (Date.now() < deadline) {
            if (await pingServer(Math.min(30000, deadline - Date.now()))) return true;
            await sleep(3000);
        }
        set('offline');
        return false;
    })().finally(() => { waiting = null; });
    return waiting;
};

const SAFE_METHODS = ['get', 'head', 'options'];
// No response at all, or the host's proxy answered for a server that is booting / redeploying
const isUnreachable = (err) => !err.response || [502, 503, 504].includes(err.response.status);

/** Installs the retry + friendly-error behaviour on an axios instance (once, at startup). */
export const installNetworkResilience = (client = axios) => {
    client.interceptors.response.use(
        (res) => {
            if (state.status !== 'ok' && !res.config?.__silent) set('ok');
            return res;
        },
        async (err) => {
            const config = err.config || {};
            if (axios.isCancel(err) || config.__noRetry || !isUnreachable(err)) return Promise.reject(err);

            // Safe requests are retried once the server is back (a POST might have gone through, so it isn't)
            const method = (config.method || 'get').toLowerCase();
            const retries = config.__retries || 0;
            if ((SAFE_METHODS.includes(method) || config.retryable) && retries < 2) {
                if (await waitForServer()) {
                    config.__retries = retries + 1;
                    return client.request(config);
                }
            } else if (!err.response) {
                waitForServer(); // show the banner while it wakes up
            }

            if (!err.response) err.message = FRIENDLY_OFFLINE;
            else if (!err.response.data?.msg && !err.response.data?.message) {
                err.response.data = { ...(typeof err.response.data === 'object' ? err.response.data : {}), msg: 'The server is restarting. Please try again in a moment.' };
            }
            return Promise.reject(err);
        }
    );
};
