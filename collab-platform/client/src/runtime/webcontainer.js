// runtime/webcontainer.js — runs JavaScript projects in the user's browser with WebContainers
// (a real Node.js + npm inside the tab, by StackBlitz). Used when the server has no Docker sandbox.
//
// One WebContainer per page. The project's files are mounted from the server, editor saves are
// written straight into it, and files created inside it (npm init, generators...) are synced back.
// Note: WebContainers are free for personal, open-source and non-commercial use; a commercial
// product needs a license from StackBlitz.
import { WebContainer } from '@webcontainer/api';
import axios from 'axios';
import { BRIDGE_JS } from './bridge';

// Folders that are never synced back to the project (installs, caches, build output)
const SKIP_DIRS = ['node_modules', '.git', '.next', '.expo', '.cache', '.vite', 'dist', 'build', 'out', '.turbo', '.parcel-cache'];
const MAX_SYNC_BYTES = 512 * 1024;

let bootPromise = null;
let mountedProjectId = null;
let mountGeneration = 0;      // bumps whenever the workdir is wiped for another project
let synced = new Map();       // path -> content last known to match the server
let installStamps = new Map(); // dir -> package.json + lockfile contents at last install

/** Identifies the current contents of the workdir (project + mount), e.g. to restore .git once per mount. */
export const mountKey = () => `${mountedProjectId}:${mountGeneration}`;

export const isSupported = () => typeof window !== 'undefined' && window.crossOriginIsolated === true;

export const unsupportedReason = () => (isSupported() ? null
    : 'Running code in the browser needs a recent Chrome, Edge or Firefox (Safari is not supported yet).');

export const boot = () => {
    if (!bootPromise) {
        bootPromise = WebContainer.boot({ coep: 'credentialless', workdirName: 'project' })
            .then(async (wc) => {
                // Console output, navigation and back/forward in the IDE's browser window
                await wc.setPreviewScript(BRIDGE_JS).catch(() => {});
                return wc;
            })
            .catch((err) => { bootPromise = null; throw err; });
    }
    return bootPromise;
};

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[()][AB0-2]|\u001b[=>]/g;
// eslint-disable-next-line no-control-regex
const SPINNER = /(?:[\\|/-]\u0008?){3,}|\u0008/g; // npm's progress spinner
export const stripAnsi = (s) => s.replace(ANSI, '').replace(SPINNER, '');

/** Splits a stream of terminal output into lines (handles \r progress redraws). */
const lineSplitter = (onLine) => {
    let buf = '';
    return {
        push(chunk) {
            buf += stripAnsi(chunk);
            const parts = buf.split('\n');
            buf = parts.pop();
            for (const p of parts) {
                const line = p.split('\r').filter(Boolean).pop() || '';
                if (line.trim()) onLine(line);
            }
            // Keep only the latest redraw of the unfinished line (spinners)
            if (buf.includes('\r')) buf = buf.split('\r').filter(Boolean).pop() || '';
        },
        flush() {
            const line = buf.split('\r').filter(Boolean).pop() || '';
            if (line.trim()) onLine(line);
            buf = '';
        }
    };
};

const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

const writeFile = async (wc, path, content) => {
    const dir = dirname(path);
    if (dir) await wc.fs.mkdir(dir, { recursive: true });
    await wc.fs.writeFile(path, content);
};

/** Removes everything in the workdir (switching to another project). */
const clearWorkdir = async (wc) => {
    for (const name of await wc.fs.readdir('.')) {
        await wc.fs.rm(name, { recursive: true, force: true });
    }
};

/**
 * Makes the WebContainer hold the project's current files from the server. Only changed files are
 * rewritten, and node_modules is kept, so this is cheap to call before every run.
 */
export const syncFromServer = async (projectId) => {
    const wc = await boot();
    const { data } = await axios.get(`/api/execute/snapshot/${projectId}`);
    if (mountedProjectId !== projectId) {
        await clearWorkdir(wc);
        synced = new Map();
        installStamps = new Map();
        mountedProjectId = projectId;
        mountGeneration++;
    }
    const incoming = new Map(data.files.map(f => [f.path, f.content]));
    for (const folder of data.folders || []) await wc.fs.mkdir(folder, { recursive: true });
    for (const [path, content] of incoming) {
        if (synced.get(path) !== content) {
            await writeFile(wc, path, content);
            synced.set(path, content);
        }
    }
    // Deleted in the editor since the last sync
    for (const path of [...synced.keys()]) {
        if (!incoming.has(path)) {
            await wc.fs.rm(path, { force: true });
            synced.delete(path);
        }
    }
    return wc;
};

/** Editor save / create: write through immediately so a running dev server hot-reloads. */
export const writeProjectFile = async (projectId, path, content) => {
    if (mountedProjectId !== projectId || !bootPromise) return;
    const wc = await boot();
    await writeFile(wc, path, content);
    synced.set(path, content);
};

export const removeProjectPath = async (projectId, path) => {
    if (mountedProjectId !== projectId || !bootPromise) return;
    const wc = await boot();
    await wc.fs.rm(path, { recursive: true, force: true });
    for (const p of [...synced.keys()]) if (p === path || p.startsWith(`${path}/`)) synced.delete(p);
};

