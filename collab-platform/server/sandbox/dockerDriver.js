// sandbox/dockerDriver.js — runs all user code inside Docker containers.
//
// One long-lived "workspace" container per project (project folder bind-mounted at /workspace).
// Every command, file run and dev server is a `docker exec` into it, wrapped in its own process
// group so it can be killed reliably. Deploy builds use throwaway containers, and deployed server
// apps run in their own restart-on-failure containers.
const { spawn } = require('child_process');
const path = require('path');
const { ENVIRONMENTS, APP_PORT, LIMITS, IMAGES_DIR, NETWORK } = require('./config');

const WORKSPACE_PREFIX = 'ss-ws-';
const isLinuxHost = process.platform === 'linux';

/** Runs a docker CLI command (no shell) and collects its output. */
const docker = (args, { timeoutMs = 120000, onData } = {}) => new Promise((resolve) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; onData && onData(d.toString(), 'stdout'); });
    child.stderr.on('data', (d) => { stderr += d; onData && onData(d.toString(), 'stderr'); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }); });
});

// Flags every sandbox container gets: resource limits, no Linux capabilities, no privilege escalation.
const hardeningFlags = ({ memory = LIMITS.memory, cpus = LIMITS.cpus } = {}) => {
    const flags = [
        '--memory', memory, '--memory-swap', memory,
        '--cpus', String(cpus),
        '--pids-limit', String(LIMITS.pids),
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--init',
        // Own bridge network with inter-container traffic disabled: sandboxes can reach the
        // internet (npm/pip/Kaggle) but not each other or other users' deployed apps.
        '--network', NETWORK
    ];
    // Never root inside the sandbox. On a Linux VPS use the API's own uid so files written to the
    // bind mount stay owned by it; Docker Desktop (Windows/macOS) maps ownership itself.
    const user = isLinuxHost && typeof process.getuid === 'function' && process.getuid() !== 0
        ? `${process.getuid()}:${process.getgid()}`
        : '1000:1000';
    flags.push('--user', user);
    return flags;
};

const envFlags = (env = {}) => Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);

const workspaceName = (projectId) => `${WORKSPACE_PREFIX}${projectId}`;

const imageReady = new Set();

/** Builds the environment image if it isn't present yet (first run can take a few minutes). */
const ensureImage = async (envId, onLog = () => {}) => {
    const env = ENVIRONMENTS[envId];
    if (!env) throw new Error(`Unknown environment "${envId}"`);
    if (imageReady.has(env.image)) return env.image;

    const inspect = await docker(['image', 'inspect', env.image], { timeoutMs: 20000 });
    if (inspect.code !== 0) {
        onLog(`🐳 Building the ${env.label} environment image (first time only, this can take several minutes)...`);
        const build = await docker(['build', '-t', env.image, path.join(IMAGES_DIR, env.dockerfile)], {
            timeoutMs: 45 * 60 * 1000,
            onData: (chunk) => {
                const line = chunk.trim().split('\n').pop();
                if (line) onLog(line.slice(0, 200));
            }
        });
        if (build.code !== 0) throw new Error(`Could not build environment image ${env.image}: ${build.stderr.slice(-500)}`);
    }
    imageReady.add(env.image);
    return env.image;
};

const inspectContainer = async (name) => {
    const r = await docker(['inspect', '-f', '{{.State.Running}}|{{index .Config.Labels "ss.env"}}', name], { timeoutMs: 20000 });
    if (r.code !== 0) return null;
    const [running, envId] = r.stdout.split('|');
    return { running: running === 'true', envId };
};

