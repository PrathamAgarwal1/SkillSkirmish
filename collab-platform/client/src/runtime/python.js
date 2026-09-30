// runtime/python.js — main-thread side of the in-browser Python runtime (see pyodide.worker.js).
import axios from 'axios';

let worker = null;
let ready = null;
let seq = 0;
const pending = new Map();                  // id -> resolve
const listeners = { stream: new Set(), input: new Set(), status: new Set() };
let stdin = null;                           // { flag, len, data } over a SharedArrayBuffer
let interrupt = null;                       // Uint8Array over a SharedArrayBuffer
let mountedProjectId = null;
let synced = new Map();
let queue = Promise.resolve();              // one Python job at a time

const emit = (kind, payload) => listeners[kind].forEach(fn => fn(payload));

/** Subscribe to 'stream' ({name, text}), 'input' (a prompt is waiting) or 'status' (loading messages). */
export const on = (kind, fn) => {
    listeners[kind].add(fn);
    return () => listeners[kind].delete(fn);
};

const start = () => {
    worker = new Worker(new URL('./pyodide.worker.js', import.meta.url), { type: 'module' });
    const shared = typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;
    let stdinBuffer = null;
    let interruptBuffer = null;
    if (shared) {
        stdinBuffer = new SharedArrayBuffer(8 + 64 * 1024);
        stdin = { flag: new Int32Array(stdinBuffer, 0, 1), len: new Int32Array(stdinBuffer, 4, 1), data: new Uint8Array(stdinBuffer, 8) };
        interruptBuffer = new SharedArrayBuffer(1);
        interrupt = new Uint8Array(interruptBuffer);
    }
    ready = new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
            if (data.type === 'ready') resolve(data);
            else if (data.type === 'stream') emit('stream', data);
            else if (data.type === 'status') emit('status', data.text);
            else if (data.type === 'input-request') emit('input', true);
            else if (data.type === 'done' || data.type === 'error') {
                const done = pending.get(data.id);
                pending.delete(data.id);
                if (done) done(data.type === 'error' ? { result: { ok: false, evalue: data.message, traceback: data.message } } : data);
            }
        };
        worker.onerror = (e) => reject(new Error(e.message || 'Python failed to load'));
    });
    worker.postMessage({ type: 'init', stdinBuffer, interruptBuffer });
    return ready;
};

/** Loads Python (first call downloads ~10 MB from the CDN, then it's cached by the browser). */
export const load = () => ready || start();

const call = async (msg) => {
    await load();
    const id = ++seq;
    return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ ...msg, id });
    });
};

const serial = (fn) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
};

/** Copies the project's files into Python's file system (only what changed). */
export const syncFromServer = async (projectId) => {
    const { data } = await axios.get(`/api/execute/snapshot/${projectId}`);
    if (mountedProjectId !== projectId) {
        synced = new Map();
        mountedProjectId = projectId;
    }
    const changed = data.files.filter(f => synced.get(f.path) !== f.content);
    if (changed.length) await call({ type: 'files', files: changed });
    changed.forEach(f => synced.set(f.path, f.content));
    return data.files;
};

export const writeProjectFile = async (projectId, path, content) => {
    if (mountedProjectId !== projectId || !worker) return;
    await call({ type: 'files', files: [{ path, content }] });
    synced.set(path, content);
};

/**
 * Runs Python. mode 'script' runs a file in a fresh namespace; 'cell' runs in the shared notebook
 * namespace and returns the value of the last expression. Resolves with
 * { result: { ok, value, figures, ename, evalue, traceback }, files: [changed text files] }.
 */
export const run = ({ code, filename, mode = 'script', requirements = [], cwd = '' }) => serial(() => {
    if (interrupt) interrupt[0] = 0;
    return call({ type: 'run', code, filename, mode, requirements, cwd });
});

export const resetCells = () => serial(() => call({ type: 'reset-cells' }));

/** Loads a FastAPI/Flask app, then call it with { method, path, headers, body }. */
export const loadApi = ({ entry, framework, requirements }) => serial(() => call({ type: 'api', action: 'load', entry, framework, requirements }));
export const callApi = ({ method, path, headers, body }) => serial(() => call({ type: 'api', action: 'call', method, path, headers, body }));

/** Answers a pending input() call. */
export const provideInput = (text) => {
    if (!stdin) return;
    const bytes = new TextEncoder().encode(`${text}\n`).slice(0, stdin.data.length);
    stdin.data.set(bytes);
    stdin.len[0] = bytes.length;
    Atomics.store(stdin.flag, 0, 1);
    Atomics.notify(stdin.flag, 0);
};

/** Stops the running code (KeyboardInterrupt), or restarts Python if it can't be interrupted. */
export const stop = () => {
    if (interrupt) {
        interrupt[0] = 2; // SIGINT
        if (stdin) { // also unblock a pending input()
            stdin.len[0] = -1;
            Atomics.store(stdin.flag, 0, 1);
            Atomics.notify(stdin.flag, 0);
        }
    } else {
        restart();
    }
};

/** Throws away the Python session (e.g. "Restart kernel"). */
export const restart = () => {
    worker?.terminate();
    worker = null;
    ready = null;
    synced = new Map();
    queue = Promise.resolve();
    for (const done of pending.values()) done({ result: { ok: false, ename: 'Restarted', evalue: 'Python was restarted', traceback: '' } });
    pending.clear();
};

export const canUseInput = () => typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true;
