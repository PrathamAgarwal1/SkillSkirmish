const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const router = express.Router();

/**
 * Reverse-proxy endpoint for previewing user projects inside the IDE iframe.
 *
 * Why?  The IDE client is served from localhost:5173 while user projects run
 * on dynamically-assigned ports (e.g. 4000, 3001).  Browsers block these
 * cross-origin iframe loads with ERR_BLOCKED_BY_CSP.  By proxying through
 * the SkillSkirmish server (port 5000), the iframe loads from the same
 * origin and the restriction disappears.
 *
 * Usage:  /api/preview/<port>/  →  http://localhost:<port>/
 */

// Validate port parameter to prevent abuse
const isValidPort = (port) => {
    const p = parseInt(port, 10);
    return !isNaN(p) && p >= 1024 && p <= 65535;
};

router.use('/:port', (req, res, next) => {
    const { port } = req.params;

    if (!isValidPort(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
    }

    // Block access to the SkillSkirmish server's own port to prevent loops
    const serverPort = parseInt(process.env.PORT || '5000', 10);
    if (parseInt(port, 10) === serverPort) {
        return res.status(403).json({ error: 'Cannot proxy to this port' });
    }

    const target = `http://localhost:${port}`;

    // Create a one-shot proxy for this request
    const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        ws: true,                         // Support WebSocket (HMR)
        pathRewrite: (path) => {
            // Strip the /api/preview/<port> prefix before forwarding
            // path here is the full path including /api/preview/<port>/...
            // We need to remove /api/preview/<port> from the beginning
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
