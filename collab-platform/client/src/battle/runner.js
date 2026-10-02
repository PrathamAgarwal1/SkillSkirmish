// battle/runner.js — runs battle solutions in the browser, one function call per test input.
//
// Code runs in a worker created from a data: URL, which gets an opaque origin: it can't read this
// site's storage (login token, saved git repos, ...). That matters because players also re-run their
// opponent's code to verify results. Python uses Pyodide (loaded once per worker), SQL uses sql.js
// (SQLite in WebAssembly, a fresh database per test); JavaScript runs directly; C and C++ are compiled
// with Clang (WebAssembly, ~23 MB download the first time) and each test runs as its own small program
// (see native.js). A watchdog terminates the worker when a test takes too long (infinite loops).
import { isNative, nativeSource, encodeArgs, runWasi, STDCPP_HEADER } from './native';
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/';
const CLANG_URL = 'https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/bundle.js';

const WORKER_SOURCE = `
const PYODIDE_URL = ${JSON.stringify(PYODIDE_URL)};
const SQLJS_URL = ${JSON.stringify(SQLJS_URL)};
let pyodide = null;
let pyLoading = null;
let SQL = null;
async function loadSql(post) {
  if (SQL) return SQL;
  post({ type: 'status', text: 'Loading SQLite…' });
  importScripts(SQLJS_URL + 'sql-wasm.js');
  SQL = await initSqlJs({ locateFile: (f) => SQLJS_URL + f });
  return SQL;
}
const CLANG_URL = ${JSON.stringify(CLANG_URL)};
const STDCPP_HEADER = ${JSON.stringify(STDCPP_HEADER)};
const runWasi = ${runWasi.toString()};
let clang = null;
let clangLoading = null;
async function loadClang(post) {
  if (clang) return clang;
  if (!clangLoading) {
    clangLoading = (async () => {
      post({ type: 'status', text: 'Downloading the C/C++ compiler (about 23 MB, only the first time)…' });
      const mod = await import(CLANG_URL);
      // Compile something tiny so the compiler's files are fetched and cached now
      await mod.runClang(['clang', 'warm.c', '-o', 'a.out'], { 'warm.c': 'int main(void) { return 0; }' }, { fetchProgress: (p) => {
        if (p && p.totalLength) post({ type: 'status', text: 'Downloading the C/C++ compiler: ' + Math.round(100 * p.doneLength / p.totalLength) + '%' });
      } });
      return mod;
    })();
    clangLoading.catch(() => { clangLoading = null; });
  }
  clang = await clangLoading;
  return clang;
}
const compiled = new Map(); // source -> WebAssembly.Module (a few recent ones, e.g. run then submit)
function tidyCompileErrors(text, fnName) {
  const lines = String(text).split('\\n').filter((l) => l.trim() && !/^\\d+ (error|warning)s? generated/.test(l));
  let out = lines.slice(0, 14).join('\\n');
  if (/harness:\\d+/.test(text)) {
    if (/redefinition of 'main'|duplicate symbol: main/.test(text)) out = "Don't write a main() function. The battle calls your function directly.\\n\\n" + out;
    else out = 'Check that your function is named ' + fnName + ' and has the same parameters and return type as the starter code.\\n\\n' + out;
  }
  return out;
}
async function compileNative(language, source, fnName, post) {
  if (compiled.has(source)) return { module: compiled.get(source) };
  const cc = await loadClang(post);
  post({ type: 'status', text: 'Compiling…' });
  const file = language === 'c' ? 'solution.c' : 'solution.cpp';
  let stderr = '';
  try {
    const out = await cc.runClang(
      [language === 'c' ? 'clang' : 'clang++', '-O2', ...(language === 'c' ? ['-std=c17'] : ['-std=c++20', '-fno-exceptions']), '-I.', '-Wl,-z,stack-size=8388608', '-lm', file, '-o', 'a.out'],
      { [file]: source, bits: { 'stdc++.h': STDCPP_HEADER } },
      { stderr: (b) => { if (b) stderr += new TextDecoder().decode(b); } }
    );
    const module = await WebAssembly.compile(out['a.out']);
    compiled.set(source, module);
    if (compiled.size > 4) compiled.delete(compiled.keys().next().value);
    return { module };
  } catch (err) {
    if (/exceptions disabled/.test(stderr)) stderr = "Exceptions (throw / try) aren't available in battles.\\n\\n" + stderr;
    return { error: tidyCompileErrors(stderr || String(err && err.message || err), fnName) };
  }
}
const nativeTrap = (msg) => {
  if (/call stack/i.test(msg)) return 'Stack overflow (recursion too deep?)';
  if (/out of bounds/i.test(msg)) return 'Runtime error: memory access out of bounds (like a segfault)';
  if (/unreachable/i.test(msg)) return 'Runtime error: the program crashed (missing return value, abort() or a failed assert?)';
  if (/divide by zero|integer overflow/i.test(msg)) return 'Runtime error: ' + msg;
  return 'Runtime error: ' + msg;
};
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
  const { id, kind, language, code, fnName, inputs, harness, schema } = e.data;
  const post = (msg) => self.postMessage(Object.assign({ id }, msg));
  if (kind === 'warm') { try { if (language === 'python') await loadPython(post); if (language === 'sql') await loadSql(post); if (language === 'c' || language === 'cpp') await loadClang(post); post({ type: 'warm' }); } catch (err) { post({ type: 'warm', error: String(err) }); } return; }
  const logs = [];
  const log = (s) => { if (logs.length < 300) logs.push(String(s).slice(0, 2000)); };
  const outputs = [];
  try {
    if (language === 'sql') {
      const sql = await loadSql(post);
      for (let i = 0; i < inputs.length; i++) {
        post({ type: 'progress', i });
        const t0 = performance.now();
        const db = new sql.Database();
        try {
          db.run((schema || '') + '\\n' + inputs[i][0]);
          const results = db.exec(code);
          const rows = results.length ? results[results.length - 1].values : [];
          if (i === 0 && results.length) log('columns: ' + results[results.length - 1].columns.join(', '));
          outputs.push({ ok: true, value: JSON.stringify(rows), ms: Math.round(performance.now() - t0) });
        } catch (err) {
          outputs.push({ ok: false, error: String(err && err.message || err), ms: Math.round(performance.now() - t0) });
        } finally {
          db.close();
        }
      }
    } else if (language === 'c' || language === 'cpp') {
      const { module, error } = await compileNative(language, e.data.source, fnName, post);
      if (error) return post({ type: 'done', compileError: error, outputs, logs });
      const encoder = new TextEncoder();
      for (let i = 0; i < inputs.length; i++) {
        post({ type: 'progress', i });
        const t0 = performance.now();
        let r;
        try {
          r = runWasi(module, encoder.encode(e.data.stdin[i]));
        } catch (err) {
          r = { stdout: '', stderr: '', code: 0, trap: String(err && err.message || err) };
        }
        const ms = Math.round(performance.now() - t0);
        const at = r.stdout.lastIndexOf('\\n\\x1e');
        const printed = (at < 0 ? r.stdout : r.stdout.slice(0, at)) + (r.stderr ? '\\n' + r.stderr : '');
        if (printed.trim()) printed.trim().split('\\n').forEach(log);
        if (r.trap) outputs.push({ ok: false, error: nativeTrap(r.trap), ms });
        else if (at < 0) outputs.push({ ok: false, error: r.code ? 'The program exited with code ' + r.code : 'No result: the program stopped before returning', ms });
        else outputs.push({ ok: true, value: r.stdout.slice(at + 2).trim(), ms });
      }
    } else if (language === 'javascript') {
      const say = (...a) => log(a.map(fmt).join(' '));
      const shim = { log: say, info: say, warn: say, error: say, debug: say, table: say };
      let fn;
      try {
        fn = new Function('console', '"use strict";\\n' + code + '\\n' + (harness || '') + '\\n;return typeof ' + fnName + ' === "function" ? ' + fnName + ' : undefined;')(shim);
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
const PER_TEST_MS = { javascript: 2500, python: 4000, sql: 3000, c: 2500, cpp: 2500 };
const SLOW_START = ['python', 'sql', 'c', 'cpp']; // need a runtime downloaded first
const PY_LOAD_MS = 60000;
const LOAD_MS = { c: 240000, cpp: 240000 }; // the C/C++ compiler is a bigger download

/**
 * A reusable runner. run() resolves with { outputs: [{ ok, value?, error?, ms }], logs, compileError?,
 * timedOut? }. Tests that never ran (after a crash or time-out) are reported as failed.
 */
export function createRunner({ slack = 1 } = {}) {
    let worker = null;
    const ready = new Set(); // languages whose runtime is loaded in this worker
    let seq = 0;
    let pending = null;

    const ensure = () => {
        if (!worker) {
            worker = new Worker(WORKER_URL);
            ready.clear();
            worker.onmessage = (e) => pending?.onMessage(e.data);
            worker.onerror = (e) => pending?.onMessage({ id: pending.id, type: 'done', compileError: e.message || 'The code runner crashed', outputs: [] });
        }
        return worker;
    };

    const kill = () => {
        worker?.terminate();
        worker = null;
        ready.clear();
    };

    /** Starts loading Python / SQLite in the background so the first run is fast. */
    const warm = (language) => {
        if (!SLOW_START.includes(language) || ready.has(language) || pending) return;
        const id = ++seq;
        pending = {
            id,
            warm: true,
            onMessage: (m) => {
                if (m.id !== id) return;
                if (m.type === 'warm') { if (!m.error) ready.add(language); pending = null; }
            }
        };
        ensure().postMessage({ id, kind: 'warm', language });
    };

    const run = ({ language, code, fnName, inputs, harness, schema, signature, onStatus }) => new Promise((resolve) => {
        if (language !== 'sql' && !/^[A-Za-z_$][\w$]*$/.test(fnName || '')) return resolve({ outputs: [], logs: [], compileError: 'Invalid function name' });
        let nativeJob = null;
        if (isNative(language)) {
            if (!signature?.params) return resolve({ outputs: [], logs: [], compileError: `${language === 'c' ? 'C' : 'C++'} isn't available for this challenge` });
            try {
                nativeJob = {
                    source: nativeSource(language, code, { ...signature, fnName }),
                    stdin: inputs.map(args => encodeArgs(signature.params, args))
                };
            } catch (err) {
                return resolve({ outputs: [], logs: [], compileError: err.message });
            }
        }
        // A background download (warm) can keep going: the run waits for the same runtime in the worker
        if (pending && !pending.warm) kill();
        pending = null;
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
                if (m.type === 'status') { onStatus?.(m.text); arm(LOAD_MS[language] || PY_LOAD_MS); return; }
                if (m.type === 'progress') {
                    current = m.i;
                    ready.add(language);
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
        arm(SLOW_START.includes(language) && !ready.has(language) ? (LOAD_MS[language] || PY_LOAD_MS) : perTest);
        ensure().postMessage({ id, kind: 'run', language, code, fnName, inputs, harness, schema, ...nativeJob });
    });

    return { run, warm, dispose: kill };
}
