// sandbox/index.js — picks the execution driver and manages preview tokens + idle shutdown.
const crypto = require('crypto');
const config = require('./config');

// Execution mode:
//   docker  — code runs on this server in Docker sandboxes (full features; needs a VPS)
//   local   — code runs directly on this machine, UNSANDBOXED (local development only)
//   browser — code runs in each user's own browser (WebContainers for JS, Pyodide for Python);
//             the server only stores files and static deploys. Works on free hosts without Docker
//             (Render, Railway...). Chosen with SANDBOX_DRIVER=browser, or automatically when
//             Docker isn't reachable at startup.
let mode = ['local', 'browser'].includes(config.DRIVER) ? config.DRIVER : 'docker';
const getMode = () => mode;
const useBrowserMode = () => { mode = 'browser'; };

let driver;
if (config.DRIVER === 'local') {
    console.warn('⚠️  [sandbox] SANDBOX_DRIVER=local — project code runs UNSANDBOXED on this machine. Never use this in production.');
    driver = require('./localDriver');
} else {
    driver = require('./dockerDriver');
}

// ── Preview tokens ──────────────────────────────────────────
// A preview URL is https://<token>.preview.<domain>/ — the token is an unguessable capability
// that maps to one project's sandbox. It changes every time the project is started.
const previewTokens = new Map();   // token -> projectId
const projectTokens = new Map();   // projectId -> token

const issuePreviewToken = (projectId) => {
    const id = String(projectId);
    const old = projectTokens.get(id);
    if (old) previewTokens.delete(old);
    const token = `p${crypto.randomBytes(9).toString('hex')}`;
    previewTokens.set(token, id);
    projectTokens.set(id, token);
    return token;
};

const revokePreviewToken = (projectId) => {
    const token = projectTokens.get(String(projectId));
    if (token) previewTokens.delete(token);
    projectTokens.delete(String(projectId));
};

const getPreviewUrl = (projectId) => {
    const token = projectTokens.get(String(projectId));
    return token ? config.previewUrl(token) : null;
};

/** token -> { projectId, port } for the preview proxy, or null. */
const resolvePreview = (token) => {
    const projectId = previewTokens.get(token);
    if (!projectId) return null;
    const port = driver.getHostPort(projectId);
    if (!port) return null;
    touch(projectId);
    return { projectId, port };
};

// ── Idle shutdown ───────────────────────────────────────────
// Activity = starting/stopping processes, terminal commands and preview requests. A dev server
// nobody has looked at for SANDBOX_IDLE_MINUTES is stopped along with its workspace.
const lastActivity = new Map(); // projectId -> ms
const touch = (projectId) => lastActivity.set(String(projectId), Date.now());

let onIdleStop = () => {};
const setIdleHandler = (fn) => { onIdleStop = fn; };

setInterval(async () => {
    const idleMs = config.LIMITS.idleMinutes * 60 * 1000;
    const now = Date.now();
    for (const [projectId, last] of lastActivity.entries()) {
        if (now - last < idleMs) continue;
        try {
            await onIdleStop(projectId);
            await driver.stopWorkspace(projectId);
            revokePreviewToken(projectId);
            console.log(`[sandbox] Stopped idle workspace for project ${projectId}`);
        } catch (err) {
            console.error('[sandbox] idle stop failed:', err.message);
        }
        lastActivity.delete(projectId);
    }
}, 60 * 1000).unref();

module.exports = {
    driver,
    getMode,
    useBrowserMode,
    config,
    issuePreviewToken,
    revokePreviewToken,
    getPreviewUrl,
    resolvePreview,
    touch,
    setIdleHandler
};
