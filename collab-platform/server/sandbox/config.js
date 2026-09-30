// sandbox/config.js — environments, limits and public URL settings for sandboxed execution.
const path = require('path');

const SERVER_PORT = parseInt(process.env.PORT || '5000', 10);

/**
 * Execution environments. Each one is a Docker image built from sandbox/images/<dockerfile>.
 * Build them with `npm run sandbox:build` (they are also built automatically on first use).
 */
const ENVIRONMENTS = {
    node: {
        id: 'node',
        label: 'Node.js 22',
        image: 'skillskirmish/env-node:1',
        dockerfile: 'node'
    },
    python: {
        id: 'python',
        label: 'Python 3.12',
        image: 'skillskirmish/env-python:1',
        dockerfile: 'python'
    },
    ml: {
        id: 'ml',
        label: 'Python ML (Jupyter · pandas · scikit-learn · PyTorch · Kaggle)',
        image: 'skillskirmish/env-ml:1',
        dockerfile: 'ml'
    }
};

// Every app inside a sandbox listens on this port; it is published to 127.0.0.1 on a random host port.
const APP_PORT = 3000;

const int = (name, fallback) => {
    const v = parseInt(process.env[name] || '', 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};

const LIMITS = {
    memory: process.env.SANDBOX_MEMORY || '1536m',
    cpus: process.env.SANDBOX_CPUS || '1.0',
    pids: int('SANDBOX_PIDS', 1024),
    idleMinutes: int('SANDBOX_IDLE_MINUTES', 30),
    maxWorkspaces: int('SANDBOX_MAX_WORKSPACES', 20),
    appMemory: process.env.DEPLOY_MEMORY || '512m',
    appCpus: process.env.DEPLOY_CPUS || '0.5',
    buildTimeoutMs: int('DEPLOY_BUILD_TIMEOUT_SECONDS', 900) * 1000
};

/**
 * Previews and deployed apps are served on their own origins (subdomains), so apps that load
 * "/assets/..." or open websockets work exactly as they would on a real domain.
 *
 * Dev defaults use *.localhost, which browsers resolve to 127.0.0.1 with no DNS setup.
 * Production example (wildcard DNS + TLS on the VPS):
 *   PREVIEW_URL_TEMPLATE=https://{id}.preview.example.com
 *   APPS_URL_TEMPLATE=https://{id}.apps.example.com
 */
const PREVIEW_URL_TEMPLATE = process.env.PREVIEW_URL_TEMPLATE || `http://{id}.preview.localhost:${SERVER_PORT}`;
const APPS_URL_TEMPLATE = process.env.APPS_URL_TEMPLATE || `http://{id}.apps.localhost:${SERVER_PORT}`;

// "https://{id}.apps.example.com" -> "apps.example.com"
const hostSuffixOf = (template) => new URL(template.replace('{id}', 'x')).hostname.split('.').slice(1).join('.');

const DEPLOY_ROOT = path.resolve(process.env.DEPLOY_DIR || path.join(process.cwd(), 'deployments'));

module.exports = {
    ENVIRONMENTS,
    APP_PORT,
    LIMITS,
    SERVER_PORT,
    PREVIEW_URL_TEMPLATE,
    APPS_URL_TEMPLATE,
    PREVIEW_HOST_SUFFIX: hostSuffixOf(PREVIEW_URL_TEMPLATE),
    APPS_HOST_SUFFIX: hostSuffixOf(APPS_URL_TEMPLATE),
    previewUrl: (token) => `${PREVIEW_URL_TEMPLATE.replace('{id}', token)}/`,
    appUrl: (slug) => `${APPS_URL_TEMPLATE.replace('{id}', slug)}/`,
    DEPLOY_ROOT,
    DRIVER: (process.env.SANDBOX_DRIVER || 'docker').toLowerCase(),
    NETWORK: process.env.SANDBOX_NETWORK || 'ss-sandbox',
    IMAGES_DIR: path.join(__dirname, 'images')
};
