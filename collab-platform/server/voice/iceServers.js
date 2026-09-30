// voice/iceServers.js — STUN/TURN servers handed to browsers for voice/video calls.
//
// Calls are peer-to-peer WebRTC by default. STUN (free, public) lets most peers connect directly;
// a TURN relay is needed for the rest (strict corporate/mobile NATs). Configure one of:
//   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL     static credentials (any provider)
//   TURN_URLS + TURN_SECRET                         coturn "use-auth-secret" (time-limited credentials)
//   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN   Cloudflare Realtime TURN (has a free tier)
const crypto = require('crypto');

const STUN = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
];

const CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;
let cloudflareCache = { servers: null, expires: 0 };

const list = (value) => String(value || '').split(',').map(s => s.trim()).filter(Boolean);

/** coturn REST API credentials: username "<expiry>:<user>", password HMAC-SHA1(secret, username) */
const coturnCredentials = (secret, userId, now = Date.now()) => {
    const username = `${Math.floor(now / 1000) + CREDENTIAL_TTL_SECONDS}:${userId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    return { username, credential };
};

async function cloudflareServers() {
    if (cloudflareCache.servers && Date.now() < cloudflareCache.expires) return cloudflareCache.servers;
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS })
    });
    if (!res.ok) throw new Error(`Cloudflare TURN returned ${res.status}`);
    const data = await res.json();
    const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    // Refresh well before the credentials expire
    cloudflareCache = { servers, expires: Date.now() + (CREDENTIAL_TTL_SECONDS / 2) * 1000 };
    return servers;
}

/** ICE servers for one user joining a call. Never throws: falls back to STUN only. */
async function getIceServers(userId) {
    const servers = [...STUN];
    try {
        const urls = list(process.env.TURN_URLS);
        if (urls.length && process.env.TURN_SECRET) {
            servers.push({ urls, ...coturnCredentials(process.env.TURN_SECRET, userId) });
        } else if (urls.length && process.env.TURN_USERNAME) {
            servers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL || '' });
        }
        if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) {
            servers.push(...(await cloudflareServers()));
        }
    } catch (err) {
        console.error('[voice] TURN configuration failed, using STUN only:', err.message);
    }
    return servers;
}

const hasTurn = () => !!((process.env.TURN_URLS && (process.env.TURN_SECRET || process.env.TURN_USERNAME)) ||
    (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN));

module.exports = { getIceServers, coturnCredentials, hasTurn };
