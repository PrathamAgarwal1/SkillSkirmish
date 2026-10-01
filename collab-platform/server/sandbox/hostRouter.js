// sandbox/hostRouter.js — serves previews and deployed apps on their own subdomains.
//
//   <token>.preview.<domain>  → the project's running dev server (inside its sandbox)
//   <slug>.apps.<domain>      → the deployed app (static files or its server container)
//
// Own origins mean apps behave exactly like on a real domain: absolute asset paths, client-side
// routing, cookies, and websockets (Vite HMR, Jupyter kernels, Streamlit) all just work — unlike
// the old /api/preview/<port>/ path prefix, which broke almost every modern web app.
const zlib = require('zlib');
const express = require('express');
const httpProxy = require('http-proxy');
const sandbox = require('./index');
const { PREVIEW_HOST_SUFFIX, APPS_HOST_SUFFIX } = require('./config');
const { serveStored } = require('./siteServer');

// Lazy to avoid a require cycle (deployService -> sandbox -> ...)
const deployService = () => require('../services/deployService');

const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true, changeOrigin: true, selfHandleResponse: true });

/** "abc.preview.localhost:5000" -> { kind: 'preview', id: 'abc' } */
const classify = (hostHeader = '') => {
    const host = String(hostHeader).split(':')[0].toLowerCase();
    for (const [kind, suffix] of [['preview', PREVIEW_HOST_SUFFIX], ['app', APPS_HOST_SUFFIX]]) {
        if (host.endsWith(`.${suffix}`)) {
            const id = host.slice(0, -suffix.length - 1);
            if (/^[a-z0-9-]{1,63}$/.test(id)) return { kind, id };
        }
    }
    return null;
};

// Injected into previewed HTML pages: relays console output & navigation to the IDE and accepts
// back/forward/reload commands (the IDE can't touch a cross-origin iframe directly).
const BRIDGE_SCRIPT = `<script>(function(){if(window.__ssBridge||window.parent===window)return;window.__ssBridge=1;var P=window.parent;
function send(m){m.__ss=1;try{P.postMessage(m,'*')}catch(e){}}
function fmt(a){return Array.prototype.map.call(a,function(x){if(x instanceof Error)return x.stack||x.message;if(x&&typeof x==='object'){try{return JSON.stringify(x)}catch(e){return String(x)}}return String(x)}).join(' ')}
['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){send({kind:'console',level:k,text:fmt(arguments)});return o.apply(console,arguments)}});
addEventListener('error',function(e){send({kind:'console',level:'error',text:(e.message||'Error')+(e.filename?' ('+e.filename+':'+e.lineno+')':'')})});
addEventListener('unhandledrejection',function(e){send({kind:'console',level:'error',text:'Unhandled promise rejection: '+fmt([e.reason])})});
function nav(){send({kind:'navigate',href:location.href,title:document.title})}
['pushState','replaceState'].forEach(function(k){var o=history[k];history[k]=function(){var r=o.apply(this,arguments);nav();return r}});
addEventListener('popstate',nav);addEventListener('hashchange',nav);addEventListener('load',nav);nav();
addEventListener('message',function(e){var c=e.data&&e.data.__ssCmd;if(e.source!==P||!c)return;if(c==='back')history.back();else if(c==='forward')history.forward();else if(c==='reload')location.reload()});
})();</script>`;

const page = (title, body, refreshSeconds) => `<!doctype html><html><head><meta charset="utf-8">
${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ''}<title>${title}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#1e1e1e;color:#ccc;font-family:ui-monospace,monospace;text-align:center}
h2{color:#4fc1ff;font-weight:600}p{color:#888}.spin{width:28px;height:28px;margin:0 auto 16px;border:3px solid #333;border-top-color:#4fc1ff;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
</head><body><div>${body}</div></body></html>`;

const startingPage = () => page('Starting…', `<div class="spin"></div><h2>Your app is starting…</h2>
<p>Installing dependencies or compiling can take a moment.<br>This page refreshes automatically.</p>`, 2);

const expiredPage = () => page('Preview not running', `<h2>This preview is not running</h2>
<p>Press <b>▶ Run</b> in the IDE to start it again.</p>`);

const notDeployedPage = () => page('Not deployed', `<h2>Nothing is deployed here</h2>
<p>This app is not live right now.</p>`);

// Frame-blocking headers would stop the IDE from showing the preview
const stripFrameBlocking = (headers) => {
    delete headers['x-frame-options'];
    const csp = headers['content-security-policy'];
    if (csp) {
        const cleaned = String(csp).split(';').filter(d => !/^\s*frame-ancestors\b/i.test(d)).join(';');
        if (cleaned.trim()) headers['content-security-policy'] = cleaned; else delete headers['content-security-policy'];
    }
};

const decompress = (buf, encoding) => {
    switch ((encoding || '').toLowerCase()) {
        case 'gzip': return zlib.gunzipSync(buf);
        case 'br': return zlib.brotliDecompressSync(buf);
        case 'deflate': return zlib.inflateSync(buf);
        default: return buf;
    }
};

