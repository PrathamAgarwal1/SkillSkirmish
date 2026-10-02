// utils/projectRunner.js — runs projects, files and terminal commands inside the sandbox.
//
// Nothing here executes user code on the host: every process is a sandbox exec (see sandbox/).
// Output is broadcast to the project's socket room (`project:<id>`), which every open IDE joins.
const path = require('path');
const http = require('http');
const Project = require('../models/Project');
const sandbox = require('../sandbox');
const { detectRunConfig, needsInstall, markInstalled, listFiles } = require('../sandbox/runConfig');
const { browserPlan } = require('../sandbox/browserPlan');
const { reconcileProject } = require('../sandbox/fileSync');
const { getProjectDir, resolveProjectPath, sanitizeRelPath } = require('./access');
const { decryptEnv } = require('./secrets');

const { driver } = sandbox;

// processId -> { projectId, kind: 'run'|'install'|'file'|'cmd', handle, logs, startedAt, userId, target, port }
const processes = new Map();
// projectId -> { phase, target, previewUrl, startedAt, error }
const runState = new Map();

const MAX_LOG_ENTRIES = 1000;
const pushLog = (logs, entry) => {
    logs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
};

const projectRoom = (projectId) => `project:${projectId}`;

const emitter = (io, projectId) => ({
    console: (message, type = 'info') => io && io.to(projectRoom(projectId)).emit('project-console', { projectId: String(projectId), message, type }),
    terminal: (processId, message, type = 'info') => io && io.to(projectRoom(projectId)).emit('terminal-output', { projectId: String(projectId), processId, message, type }),
    event: (name, payload = {}) => io && io.to(projectRoom(projectId)).emit(name, { projectId: String(projectId), ...payload })
});

const setState = (io, projectId, patch) => {
    const id = String(projectId);
    const next = { ...(runState.get(id) || {}), ...patch };
    runState.set(id, next);
    emitter(io, id).event('project-status', next);
    return next;
};

/** Environment every sandbox process gets: the app port + the project's own env vars. Never server secrets. */
const buildEnv = async (projectId, project) => {
    const doc = project || await Project.findById(projectId).select('envVars');
    return {
        ...decryptEnv(doc?.envVars),
        PORT: String(driver.appPortInside(projectId) || 3000),
        HOST: '0.0.0.0'
    };
};

const withPort = (cmd, projectId) => cmd.replace(/\$PORT\b/g, String(driver.appPortInside(projectId) || 3000));

/** Loads the project, syncs files both ways and detects how to run it. */
const loadRunConfig = async (projectId, io) => {
    const project = await Project.findById(projectId);
    if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

    const sync = await reconcileProject(projectId);
    if (sync.imported || sync.toDb) emitter(io, projectId).event('files-changed', sync);

    const dir = getProjectDir(projectId);
    return { project, dir, config: detectRunConfig(dir, project.projectType, project.name) };
};

/** Writes the files a project without a package.json needs (sandbox/scaffold.js). Returns their paths. */
const applyScaffold = async (projectId, plan, io) => {
    const { ensureParentFolders, upsertFile } = require('./projectFiles');
    const created = Object.keys(plan.files);
    for (const rel of created) {
        await ensureParentFolders(projectId, rel);
        await upsertFile(projectId, rel, plan.files[rel]);
    }
    emitter(io, projectId).event('files-changed', { created });
    return created;
};

/** "Set up and run": creates the package.json etc., then returns the project's new run config. */
const setupProject = async (projectId, io) => {
    const id = String(projectId);
    const { config } = await loadRunConfig(id, io);
    if (!config.scaffold) return { success: false, message: 'This project is already set up.', config: await getRunConfig(id, io) };
    const created = await applyScaffold(id, config.scaffold, io);
    return { success: true, created, summary: config.scaffold.summary, config: await getRunConfig(id, io) };
};

/** Runs a command to completion inside the workspace, streaming output. Resolves with the exit code. */
const execToCompletion = (projectId, execId, cmd, { cwd = '', env, onLine }) => new Promise((resolve) => {
    driver.exec({
        projectId, execId, cmd, cwd, env,
        onData: (chunk) => chunk.split(/\r?\n/).filter(l => l.trim()).forEach(l => onLine(l)),
        onExit: (code) => resolve(code)
    });
});

