// sandbox/localDriver.js — NOT a sandbox. Runs project code directly on the host.
//
// Only for local development on machines without Docker, and only when explicitly enabled with
// SANDBOX_DRIVER=local. It still scrubs the environment so server secrets (JWT_SECRET, MONGO_URI,
// API keys) never reach user code, but it cannot stop code from touching the host.
const { spawn } = require('child_process');
const net = require('net');
const kill = require('tree-kill');

const children = new Map(); // `${projectId}:${execId}` -> child
const ports = new Map();    // projectId or app name -> port
const apps = new Map();     // app name -> child

// Only what a shell and toolchains need to work; nothing from the server's own configuration.
const SAFE_ENV_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramData', 'LANG', 'SHELL', 'USER'];
const safeEnv = (extra = {}) => {
    const env = {};
    for (const k of SAFE_ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
    return { ...env, ...extra };
};

const freePort = () => new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address();
        srv.close(() => resolve(port));
    });
    srv.on('error', reject);
});

const projectDirs = new Map();

const ensureWorkspace = async (projectId, envId, projectDir) => {
    projectDirs.set(String(projectId), projectDir);
    if (!ports.has(String(projectId))) ports.set(String(projectId), await freePort());
    return ports.get(String(projectId));
};

const exec = ({ projectId, execId, cmd, cwd = '', env = {}, onData, onExit }) => {
    const base = projectDirs.get(String(projectId));
    const child = spawn(cmd, {
        cwd: cwd ? require('path').join(base, cwd) : base,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: safeEnv(env),
        windowsHide: true
    });
    const key = `${projectId}:${execId}`;
    children.set(key, child);
    child.stdout.on('data', (d) => onData && onData(d.toString(), 'stdout'));
    child.stderr.on('data', (d) => onData && onData(d.toString(), 'stderr'));
    child.on('error', (err) => { children.delete(key); onData && onData(`${err.message}\n`, 'stderr'); onExit && onExit(-1); });
    child.on('close', (code) => { children.delete(key); onExit && onExit(code); });
    return {
        write: (input) => child.stdin.writable && child.stdin.write(input),
        kill: () => killExec(projectId, execId)
    };
};

const killExec = async (projectId, execId) => {
    const child = children.get(`${projectId}:${execId}`);
    if (child) kill(child.pid, 'SIGKILL');
};

const runBuild = ({ dir, cmd, env = {}, onData }) => new Promise((resolve) => {
    const child = spawn(cmd, { cwd: dir, shell: true, env: safeEnv(env), windowsHide: true });
    child.stdout.on('data', (d) => onData && onData(d.toString()));
    child.stderr.on('data', (d) => onData && onData(d.toString()));
    child.on('error', (err) => { onData && onData(err.message); resolve(-1); });
    child.on('close', (code) => resolve(code));
});

const startApp = async ({ name, dir, cmd, env = {} }) => {
    await stopApp(name);
    const port = await freePort();
    const child = spawn(cmd, { cwd: dir, shell: true, env: safeEnv({ ...env, PORT: String(port) }), windowsHide: true });
    apps.set(name, child);
    ports.set(name, port);
    child.on('close', () => { apps.delete(name); });
    return port;
};

const stopApp = async (name) => {
    const child = apps.get(name);
    if (child) kill(child.pid, 'SIGKILL');
    apps.delete(name);
    ports.delete(name);
};

module.exports = {
    name: 'local',
    isolated: false,
    // Locally every project needs its own real port
    appPortInside: (projectId) => ports.get(String(projectId)),
    isAvailable: async () => true,
    ensureImage: async () => null,
    ensureWorkspace,
    exec,
    killExec,
    getHostPort: (projectId) => ports.get(String(projectId)) || null,
    stopWorkspace: async () => {},
    removeWorkspace: async (projectId) => { ports.delete(String(projectId)); projectDirs.delete(String(projectId)); },
    cleanupStaleWorkspaces: async () => {},
    runBuild,
    startApp,
    stopApp,
    getAppPort: async (name) => (apps.has(name) ? ports.get(name) : null),
    appLogs: async () => ''
};