proxy.on('proxyRes', (proxyRes, req, res) => {
    const headers = { ...proxyRes.headers };
    const isPreview = req.ssRoute?.kind === 'preview';
    if (isPreview) stripFrameBlocking(headers);

    const isHtml = /text\/html/i.test(headers['content-type'] || '');
    if (!isPreview || !isHtml || req.method === 'HEAD') {
        // Stream everything else untouched (JS bundles, images, SSE, downloads, ...)
        res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, headers);
        proxyRes.pipe(res);
        return;
    }

    const chunks = [];
    // Dev servers sometimes drop the connection (e.g. Vite restarting after optimizing deps) —
    // close the client side too instead of leaving the browser hanging
    proxyRes.on('aborted', () => res.destroy());
    proxyRes.on('error', () => res.destroy());
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
        let body;
        try {
            body = decompress(Buffer.concat(chunks), headers['content-encoding']).toString('utf8');
        } catch {
            res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, headers);
            return res.end(Buffer.concat(chunks));
        }
        const injected = /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (m) => m + BRIDGE_SCRIPT) : BRIDGE_SCRIPT + body;
        // The body was rewritten: drop encoding/framing headers from upstream and send an exact length
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        delete headers.etag;
        const out = Buffer.from(injected, 'utf8');
        headers['content-length'] = String(out.length);
        headers['cache-control'] = 'no-store';
        res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, headers);
        res.end(out);
    });
});

proxy.on('error', (err, req, res) => {
    // res is a socket for websocket upgrades
    if (res && typeof res.writeHead === 'function') {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(req.ssRoute?.kind === 'preview' ? startingPage() : notDeployedPage());
        } else {
            res.destroy();
        }
    } else if (res && typeof res.destroy === 'function') {
        res.destroy();
    }
});

// Static sites: one serve-static instance per deployed folder, with SPA fallback to index.html
const staticServers = new Map();
const serveStatic = (root, req, res) => {
    if (!staticServers.has(root)) {
        if (staticServers.size > 200) staticServers.clear();
        const app = express();
        app.disable('x-powered-by');
        app.use(express.static(root, { index: 'index.html', extensions: ['html'], maxAge: '1h' }));
        // Client-side routing: unknown paths that want HTML get the app shell
        app.use((rq, rs) => {
            if (rq.method === 'GET' && (rq.headers.accept || '').includes('text/html')) {
                rs.sendFile('index.html', { root }, (err) => err && rs.status(404).end('Not found'));
            } else {
                rs.status(404).end('Not found');
            }
        });
        staticServers.set(root, app);
    }
    staticServers.get(root)(req, res);
};

/** Resolves where a preview/app request should go: { port } | { staticRoot } | { page } */
const resolveTarget = async (route) => {
    if (route.kind === 'preview') {
        const target = sandbox.resolvePreview(route.id);
        return target ? { port: target.port } : { page: expiredPage(), status: 404 };
    }
    const app = await deployService().resolveApp(route.id);
    if (!app) return { page: notDeployedPage(), status: 404 };
    if (app.type === 'db') return { stored: app };
    return app.type === 'static' ? { staticRoot: app.root } : { port: app.port };
};

/** True if this request/upgrade is for a preview or app host (so the API should not handle it). */
const handles = (req) => !!classify(req.headers.host);

const handleRequest = async (req, res) => {
    const route = classify(req.headers.host);
    req.ssRoute = route;
    try {
        const target = await resolveTarget(route);
        if (route.kind !== 'preview' && !target.page && !(await require('./appAccess').gate(req, res, { slug: route.id }))) return;
        if (target.page) {
            res.writeHead(target.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(target.page);
        }
        if (target.staticRoot) return serveStatic(target.staticRoot, req, res);
        if (target.stored) {
            const rel = req.url.split('?')[0].replace(/^\/+/, '');
            return serveStored(req, res, { slug: target.stored.slug, version: target.stored.version, rel });
        }
        proxy.web(req, res, { target: `http://127.0.0.1:${target.port}` });
    } catch (err) {
        console.error('[hostRouter] request failed:', err.message);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal error');
    }
};

const handleUpgrade = async (req, socket, head) => {
    const route = classify(req.headers.host);
    req.ssRoute = route;
    try {
        const target = await resolveTarget(route);
        if (!target.port) return socket.destroy();
        if (route.kind !== 'preview' && !(await require('./appAccess').allowsUpgrade(req, route.id))) return socket.destroy();
        proxy.ws(req, socket, head, { target: `http://127.0.0.1:${target.port}` });
    } catch {
        socket.destroy();
    }
};

/**
 * Puts the router in front of the API server's 'request' and 'upgrade' listeners. Must run AFTER
 * Socket.IO attaches, because Socket.IO would otherwise grab /socket.io/ traffic that belongs to
 * a user's own app on a preview/app host.
 */
const install = (server) => {
    for (const event of ['request', 'upgrade']) {
        const existing = server.listeners(event).slice();
        server.removeAllListeners(event);
        server.on(event, (req, ...rest) => {
            if (handles(req)) {
                return event === 'request' ? handleRequest(req, ...rest) : handleUpgrade(req, ...rest);
            }
            for (const listener of existing) listener.call(server, req, ...rest);
        });
    }
};

module.exports = { install, classify, handles, BRIDGE_SCRIPT };