/** Starts the sandbox (if needed) and installs dependencies whose manifests changed. */
const prepareWorkspace = async (projectId, io, { config, dir, env }) => {
    const out = emitter(io, projectId);
    await driver.ensureWorkspace(String(projectId), config.env, dir, (line) => out.console(line, 'info'));
    sandbox.touch(projectId);

    for (const [i, step] of config.install.entries()) {
        if (!needsInstall(dir, step)) continue;
        const where = step.dir || 'project root';
        // A broken package.json makes npm print a wall of errors: point at the exact spot instead
        const manifest = path.join(dir, step.dir || '', 'package.json');
        if (step.cmd.startsWith('npm ')) {
            try {
                JSON.parse(require('fs').readFileSync(manifest, 'utf8'));
            } catch (err) {
                if (err instanceof SyntaxError) {
                    out.console(`❌ ${step.dir ? step.dir + '/' : ''}package.json has a syntax error: ${err.message}. Fix it in the editor and run again.`, 'error');
                    return false;
                }
            }
        }
        out.console(`📦 Installing dependencies in ${where}: ${step.cmd}`, 'info');
        setState(io, projectId, { phase: 'installing' });
        const code = await execToCompletion(String(projectId), `install-${i}-${Date.now()}`, step.cmd, {
            cwd: step.dir, env, onLine: (l) => out.console(l, 'info')
        });
        if (code !== 0) {
            out.console(`❌ Dependency install failed in ${where} (exit ${code}). Fix the manifest and run again.`, 'error');
            return false;
        }
        markInstalled(dir, step);
        out.console(`✅ Dependencies ready in ${where}`, 'success');
    }
    return true;
};

/** Resolves once the app answers HTTP (any status), or false after `timeoutMs`. */
const waitForHttp = (getPort, timeoutMs = 180000) => new Promise((resolve) => {
    const started = Date.now();
    const attempt = () => {
        const port = getPort();
        if (!port) return retry();
        const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 3000 }, (res) => {
            res.resume();
            resolve(true);
        });
        req.on('timeout', () => req.destroy());
        req.on('error', retry);
    };
    const retry = () => (Date.now() - started > timeoutMs ? resolve(false) : setTimeout(attempt, 1500));
    attempt();
});

