// routes/gitProxy.js — lets git in the browser (isomorphic-git, browser mode) talk to GitHub & co.
//
// Git hosts don't send CORS headers, so a web page can't clone, pull or push directly. The IDE sends
// git's smart-HTTP requests here instead (/api/git-proxy/github.com/user/repo.git/info/refs...) and
// they're forwarded as-is. Only signed-in users, only known git hosts, and only git's own endpoints:
// this is not a general-purpose proxy.
const express = require('express');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');

const router = express.Router();

const HOSTS = new Set(['github.com', 'gist.github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);
// <owner>/<repo>[.git]/info/refs | git-upload-pack | git-receive-pack (GitLab allows nested groups)
const GIT_PATH = /^\/(?:[\w.-]+\/){1,6}(?:info\/refs|git-upload-pack|git-receive-pack)$/;
const SERVICES = new Set(['git-upload-pack', 'git-receive-pack']);
const MAX_UPLOAD = 100 * 1024 * 1024;   // a push
const MAX_DOWNLOAD = 300 * 1024 * 1024; // a clone/fetch
const FORWARD_HEADERS = ['accept', 'content-type', 'authorization', 'git-protocol'];

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    keyGenerator: (req) => `git:${req.user.id}`,
    message: { msg: 'Too many git requests. Please wait a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const sizeLimit = (max, label) => {
    let total = 0;
    return new Transform({
        transform(chunk, _enc, cb) {
            total += chunk.length;
            if (total > max) return cb(new Error(`${label} is larger than ${Math.round(max / 1024 / 1024)} MB`));
            cb(null, chunk);
        }
    });
};

router.all('/:host/*', auth, limiter, async (req, res) => {
    const host = String(req.params.host).toLowerCase();
    const path = `/${req.params[0] || ''}`;
    if (!HOSTS.has(host)) return res.status(403).json({ msg: `Git host not supported: ${host}. Use GitHub, GitLab, Bitbucket or Codeberg.` });
    if (!GIT_PATH.test(path) || path.includes('..')) return res.status(400).json({ msg: 'Not a git request' });
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();

    const query = new URLSearchParams();
    if (req.query.service !== undefined) {
        if (!SERVICES.has(req.query.service)) return res.status(400).json({ msg: 'Unknown git service' });
        query.set('service', req.query.service);
    }

    const headers = { 'user-agent': 'git/isomorphic-git (SkillSkirmish)' };
    for (const h of FORWARD_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];

    let url = `https://${host}${path}${query.size ? `?${query}` : ''}`;
    try {
        let upstream;
        for (let hops = 0; ; hops++) {
            upstream = await fetch(url, {
                method: req.method,
                headers,
                redirect: 'manual',
                ...(req.method === 'POST' ? { body: Readable.toWeb(req.pipe(sizeLimit(MAX_UPLOAD, 'The push'))), duplex: 'half' } : {})
            });
            // Follow redirects (renamed repos) only within allowed hosts, and only for GETs
            const location = upstream.headers.get('location');
            if (upstream.status >= 300 && upstream.status < 400 && location && req.method === 'GET' && hops < 3) {
                const next = new URL(location, url);
                if (next.protocol === 'https:' && HOSTS.has(next.hostname)) { url = next.toString(); continue; }
            }
            break;
        }

        res.status(upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status);
        for (const h of ['content-type', 'cache-control', 'www-authenticate']) {
            const v = upstream.headers.get(h);
            if (v) res.setHeader(h, v);
        }
        if (!upstream.body) return res.end();
        await pipeline(Readable.fromWeb(upstream.body), sizeLimit(MAX_DOWNLOAD, 'The repository'), res);
    } catch (err) {
        console.error('[git-proxy]', host, err.message);
        if (!res.headersSent) res.status(502).json({ msg: `Could not reach ${host}: ${err.message}` });
        else res.destroy(err);
    }
});

module.exports = router;