/**
 * Runs a shell command (jsh) in the WebContainer.
 * Returns { exit: Promise<code>, write(input), kill() }.
 */
export const spawn = async (cmd, { cwd = '', env = {}, onLine, onRaw } = {}) => {
    const wc = await boot();
    const proc = await wc.spawn('jsh', ['-c', cmd], {
        cwd: cwd || undefined,
        env: { PORT: '3000', HOST: '0.0.0.0', BROWSER: 'none', FORCE_COLOR: '0', ...env },
        terminal: { cols: 160, rows: 40 }
    });
    const lines = lineSplitter((l) => onLine && onLine(l));
    proc.output.pipeTo(new WritableStream({
        write(chunk) { onRaw && onRaw(chunk); lines.push(chunk); },
        close() { lines.flush(); }
    })).catch(() => {});
    const writer = proc.input.getWriter();
    return {
        exit: proc.exit.then((code) => { lines.flush(); return code; }),
        write: (input) => writer.write(input).catch(() => {}),
        kill: () => proc.kill()
    };
};

const readText = async (wc, path) => {
    try { return await wc.fs.readFile(path, 'utf-8'); } catch { return null; }
};

const hasDir = async (wc, path) => {
    try { await wc.fs.readdir(path); return true; } catch { return false; }
};

/** Runs `npm install` in each package folder whose manifest changed since the last install. */
export const installDependencies = async (steps, { env, onLine } = {}) => {
    const wc = await boot();
    for (const step of steps || []) {
        const dir = step.dir || '';
        const prefix = dir ? `${dir}/` : '';
        if (!(await readText(wc, `${prefix}package.json`))) {
            onLine && onLine(`⚠ No package.json${dir ? ` in ${dir}` : ''}, so there is nothing to install there; skipping.`, 'warning');
            continue;
        }
        const stamp = `${await readText(wc, `${prefix}package.json`)}\n${await readText(wc, `${prefix}package-lock.json`)}`;
        if (installStamps.get(dir) === stamp && await hasDir(wc, `${prefix}node_modules`)) continue;
        onLine && onLine(`📦 Installing dependencies${dir ? ` in ${dir}` : ''} (in your browser)…`, 'info');
        const proc = await spawn(step.cmd, { cwd: dir, env, onLine: (l) => onLine && onLine(l, 'info') });
        const code = await proc.exit;
        if (code !== 0) throw new Error(`npm install failed (exit ${code})`);
        installStamps.set(dir, stamp);
        onLine && onLine(`✅ Dependencies ready${dir ? ` in ${dir}` : ''}`, 'success');
    }
};

/** Listens for dev servers becoming reachable. Returns an unsubscribe function. */
export const onServerReady = async (fn) => {
    const wc = await boot();
    return wc.on('server-ready', (port, url) => fn(port, url));
};

// Walk the WebContainer file system (skipping installs/build output)
const walk = async (wc, dir, out, skip) => {
    let entries;
    try { entries = await wc.fs.readdir(dir || '.', { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        const path = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) {
            if (!skip.includes(e.name)) await walk(wc, path, out, skip);
        } else if (e.isFile()) {
            out.push(path);
        }
    }
};

const isProbablyText = (bytes) => !bytes.subarray(0, 8000).includes(0);

/**
 * Pushes files created/changed inside the WebContainer (terminal commands, generators) back to
 * the project, and removes files deleted there. Returns { uploaded, deleted }.
 */
export const syncToServer = async (projectId) => {
    if (mountedProjectId !== projectId || !bootPromise) return { uploaded: 0, deleted: 0 };
    const wc = await boot();
    const paths = [];
    await walk(wc, '', paths, SKIP_DIRS);
    const changed = [];
    for (const path of paths) {
        const bytes = await wc.fs.readFile(path);
        if (bytes.length > MAX_SYNC_BYTES || !isProbablyText(bytes)) continue;
        const content = new TextDecoder().decode(bytes);
        if (synced.get(path) !== content) changed.push({ filePath: path, content });
    }
    const present = new Set(paths);
    const deleted = [...synced.keys()].filter(p => !present.has(p) && !SKIP_DIRS.some(d => p === d || p.startsWith(`${d}/`)));

    if (changed.length) {
        await axios.post('/api/execute/upload-files-json', { projectId, files: changed });
        changed.forEach(f => synced.set(f.filePath, f.content));
    }
    for (const path of deleted) {
        await axios.delete('/api/files/by-path', { data: { filePath: path, projectId } }).catch(() => {});
        synced.delete(path);
    }
    return { uploaded: changed.length, deleted: deleted.length };
};

export const pathExists = async (path) => {
    const wc = await boot();
    return hasDir(wc, path);
};

/** Reads a build output folder: [{ path, bytes }] relative to `dir`. */
export const readFolder = async (dir) => {
    const wc = await boot();
    const paths = [];
    const skip = dir === '.' || dir === '' ? ['node_modules', '.git', '.cache'] : ['node_modules'];
    await walk(wc, dir === '.' ? '' : dir, paths, skip);
    const base = dir === '.' || dir === '' ? '' : `${dir}/`;
    const files = [];
    for (const path of paths) files.push({ path: path.slice(base.length), bytes: await wc.fs.readFile(path) });
    return files;
};