/* ---------------------------------------------------------
   RUN PROJECT (dev server / Jupyter / Streamlit / script)
--------------------------------------------------------- */
const runProject = async (projectId, { targetId, userId, io } = {}) => {
    const id = String(projectId);
    if (processes.has(`run-${id}`)) {
        return { success: false, message: 'Project is already running. Stop it first.' };
    }
    const out = emitter(io, id);

    try {
        setState(io, id, { phase: 'preparing', target: null, previewUrl: null, error: null, startedAt: Date.now() });
        let { project, dir, config } = await loadRunConfig(id, io);
        if (config.scaffold) {
            const created = await applyScaffold(id, config.scaffold, io);
            out.console(`🧰 Set up the project: created ${created.join(', ')}`, 'success');
            ({ project, dir, config } = await loadRunConfig(id, io));
        }

        if (config.targets.length === 0) {
            setState(io, id, { phase: 'stopped' });
            return { success: false, message: 'Nothing to run yet — add some code first.' };
        }
        const target = config.targets.find(t => t.id === targetId) || config.targets[0];

        out.console(`📋 ${config.label} · environment: ${sandbox.config.ENVIRONMENTS[config.env].label}`, 'info');
        const env = await buildEnv(id, project);

        if (!(await prepareWorkspace(id, io, { config, dir, env }))) {
            setState(io, id, { phase: 'error', error: 'Dependency install failed' });
            return { success: false, message: 'Dependency install failed — see the console.' };
        }

        const previewUrl = target.preview ? sandbox.config.previewUrl(sandbox.issuePreviewToken(id)) : null;
        const cmd = withPort(target.cmd, id);
        out.console(`🚀 ${target.label}: ${cmd}`, 'info');

        const processId = `run-${id}`;
        const logs = [];
        const handle = driver.exec({
            projectId: id,
            execId: 'run',
            cmd,
            cwd: config.root,
            env,
            onData: (chunk, stream) => {
                sandbox.touch(id);
                for (const line of chunk.split(/\r?\n/)) {
                    if (!line.trim()) continue;
                    // Many dev servers log normal progress to stderr; only flag real errors
                    const type = stream === 'stderr' && /\berror\b|exception|traceback/i.test(line) ? 'error' : 'info';
                    pushLog(logs, { message: line, type, timestamp: Date.now() });
                    out.console(line, type);
                }
            },
            onExit: (code) => {
                processes.delete(processId);
                sandbox.revokePreviewToken(id);
                out.console(code === 0 || code === 137 ? '⏹ Process stopped' : `Process exited with code ${code}`, code === 0 || code === 137 ? 'info' : 'error');
                out.event('project-stopped', { exitCode: code });
                setState(io, id, { phase: 'stopped', previewUrl: null });
            }
        });

        processes.set(processId, { projectId: id, kind: 'run', handle, logs, startedAt: Date.now(), userId, target: target.id });
        setState(io, id, { phase: 'starting', target: target.id, previewUrl });

        if (target.preview) {
            // Tell everyone once the app actually answers
            waitForHttp(() => driver.getHostPort(id)).then((ready) => {
                if (!processes.has(processId)) return;
                if (ready) {
                    out.console(`✅ Live at ${previewUrl}`, 'success');
                    out.event('project-preview-url', { url: previewUrl });
                    setState(io, id, { phase: 'running' });
                } else {
                    out.console('⚠️ The app did not answer on its port within 3 minutes — check the logs above.', 'warning');
                    setState(io, id, { phase: 'running' });
                }
            });
        } else {
            setState(io, id, { phase: 'running' });
        }

        return {
            success: true,
            processId,
            previewUrl,
            target: target.id,
            config: summarizeConfig(config),
            message: `${config.label} starting (${target.label})`
        };
    } catch (err) {
        console.error('Run project error:', err);
        out.console(`❌ Failed to start project: ${err.message}`, 'error');
        setState(io, id, { phase: 'error', error: err.message });
        return { success: false, message: err.message };
    }
};

const stopProject = async (projectId, io) => {
    const id = String(projectId);
    const info = processes.get(`run-${id}`);
    if (!info) {
        setState(io, id, { phase: 'stopped', previewUrl: null });
        return { success: false, message: 'Project is not running' };
    }
    await info.handle.kill();
    return { success: true, message: 'Project stopped' };
};

const getConsoleOutput = (projectId) => {
    const info = processes.get(`run-${projectId}`);
    return { logs: info ? info.logs : [] };
};

const isProjectRunning = (projectId) => processes.has(`run-${projectId}`);

const getProjectStatus = (projectId) => {
    const id = String(projectId);
    const state = runState.get(id) || {};
    return {
        running: isProjectRunning(id),
        phase: isProjectRunning(id) ? (state.phase || 'running') : (state.phase === 'error' ? 'error' : 'stopped'),
        target: state.target || null,
        previewUrl: isProjectRunning(id) ? sandbox.getPreviewUrl(id) : null,
        startedAt: state.startedAt || null,
        error: state.error || null,
        sandbox: { driver: driver.name, isolated: driver.isolated }
    };
};

const summarizeConfig = (config) => ({
    label: config.label,
    env: config.env,
    envLabel: sandbox.config.ENVIRONMENTS[config.env]?.label,
    targets: config.targets.map(({ id, label, preview }) => ({ id, label, preview })),
    deploy: { kind: config.deploy.kind, reason: config.deploy.reason || null }
});

/** How this project will run & deploy (for the IDE toolbar and the deploy panel). */
const getRunConfig = async (projectId, io) => {
    const { config, dir } = await loadRunConfig(projectId, io);
    if (sandbox.getMode() !== 'browser') return { mode: sandbox.getMode(), ...summarizeConfig(config) };

    // Browser mode: the IDE runs the project itself, so it gets the full plan (commands included)
    const plan = browserPlan(config, dir, listFiles(dir));
    return {
        mode: 'browser',
        label: config.label,
        env: config.env,
        envLabel: plan.runtime === 'python' ? 'Python in your browser (Pyodide)' : 'Node.js in your browser (WebContainer)',
        targets: plan.targets,
        deploy: plan.deploy,
        plan
    };
};