const hostPortOf = async (name, containerPort = APP_PORT) => {
    const r = await docker(['port', name, `${containerPort}/tcp`], { timeoutMs: 20000 });
    if (r.code !== 0 || !r.stdout) return null;
    const match = r.stdout.split('\n')[0].match(/:(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
};

/** Exec'd processes we started: `${projectId}:${execId}` -> child (the local `docker exec` client) */
const execs = new Map();
const hostPorts = new Map(); // projectId -> host port of the workspace's APP_PORT

const countRunningWorkspaces = async () => {
    const r = await docker(['ps', '-q', '--filter', 'label=ss.kind=workspace'], { timeoutMs: 20000 });
    return r.code === 0 && r.stdout ? r.stdout.split('\n').length : 0;
};

/**
 * Makes sure the project's workspace container exists, runs the right environment and is started.
 * Returns the host port its app port is published on.
 */
const ensureWorkspace = async (projectId, envId, projectDir, onLog = () => {}) => {
    const name = workspaceName(projectId);
    const image = await ensureImage(envId, onLog);
    const state = await inspectContainer(name);

    if (state && state.envId !== envId) {
        onLog(`🔁 Switching sandbox environment to ${ENVIRONMENTS[envId].label}...`);
        await removeWorkspace(projectId);
    } else if (state && state.running) {
        if (!hostPorts.has(projectId)) hostPorts.set(projectId, await hostPortOf(name));
        return hostPorts.get(projectId);
    }

    if (await countRunningWorkspaces() >= LIMITS.maxWorkspaces) {
        throw new Error('The sandbox is at capacity right now. Please try again in a few minutes.');
    }

    if (state && !state.running) {
        const start = await docker(['start', name]);
        if (start.code !== 0) throw new Error(`Could not start sandbox: ${start.stderr}`);
    } else if (!state || state.envId !== envId) {
        onLog(`🐳 Starting ${ENVIRONMENTS[envId].label} sandbox...`);
        const run = await docker([
            'run', '-d', '--name', name,
            '--label', 'ss.kind=workspace', '--label', `ss.project=${projectId}`, '--label', `ss.env=${envId}`,
            ...hardeningFlags(),
            '--mount', `type=bind,src=${projectDir},dst=/workspace`,
            '-w', '/workspace',
            '-p', `127.0.0.1::${APP_PORT}`,
            image, 'sleep', 'infinity'
        ]);
        if (run.code !== 0) throw new Error(`Could not start sandbox: ${run.stderr}`);
    }

    const port = await hostPortOf(name);
    hostPorts.set(projectId, port);
    return port;
};

/**
 * Runs `cmd` with sh inside the workspace. The command gets its own session/process group
 * (setsid) and records its pid, so killExec can stop it and everything it spawned.
 */
const exec = ({ projectId, execId, cmd, cwd = '', env = {}, onData, onExit }) => {
    const name = workspaceName(projectId);
    const workdir = path.posix.join('/workspace', cwd || '');
    const wrapper = `echo $$ > /tmp/ss-exec-${execId}.pid; exec sh -c "$1"`;
    const child = spawn('docker', [
        'exec', '-i', '-w', workdir, ...envFlags(env), name,
        // -w: `docker exec` makes us a process-group leader, so setsid forks — without --wait the
        // parent returns immediately and the real command keeps running untracked.
        'setsid', '-w', 'sh', '-c', wrapper, 'ss', cmd
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const key = `${projectId}:${execId}`;
    execs.set(key, child);
    child.stdout.on('data', (d) => onData && onData(d.toString(), 'stdout'));
    child.stderr.on('data', (d) => onData && onData(d.toString(), 'stderr'));
    child.on('error', (err) => { execs.delete(key); onData && onData(`${err.message}\n`, 'stderr'); onExit && onExit(-1); });
    child.on('close', (code) => { execs.delete(key); onExit && onExit(code); });

    return {
        write: (input) => child.stdin.writable && child.stdin.write(input),
        kill: () => killExec(projectId, execId)
    };
};

const killExec = async (projectId, execId) => {
    const pidFile = `/tmp/ss-exec-${execId}.pid`;
    await docker(['exec', workspaceName(projectId), 'sh', '-c',
        `p=$(cat ${pidFile} 2>/dev/null) && kill -KILL -- -$p 2>/dev/null; rm -f ${pidFile}`], { timeoutMs: 15000 });
    const child = execs.get(`${projectId}:${execId}`);
    if (child) child.kill('SIGKILL');
};

const getHostPort = (projectId) => hostPorts.get(String(projectId)) || null;

const stopWorkspace = async (projectId) => {
    hostPorts.delete(String(projectId));
    await docker(['stop', '-t', '2', workspaceName(projectId)], { timeoutMs: 30000 });
};

const removeWorkspace = async (projectId) => {
    hostPorts.delete(String(projectId));
    await docker(['rm', '-f', workspaceName(projectId)], { timeoutMs: 30000 });
};

/** Removes leftover workspaces from a previous server run (their processes are no longer tracked). */
const cleanupStaleWorkspaces = async () => {
    const r = await docker(['ps', '-aq', '--filter', 'label=ss.kind=workspace'], { timeoutMs: 30000 });
    if (r.code === 0 && r.stdout) {
        await docker(['rm', '-f', ...r.stdout.split('\n')], { timeoutMs: 60000 });
    }
};

/** Throwaway container for deploy builds. Resolves with the exit code. */
const runBuild = async ({ name, envId, dir, cmd, env = {}, onData, timeoutMs = LIMITS.buildTimeoutMs }) => {
    const image = await ensureImage(envId, (line) => onData && onData(`${line}\n`));
    const r = await docker([
        'run', '--rm', '--name', name, '--label', 'ss.kind=build',
        ...hardeningFlags(),
        '--mount', `type=bind,src=${dir},dst=/workspace`, '-w', '/workspace',
        ...envFlags(env),
        image, 'sh', '-c', cmd
    ], { timeoutMs, onData });
    if (r.code === null || r.code < 0) {
        // The docker client was killed (build timeout) — the container itself is still running
        await docker(['rm', '-f', name], { timeoutMs: 20000 });
        onData && onData(`\nBuild timed out after ${Math.round(timeoutMs / 1000)}s\n`);
        return 124;
    }
    return r.code;
};

/** Starts a deployed server app in its own long-lived container. Returns its host port. */
const startApp = async ({ name, envId, dir, cmd, env = {}, labels = {} }) => {
    const image = await ensureImage(envId);
    await docker(['rm', '-f', name], { timeoutMs: 30000 });
    const r = await docker([
        'run', '-d', '--name', name, '--restart', 'unless-stopped',
        '--label', 'ss.kind=app', ...Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
        ...hardeningFlags({ memory: LIMITS.appMemory, cpus: LIMITS.appCpus }),
        '--mount', `type=bind,src=${dir},dst=/workspace`, '-w', '/workspace',
        '-p', `127.0.0.1::${APP_PORT}`,
        ...envFlags(env),
        image, 'sh', '-c', cmd
    ]);
    if (r.code !== 0) throw new Error(`Could not start app container: ${r.stderr}`);
    return hostPortOf(name);
};

const stopApp = (name) => docker(['rm', '-f', name], { timeoutMs: 30000 });

const getAppPort = async (name) => {
    const state = await inspectContainer(name);
    return state && state.running ? hostPortOf(name) : null;
};

const appLogs = async (name, tail = 200) => {
    const r = await docker(['logs', '--tail', String(tail), name], { timeoutMs: 20000 });
    return `${r.stdout}\n${r.stderr}`.trim();
};

const ensureNetwork = async () => {
    if ((await docker(['network', 'inspect', NETWORK], { timeoutMs: 20000 })).code === 0) return;
    const r = await docker(['network', 'create', '--driver', 'bridge',
        '-o', 'com.docker.network.bridge.enable_icc=false',
        // fixed interface name so host firewall rules can target it (see DEPLOYMENT.md)
        '-o', `com.docker.network.bridge.name=${NETWORK.slice(0, 12)}0`, '--label', 'ss.kind=network', NETWORK], { timeoutMs: 30000 });
    if (r.code !== 0 && !/already exists/.test(r.stderr)) throw new Error(`Could not create sandbox network: ${r.stderr}`);
};

/** True when Docker is reachable; also creates the sandbox network on first use. */
const isAvailable = async () => {
    if ((await docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15000 })).code !== 0) return false;
    await ensureNetwork();
    return true;
};

module.exports = {
    name: 'docker',
    isolated: true,
    appPortInside: () => APP_PORT,
    isAvailable,
    ensureImage,
    ensureWorkspace,
    exec,
    killExec,
    getHostPort,
    stopWorkspace,
    removeWorkspace,
    cleanupStaleWorkspaces,
    runBuild,
    startApp,
    stopApp,
    getAppPort,
    appLogs
};
