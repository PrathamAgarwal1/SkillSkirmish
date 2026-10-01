// battle/runner.js — runs battle solutions in the browser, one function call per test input.
//
// Code runs in a worker created from a data: URL, which gets an opaque origin: it can't read this
// site's storage (login token, saved git repos, ...). That matters because players also re-run their
// opponent's code to verify results. Python uses Pyodide (loaded once per worker); JavaScript runs
// directly. A watchdog terminates the worker when a test takes too long (infinite loops).
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

const WORKER_SOURCE = `
const PYODIDE_URL = ${JSON.stringify(PYODIDE_URL)};
let pyodide = null;
let pyLoading = null;
const fmt = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); } };
const clean = (msg) => {
  const lines = String(msg).split('\\n').filter((l) => l.trim());
  const where = lines.filter((l) => l.includes('solution.py')).pop();
  const line = where && /line (\\d+)/.exec(where);
  return (lines.pop() || 'Error') + (line ? ' (line ' + line[1] + ')' : '');
};
async function loadPython(post) {
  if (pyodide) return pyodide;
  if (!pyLoading) {
    pyLoading = (async () => {
      post({ type: 'status', text: 'Loading Python…' });
      importScripts(PYODIDE_URL + 'pyodide.js');
      const py = await loadPyodide({ indexURL: PYODIDE_URL });
      py.runPython('import json as __ss_json, sys as __ss_sys\\n__ss_sys.setrecursionlimit(10000)');
      return py;
    })();
  }
  pyodide = await pyLoading;
  return pyodide;
}
self.onmessage = async (e) => {
  const { id, kind, language, code, fnName, inputs } = e.data;
  const post = (msg) => self.postMessage(Object.assign({ id }, msg));
  if (kind === 'warm') { try { if (language === 'python') await loadPython(post); post({ type: 'warm' }); } catch (err) { post({ type: 'warm', error: String(err) }); } return; }
  const logs = [];
  const log = (s) => { if (logs.length < 300) logs.push(String(s).slice(0, 2000)); };
  const outputs = [];
  try {
    if (language === 'javascript') {
      const say = (...a) => log(a.map(fmt).join(' '));
      const shim = { log: say, info: say, warn: say, error: say, debug: say, table: say };
      let fn;
      try {
        fn = new Function('console', '"use strict";\\n' + code + '\\n;return typeof ' + fnName + ' === "function" ? ' + fnName + ' : undefined;')(shim);
      } catch (err) {
        return post({ type: 'done', compileError: (err && err.name ? err.name + ': ' : '') + (err && err.message || err), outputs, logs });
      }
      if (!fn) return post({ type: 'done', compileError: 'Define a function named ' + fnName, outputs, logs });
      for (let i = 0; i < inputs.length; i++) {
        post({ type: 'progress', i });
        const t0 = performance.now();
        try {
          let v = fn(...JSON.parse(JSON.stringify(inputs[i])));
          if (v && typeof v.then === 'function') v = await v;
          outputs.push({ ok: true, value: JSON.stringify(v === undefined ? null : v), ms: Math.round(performance.now() - t0) });
        } catch (err) {
          outputs.push({ ok: false, error: (err && err.name ? err.name + ': ' : '') + (err && err.message || err), ms: Math.round(performance.now() - t0) });
        }
      }
    } else {
      const py = await loadPython(post);
      py.setStdout({ batched: log });
      py.setStderr({ batched: log });
      const ns = py.globals.get('dict')();
      ns.set('__ss_json', py.globals.get('__ss_json'));
      try {
        py.runPython(code, { globals: ns, filename: 'solution.py' });
      } catch (err) {
        return post({ type: 'done', compileError: clean(err.message), outputs, logs });
      }
      if (!py.runPython('callable(globals().get(' + JSON.stringify(fnName) + '))', { globals: ns })) {
        return post({ type: 'done', compileError: 'Define a function named ' + fnName, outputs, logs });
      }
      for (let i = 0; i < inputs.length; i++) {
        post({ type: 'progress', i });
        ns.set('__ss_args', JSON.stringify(inputs[i]));
        const t0 = performance.now();
        try {
          const value = py.runPython('__ss_json.dumps(' + fnName + '(*__ss_json.loads(__ss_args)))', { globals: ns });
          outputs.push({ ok: true, value, ms: Math.round(performance.now() - t0) });
        } catch (err) {
          outputs.push({ ok: false, error: clean(err.message), ms: Math.round(performance.now() - t0) });
        }
      }
      ns.destroy();
    }
    post({ type: 'done', outputs, logs });
  } catch (err) {
    post({ type: 'done', compileError: String(err && err.message || err), outputs, logs });
  }
};
`;

