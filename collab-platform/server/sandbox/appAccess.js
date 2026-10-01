// sandbox/appAccess.js — who may open a deployed app.
//
//   public   anyone with the link
//   friends  the project's members, plus friends of whoever chose "friends"
//   private  the project's members only
//
// The app is served from the API's own domain while people sign in on the website, so a visitor
// proves access with a short-lived pass: the website asks /api/apps/<slug>/access for a link with
// ?ss_access=<token>; the app server turns that into a cookie for that one app and redirects to the
// clean URL. Without a valid pass, non-public apps show a "private app" page with a sign-in button.
const jwt = require('jsonwebtoken');
const Deployment = require('../models/Deployment');
const User = require('../models/User');
const { getProjectAccess } = require('../utils/access');
const { areFriends } = require('../utils/friends');

const PARAM = 'ss_access';
const PASS_TTL = '8h';
const VISIBILITIES = ['public', 'friends', 'private'];

const cookieName = (slug) => `ss_app_${slug.replace(/[^a-z0-9]/g, '_')}`;
const secret = () => process.env.JWT_SECRET;

/** May this user open the app? (`dep` is a Deployment document or lean object) */
async function canView(dep, userId) {
    const visibility = dep.visibility || 'public';
    if (visibility === 'public') return true;
    if (!userId) return false;
    if (await getProjectAccess(String(dep.project), String(userId))) return true;
    return visibility === 'friends' && !!dep.visibilityOwner && await areFriends(dep.visibilityOwner, userId);
}

const issuePass = (slug, userId) => jwt.sign({ typ: 'app', app: slug, sub: String(userId) }, secret(), { expiresIn: PASS_TTL });
const readPass = (token, slug) => {
    try {
        const p = jwt.verify(token, secret());
        return p.typ === 'app' && p.app === slug ? p : null;
    } catch { return null; }
};

const readCookie = (req, name) => {
    for (const part of String(req.headers.cookie || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
};

const clientUrl = () => String(process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const lockedPage = ({ slug, visibility, owner, expired }) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${visibility === 'friends' ? 'Friends only' : 'Private app'}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;text-align:center;padding:16px}
.card{max-width:420px}.icon{font-size:48px}h1{color:#fff;font-size:22px;margin:10px 0}p{color:#8b949e;line-height:1.5}
a.btn{display:inline-block;margin-top:14px;background:#238636;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600}</style></head>
<body><div class="card"><div class="icon">${visibility === 'friends' ? '👥' : '🔒'}</div>
<h1>${visibility === 'friends' ? 'This app is for friends only' : 'This app is private'}</h1>
<p>${expired ? 'Your access link has expired. ' : ''}${visibility === 'friends'
        ? `Only ${owner ? `<b>${esc(owner)}</b>'s` : 'the owner\'s'} friends and the project's team can open it.`
        : 'Only the project\'s team can open it.'} Sign in to SkillSkirmish to check if you have access.</p>
<a class="btn" href="${esc(`${clientUrl()}/#/open/${slug}`)}">Sign in to view</a></div></body></html>`;

/**
 * Checks a request for a non-public app. Returns true to continue serving; otherwise it has already
 * responded (redirect, or the locked page). `base` is the app's URL prefix ('' on its own subdomain).
 */
// Every asset request passes through here, so visibility is cached for a few seconds
const cache = new Map(); // slug -> { dep, at }
const CACHE_MS = 5000;
const lookup = async (slug) => {
    const hit = cache.get(slug);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.dep;
    const dep = await Deployment.findOne({ slug }).select('visibility visibilityOwner project').lean();
    if (cache.size > 5000) cache.clear();
    cache.set(slug, { dep, at: Date.now() });
    return dep;
};
// A pass is re-checked against the current rules (cached briefly), so making an app private or
// unfriending someone takes effect within ~30 s instead of when their pass expires
const allowed = new Map(); // "slug|userId" -> { ok, at }
const ALLOWED_MS = 30000;
const stillAllowed = async (dep, slug, userId) => {
    const key = `${slug}|${userId}`;
    const hit = allowed.get(key);
    if (hit && Date.now() - hit.at < ALLOWED_MS) return hit.ok;
    const ok = await canView(dep, userId);
    if (allowed.size > 20000) allowed.clear();
    allowed.set(key, { ok, at: Date.now() });
    return ok;
};
const forget = (slug) => {
    cache.delete(slug);
    for (const key of allowed.keys()) if (key.startsWith(`${slug}|`)) allowed.delete(key);
};

async function gate(req, res, { slug, base = '' }) {
    const dep = await lookup(slug);
    const visibility = dep?.visibility || 'public';
    if (!dep || visibility === 'public') return true;

    const url = new URL(req.originalUrl || req.url, 'http://app');
    const token = url.searchParams.get(PARAM);
    if (token) {
        const pass = readPass(token, slug);
        if (pass && await stillAllowed(dep, slug, pass.sub)) {
            const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
            res.setHeader('Set-Cookie', `${cookieName(slug)}=${encodeURIComponent(token)}; Path=${base || ''}/; HttpOnly; SameSite=Lax; Max-Age=${8 * 3600}${secure ? '; Secure' : ''}`);
            url.searchParams.delete(PARAM);
            res.statusCode = 302;
            res.setHeader('Location', url.pathname + url.search);
            res.setHeader('Cache-Control', 'no-store');
            res.end();
            return false;
        }
    }
    const cookie = readCookie(req, cookieName(slug));
    const pass = cookie && readPass(cookie, slug);
    if (pass && await stillAllowed(dep, slug, pass.sub)) return true;

    // Asset requests just fail; page loads get the explanation
    if (!String(req.headers.accept || '').includes('text/html')) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain');
        res.end('This app is not public');
        return false;
    }
    const owner = visibility === 'friends' && dep.visibilityOwner ? (await User.findById(dep.visibilityOwner).select('username').lean())?.username : null;
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(lockedPage({ slug, visibility, owner, expired: !!(token || cookie) }));
    return false;
}

/** WebSocket upgrades can't be redirected: they need the cookie already (non-public apps). */
async function allowsUpgrade(req, slug) {
    const dep = await lookup(slug);
    if (!dep || (dep.visibility || 'public') === 'public') return true;
    const cookie = readCookie(req, cookieName(slug));
    const pass = cookie && readPass(cookie, slug);
    return !!pass && stillAllowed(dep, slug, pass.sub);
}

/**
 * After unfriending: a friendship affects every friends-only app either person owns, so all cached
 * decisions are dropped (they're cheap to recompute).
 */
const forgetUsers = () => allowed.clear();

module.exports = { canView, issuePass, gate, forget, forgetUsers, allowsUpgrade, VISIBILITIES, PARAM, cookieName, readPass };
