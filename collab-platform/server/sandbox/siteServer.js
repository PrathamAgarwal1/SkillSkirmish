// sandbox/siteServer.js — serves static deploys stored in MongoDB (browser mode), either on their own
// subdomain (<slug>.apps.<domain>) or, on hosts without wildcard domains, under /apps/<slug>/.
//
// Sites built for the domain root reference assets like "/assets/index.js". Under /apps/<slug>/ those
// would miss, so HTML attributes are rewritten to the prefix and any other stray absolute request
// (from JS/CSS) is redirected back into the site using its Referer.
const express = require('express');
const SiteFile = require('../models/SiteFile');

const deployService = () => require('../services/deployService');

// Page views for the gallery: one per visitor (IP) per app every 30 minutes; gallery thumbnails
// (iframes) and asset requests don't count.
const VIEW_WINDOW_MS = 30 * 60 * 1000;
const recentViews = new Map(); // "slug|ip" -> time
const countView = (req, slug) => {
    if (req.method !== 'GET' || req.headers['sec-fetch-dest'] === 'iframe') return;
    if (req.headers['sec-fetch-dest'] && req.headers['sec-fetch-dest'] !== 'document') return;
    const key = `${slug}|${req.ip}`;
    const now = Date.now();
    if (now - (recentViews.get(key) || 0) < VIEW_WINDOW_MS) return;
    recentViews.set(key, now);
    if (recentViews.size > 50000) {
        for (const [k, t] of recentViews) if (now - t >= VIEW_WINDOW_MS) recentViews.delete(k);
        if (recentViews.size > 50000) recentViews.clear();
    }
    require('../models/Deployment').updateOne({ slug }, { $inc: { views: 1 } }).catch(() => {});
};

const notFound = (res, message = 'Not found') => res.status(404).type('text/plain').send(message);

const findFile = async (slug, version, rel, wantsHtml) => {
    const candidates = [rel];
    if (!rel || rel.endsWith('/')) candidates[0] = `${rel}index.html`;
    else if (!/\.[a-z0-9]+$/i.test(rel)) candidates.push(`${rel}.html`, `${rel}/index.html`);
    for (const p of candidates) {
        const doc = await SiteFile.findOne({ slug, version, path: p }).lean();
        if (doc) return doc;
    }
    // Client-side routing: unknown pages get the app shell
    return wantsHtml ? SiteFile.findOne({ slug, version, path: 'index.html' }).lean() : null;
};

const prefixAbsoluteUrls = (html, base) =>
    html.replace(/(\s(?:src|href|action|poster)\s*=\s*["'])\/(?!\/)/gi, `$1${base}/`);

/** Serves one file of a stored site. `rel` is the path inside the site; `base` the URL prefix ('' on a subdomain). */
const serveStored = async (req, res, { slug, version, rel, base = '' }) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    let decoded;
    try { decoded = decodeURIComponent(rel); } catch { return notFound(res); }
    if (decoded.split('/').includes('..')) return notFound(res);

    const wantsHtml = (req.headers.accept || '').includes('text/html');
    const doc = await findFile(slug, version, decoded, wantsHtml);
    if (!doc) return notFound(res);

    const etag = `"${slug}-${version}-${doc.path}-${doc.size}"`;
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', doc.contentType);
    const isHtml = /text\/html/.test(doc.contentType);
    res.setHeader('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=300');
    if (isHtml && wantsHtml) countView(req, slug);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    let body = Buffer.from(doc.data.buffer || doc.data);
    if (isHtml && base) body = Buffer.from(prefixAbsoluteUrls(body.toString('utf8'), base), 'utf8');
    res.setHeader('Content-Length', body.length);
    return req.method === 'HEAD' ? res.end() : res.end(body);
};

const notLivePage = `<!doctype html><meta charset="utf-8"><title>Not deployed</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1e1e1e;color:#ccc;font-family:ui-monospace,monospace;text-align:center">
<div><h2 style="color:#4fc1ff">Nothing is deployed here</h2><p style="color:#888">This app is not live right now.</p></div>`;

/** Express router for /apps/<slug>/... */
const appsRouter = express.Router();
appsRouter.get('/:slug', (req, res, next) => (req.originalUrl.split('?')[0].endsWith('/')
    ? next()
    : res.redirect(301, `${req.baseUrl}/${req.params.slug}/`)));
appsRouter.all('/:slug/*', async (req, res) => {
    try {
        const { slug } = req.params;
        const app = await deployService().resolveApp(slug);
        if (!app) return res.status(404).type('html').send(notLivePage);
        // Private / friends-only apps need an access pass (sandbox/appAccess.js)
        if (!(await require('./appAccess').gate(req, res, { slug, base: `/apps/${slug}` }))) return;
        const rel = req.params[0] || '';
        if (app.type === 'db') return serveStored(req, res, { slug, version: app.version, rel, base: `/apps/${slug}` });
        // Disk/container deployments are served on their own subdomain
        return res.redirect(302, deployService().appUrl(slug) + rel);
    } catch (err) {
        console.error('[apps] request failed:', err.message);
        res.status(500).type('text/plain').send('Internal error');
    }
});

/**
 * A page under /apps/<slug>/ asked for an absolute path like /assets/app.js or /_expo/...:
 * send it back into the same site.
 */
const refererFallback = (req, res, next) => {
    if (req.method !== 'GET' || /^\/(api|socket\.io|apps)(\/|$)/.test(req.path)) return next();
    const referer = req.headers.referer;
    if (!referer) return next();
    try {
        // (Host isn't compared: reverse proxies may rewrite it, and a redirect into /apps is harmless)
        const m = new URL(referer).pathname.match(/^\/apps\/([a-z0-9-]{1,63})\//);
        if (m) return res.redirect(307, `/apps/${m[1]}${req.originalUrl}`);
    } catch { /* bad referer */ }
    return next();
};

module.exports = { appsRouter, refererFallback, serveStored, prefixAbsoluteUrls };