const WORKER_URL = `data:text/javascript;charset=utf-8,${encodeURIComponent(WORKER_SOURCE)}`;
const PER_TEST_MS = { javascript: 2500, python: 4000 };
const PY_LOAD_MS = 60000;

/**
 * A reusable runner. run() resolves with { outputs: [{ ok, value?, error?, ms }], logs, compileError?,
 * timedOut? }. Tests that never ran (after a crash or time-out) are reported as failed.
 */
export function createRunner({ slack = 1 } = {}) {
    let worker = null;
    let pyReady = false;
    let seq = 0;
    let pending = null;

    const ensure = () => {
        if (!worker) {
            worker = new Worker(WORKER_URL);
            pyReady = false;
            worker.onmessage = (e) => pending?.onMessage(e.data);
            worker.onerror = (e) => pending?.onMessage({ id: pending.id, type: 'done', compileError: e.message || 'The code runner crashed', outputs: [] });
        }
        return worker;
    };

    const kill = () => {
        worker?.terminate();
        worker = null;
        pyReady = false;
    };

    /** Starts loading Python in the background so the first run is fast. */
    const warm = (language) => {
        if (language !== 'python' || pyReady || pending) return;
        const id = ++seq;
        pending = {
            id,
            onMessage: (m) => {
                if (m.id !== id) return;
                if (m.type === 'warm') { pyReady = !m.error; pending = null; }
            }
        };
        ensure().postMessage({ id, kind: 'warm', language });
    };

    const run = ({ language, code, fnName, inputs, onStatus }) => new Promise((resolve) => {
        if (!/^[A-Za-z_$][\w$]*$/.test(fnName || '')) return resolve({ outputs: [], logs: [], compileError: 'Invalid function name' });
        if (pending) { kill(); pending = null; }
        const id = ++seq;
        const perTest = PER_TEST_MS[language] * slack;
        let current = 0;
        let timer = null;
        const arm = (ms) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                // Infinite loop or far too slow: stop the worker and fail what's left
                kill();
                pending = null;
                const outputs = [];
                for (let i = 0; i < inputs.length; i++) {
                    outputs.push(i < current ? { ok: false, error: 'not run' } : { ok: false, error: i === current ? 'Time limit exceeded' : 'Not run (an earlier test timed out)' });
                }
                resolve({ outputs, logs: [], timedOut: true, timedOutAt: current });
            }, ms);
        };
        pending = {
            id,
            outputs: [],
            onMessage: (m) => {
                if (m.id !== id) return;
                if (m.type === 'status') { onStatus?.(m.text); arm(PY_LOAD_MS); return; }
                if (m.type === 'progress') {
                    current = m.i;
                    if (language === 'python') pyReady = true;
                    arm(perTest);
                    return;
                }
                if (m.type === 'done') {
                    clearTimeout(timer);
                    pending = null;
                    const outputs = m.outputs || [];
                    while (outputs.length < inputs.length) outputs.push({ ok: false, error: m.compileError || 'not run' });
                    resolve({ outputs, logs: m.logs || [], compileError: m.compileError });
                }
            }
        };
        arm(language === 'python' && !pyReady ? PY_LOAD_MS : perTest);
        ensure().postMessage({ id, kind: 'run', language, code, fnName, inputs });
    });

    return { run, warm, dispose: kill };
}
