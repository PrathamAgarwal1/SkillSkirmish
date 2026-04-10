const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const net = require('net');
const router = express.Router();

/**
 * Reverse-proxy endpoint for previewing user projects inside the IDE iframe.
 *
 * In production (Railway/Render), user projects run as child processes on
 * internal ports that are NOT exposed to the internet. This proxy bridges
 * the gap: the browser requests /api/preview/<port>/... and the server
 * forwards it internally to http://localhost:<port>/...
 *
 * Usage:  /api/preview/<port>/  →  http://localhost:<port>/
 */

// Validate port parameter to prevent abuse
const isValidPort = (port) => {
    const p = parseInt(port, 10);
    return !isNaN(p) && p >= 1024 && p <= 65535;
};

/**
 * Quick check if a port is accepting connections (50ms timeout).
 * Used to give a better error message if the project hasn't started yet.
 */
const isPortReachable = (port) => {
    return new Promise((resolve) => {
        const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
            client.destroy();
            resolve(true);
        });
        client.on('error', () => {
            client.destroy();
            resolve(false);
        });
        client.setTimeout(500, () => {
            client.destroy();
            resolve(false);
        });
    });
};

// Middleware: allow cross-origin iframe embedding for all preview routes
router.use((req, res, next) => {
    // Allow the iframe to load from any origin (needed when client is on a different domain)
    res.removeHeader('X-Frame-Options');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

router.use('/:port', async (req, res, next) => {
    const { port } = req.params;

    if (!isValidPort(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
    }

    // Block access to the SkillSkirmish server's own port to prevent loops
    const serverPort = parseInt(process.env.PORT || '5000', 10);
    if (parseInt(port, 10) === serverPort) {
        return res.status(403).json({ error: 'Cannot proxy to this port' });
    }

    // Quick reachability check — give a friendly error instead of hanging
    const reachable = await isPortReachable(parseInt(port, 10));
    if (!reachable) {
        return res.status(502).send(`
            <html>
            <body style="background:#1e1e1e;color:#ccc;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
                <div style="text-align:center">
                    <h2 style="color:#f48771;">⏳ Project is still starting up...</h2>
                    <p>Port ${port} is not responding yet. The project may still be installing dependencies or compiling.</p>
                    <p style="color:#6a9955;">Try refreshing in a few seconds.</p>
                    <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#007acc;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;">🔄 Retry</button>
                </div>
            </body>
            </html>
        `);
    }

    const target = `http://localhost:${port}`;

    // Create a one-shot proxy for this request
    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,                         // Support WebSocket (HMR)
        pathRewrite: (path) => {
            // Strip the /api/preview/<port> prefix before forwarding
            const prefix = `/api/preview/${port}`;
            return path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;
        },
        on: {
            error: (err, _req, res) => {
                console.error(`[Preview Proxy] Error proxying to port ${port}:`, err.message);
                if (res.writeHead) {
                    res.writeHead(502, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body style="background:#1e1e1e;color:#ccc;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
                            <div style="text-align:center">
                                <h2 style="color:#f48771;">⚠ Cannot reach localhost:${port}</h2>
                                <p>The project server is not running yet or crashed.</p>
                                <p style="color:#888;">Error: ${err.message}</p>
                                <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#007acc;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;">🔄 Retry</button>
                            </div>
                        </body>
                        </html>
                    `);
                }
            },
            proxyRes: (proxyRes) => {
                // Remove headers that prevent iframe embedding
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['content-security-policy'];
                delete proxyRes.headers['content-security-policy-report-only'];
            }
        },
        // Ignore SSL errors for local dev
        secure: false
    });

    return proxy(req, res, next);
});

module.exports = router;
