// utils/origins.js — the website origins allowed to use this API (CORS) and to receive
// sign-in redirects. Set CLIENT_URL to your deployed site (e.g. https://your-app.vercel.app).
const trim = (url) => String(url || '').trim().replace(/\/+$/, '');

const allowedOrigins = () => [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://PrathamAgarwal1.github.io',
    'https://prathamagarwal1.github.io',
    'https://skill-skirmish.vercel.app',
    trim(process.env.CLIENT_URL),
    trim(process.env.FRONTEND_URL)
].filter(Boolean);

const isAllowedOrigin = (origin) => !!origin && allowedOrigins().includes(trim(origin));

/** "https://site.app/#/register" -> "https://site.app" (or null) */
const originOf = (url) => {
    try { return new URL(url).origin; } catch { return null; }
};

module.exports = { allowedOrigins, isAllowedOrigin, originOf };