/* ---------------------------------------------------------
   RUN A SINGLE FILE
--------------------------------------------------------- */
const FILE_RUNNERS = {
    '.js': (f) => `node ${f}`, '.mjs': (f) => `node ${f}`, '.cjs': (f) => `node ${f}`,
    '.ts': (f) => `npx --yes tsx ${f}`,
    '.py': (f) => `python3 ${f}`,
    '.sh': (f) => `sh ${f}`
};

const runFile = async (projectId, rawFilePath, userId, io) => {
    const id = String(projectId);
    const out = emitter(io, id);
    try {
        const filePath = sanitizeRelPath(rawFilePath);
        if (!filePath) return { success: false, message: 'Invalid file path' };
        resolveProjectPath(id, filePath);

        const ext = path.extname(filePath).toLowerCase();
        const runner = FILE_RUNNERS[ext];
        if (!runner) {
            return { success: false, message: `Can't run ${ext || 'this'} files directly — use ▶ Run Project for web apps.` };
        }

        const { project, dir, config } = await loadRunConfig(id, io);
        if (ext === '.js' && config.env !== 'node') {
            return { success: false, message: 'This project uses a Python environment — JavaScript files cannot run here.' };
        }
        const env = await buildEnv(id, project);
        if (!(await prepareWorkspace(id, io, { config, dir, env }))) {
            return { success: false, message: 'Dependency install failed — see the console.' };
        }

        const processId = `file-${id}-${Date.now()}`;
        const quoted = `'${filePath.replace(/'/g, `'\\''`)}'`;
        const logs = [];
        const handle = driver.exec({
            projectId: id,
            execId: processId,
            cmd: runner(quoted),
            env,
            onData: (chunk, stream) => {
                pushLog(logs, { message: chunk, type: stream === 'stderr' ? 'error' : 'info', timestamp: Date.now() });
                out.terminal(processId, chunk, stream === 'stderr' ? 'error' : 'info');
            },
            onExit: (code) => {
                processes.delete(processId);
                out.terminal(processId, `\nProcess exited with code ${code}`, code === 0 ? 'success' : 'error');
                out.event('file-process-ended', { processId, exitCode: code });
            }
        });
        processes.set(processId, { projectId: id, kind: 'file', handle, logs, startedAt: Date.now(), userId });
        return { success: true, processId, message: `Running ${filePath}...` };
    } catch (err) {
        console.error('Run file error:', err);
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   TERMINAL COMMANDS
--------------------------------------------------------- */
const executeCommand = async (projectId, command, io, subDir = '', userId) => {
    const id = String(projectId);
    const out = emitter(io, id);

    let cwd = '';
    if (subDir) {
        const clean = sanitizeRelPath(subDir);
        if (!clean) return { success: false, output: 'Cannot run commands outside the project root', exitCode: 1 };
        cwd = clean;
    }

    let prepared;
    try {
        prepared = await loadRunConfig(id, io);
        await driver.ensureWorkspace(id, prepared.config.env, prepared.dir, (line) => out.console(line, 'info'));
    } catch (err) {
        return { success: false, output: err.message, exitCode: 1 };
    }
    sandbox.touch(id);
    const env = await buildEnv(id, prepared.project);

    return new Promise((resolve) => {
        const processId = `cmd-${id}-${Date.now()}`;
        let output = '';
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        const handle = driver.exec({
            projectId: id,
            execId: processId,
            cmd: command,
            cwd,
            env,
            onData: (chunk) => {
                if (output.length < 200000) output += chunk;
                if (settled) out.terminal(processId, chunk, 'info'); // streamed once the HTTP call returned
            },
            onExit: async (code) => {
                processes.delete(processId);
                out.event('file-process-ended', { processId, exitCode: code });
                // Commands like `git clone`, `npm init` or `touch` create files — show them in the explorer
                try {
                    const sync = await reconcileProject(id);
                    if (sync.imported || sync.toDb) out.event('files-changed', sync);
                } catch { /* best effort */ }
                finish({ success: code === 0, output, exitCode: code });
            }
        });
        processes.set(processId, { projectId: id, kind: 'cmd', handle, logs: [], startedAt: Date.now(), userId });

        // Long-running commands (servers, watchers) keep streaming to the terminal after 3s
        setTimeout(() => finish({
            success: true,
            processId,
            output: `${output}\n[still running in the background — output continues below; use Stop to end it]\n`,
            exitCode: 0
        }), 3000);
    });
};

const getProcessInfo = (processId) => processes.get(String(processId)) || null;

const writeToProcess = (processId, input) => {
    const info = processes.get(processId);
    if (!info) return { success: false, message: 'Process not running' };
    info.handle.write(`${String(input ?? '')}\n`);
    return { success: true };
};

const stopProcess = async (processId) => {
    const info = processes.get(processId);
    if (!info) return { success: false, message: 'Process not running' };
    await info.handle.kill();
    processes.delete(processId);
    return { success: true, message: 'Process stopped' };
};

/** Installs one package inside the sandbox (npm or pip depending on the environment). */
const installPackage = async (projectId, packageName, io) => {
    const id = String(projectId);
    const { project, dir, config } = await loadRunConfig(id, io);
    await driver.ensureWorkspace(id, config.env, dir);
    const cmd = config.env === 'node'
        ? `npm install --no-audit --no-fund --save '${packageName}'`
        : `pip install --user --no-warn-script-location '${packageName}'`;
    const out = emitter(io, id);
    out.console(`📦 ${cmd}`, 'info');
    const code = await execToCompletion(id, `pkg-${Date.now()}`, cmd, {
        cwd: config.env === 'node' ? config.root : '',
        env: await buildEnv(id, project),
        onLine: (l) => out.console(l, 'info')
    });
    if (config.env !== 'node' && code === 0) {
        // Remember it so deploys and teammates get it too
        const reqPath = path.join(dir, 'requirements.txt');
        const fs = require('fs');
        const current = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, 'utf8') : '';
        if (!current.split('\n').some(l => l.trim().split(/[=<>~!]/)[0] === packageName.split(/[=<>~!]/)[0])) {
            fs.writeFileSync(reqPath, `${current.trimEnd()}${current.trim() ? '\n' : ''}${packageName}\n`);
        }
    }
    const sync = await reconcileProject(id);
    if (sync.imported || sync.toDb) out.event('files-changed', sync);
    return code === 0
        ? { success: true, message: `✓ ${packageName} installed` }
        : { success: false, message: `Failed to install ${packageName} (exit ${code})` };
};

/** Syncs files both ways on request (e.g. after editing a notebook in JupyterLab). */
const syncFiles = async (projectId, io) => {
    const sync = await reconcileProject(String(projectId));
    if (sync.imported || sync.toDb) emitter(io, projectId).event('files-changed', sync);
    return sync;
};

/** Kills everything for a project and removes its workspace (project/room deletion). */
const stopAllForProject = async (projectId) => {
    const id = String(projectId);
    for (const [processId, info] of processes.entries()) {
        if (info.projectId === id) {
            try { await info.handle.kill(); } catch { /* already gone */ }
            processes.delete(processId);
        }
    }
    sandbox.revokePreviewToken(id);
    runState.delete(id);
    try { await driver.removeWorkspace(id); } catch { /* not running */ }
};

// When the idle reaper stops a workspace, forget its processes
sandbox.setIdleHandler(async (projectId) => {
    for (const [processId, info] of processes.entries()) {
        if (info.projectId === projectId) processes.delete(processId);
    }
    runState.set(projectId, { phase: 'stopped', previewUrl: null });
});

module.exports = {
    runProject,
    setupProject,
    stopProject,
    runFile,
    writeToProcess,
    stopProcess,
    getConsoleOutput,
    isProjectRunning,
    getProjectStatus,
    getRunConfig,
    getProcessInfo,
    installPackage,
    syncFiles,
    stopAllForProject,
    executeCommand,
    buildEnv
};
