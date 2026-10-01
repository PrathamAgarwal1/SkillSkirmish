#!/usr/bin/env node
// scripts/smoke.js — checks a deployed SkillSkirmish (API + website) after each deploy.
//
//   npm run smoke -- https://your-api.onrender.com --client https://your-site.vercel.app
//
// Read-only: it only sends GET requests, and creates no accounts or data.
const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : null;
};
const client = (flag('--client') || '').replace(/\/+$/, '');
const api = (args[0] || '').replace(/\/+$/, '');

if (!/^https?:\/\//.test(api)) {
    console.error('Usage: npm run smoke -- <api-url> [--client <website-url>]');
    process.exit(2);
}

const results = [];
const check = async (name, fn) => {
    try {
        const note = await fn();
        results.push({ ok: true, name, note });
        console.log(`✓ ${name}${note ? `  (${note})` : ''}`);
    } catch (err) {
        results.push({ ok: false, name });
        console.log(`✗ ${name}\n    → ${err.message}`);
    }
};
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const get = (url, opts = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120000), ...opts });

(async () => {
    console.log(`API:     ${api}${client ? `\nWebsite: ${client}` : ''}\n`);

    await check('API is up (first request may take a minute while it wakes)', async () => {
        const started = Date.now();
        const res = await get(`${api}/api/health`);
        expect(res.ok, `GET /api/health returned ${res.status}. Is this the latest code?`);
        const body = await res.json();
        expect(body.db, 'Connected, but MongoDB is not: check MONGO_URI and Atlas → Network Access (0.0.0.0/0)');
        return `${((Date.now() - started) / 1000).toFixed(1)}s, ${body.mode} mode, up ${body.uptime}s`;
    });

    await check('Live connection endpoint (Socket.IO) answers', async () => {
        const res = await get(`${api}/socket.io/?EIO=4&transport=polling`);
        expect(res.ok, `returned ${res.status}`);
    });

    await check('Published apps are served under /apps/', async () => {
        const res = await get(`${api}/apps/smoke-test-does-not-exist/`, { headers: { accept: 'text/html' } });
        expect(res.status === 404 && /Nothing is deployed here/.test(await res.text()), `expected the "Nothing is deployed here" page, got ${res.status}`);
    });

    await check('Streamlit runtime page has the right headers', async () => {
        const res = await get(`${api}/runtime/stlite.html`);
        expect(res.ok, `returned ${res.status}`);
        expect(res.headers.get('cross-origin-embedder-policy') === 'credentialless', 'missing Cross-Origin-Embedder-Policy');
    });

    await check('Google sign-in sends people back to the deployed server, not localhost', async () => {
        const res = await get(`${api}/api/auth/google/login`, client ? { headers: { referer: `${client}/` } } : {});
        if (res.status === 500) throw new Error('Auth0 isn\'t configured (AUTH0_DOMAIN / AUTH0_CLIENT_ID)');
        const location = res.headers.get('location') || '';
        const redirect = decodeURIComponent((location.match(/redirect_uri=([^&]+)/) || [])[1] || '');
        expect(redirect, `expected a redirect to Auth0, got ${res.status}`);
        expect(!/localhost|127\.0\.0\.1/.test(redirect), `callback is ${redirect}: unset AUTH0_CALLBACK_URL on the server, or set it to ${api}/api/auth/google/callback`);
        if (client) expect(/[?&]state=/.test(location), `${client} is not an allowed origin: set CLIENT_URL=${client} on the server`);
        return `callback ${redirect}; add it to Auth0's Allowed Callback URLs`;
    });

    if (client) {
        await check('API accepts requests from the website (CORS)', async () => {
            const res = await get(`${api}/api/health`, { headers: { origin: client } });
            expect(res.headers.get('access-control-allow-origin') === client, `not allowed: set CLIENT_URL=${client} on the server`);
        });

        let html = '';
        await check('Website loads', async () => {
            const res = await get(client);
            expect(res.ok, `returned ${res.status}`);
            html = await res.text();
        });

        await check('Website is cross-origin isolated (needed to run code in the browser)', async () => {
            const res = await get(client);
            expect(res.headers.get('cross-origin-opener-policy') === 'same-origin', 'missing Cross-Origin-Opener-Policy: same-origin (see client/vercel.json)');
            expect(res.headers.get('cross-origin-embedder-policy') === 'credentialless', 'missing Cross-Origin-Embedder-Policy: credentialless (see client/vercel.json)');
        });

        await check('Website was built for this API (VITE_SERVER_URL)', async () => {
            const origin = new URL(api).origin;
            expect(html.includes(origin), `the page's security policy doesn't mention ${origin}: set VITE_SERVER_URL=${api} on Vercel and redeploy`);
        });
    }

    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
})();
