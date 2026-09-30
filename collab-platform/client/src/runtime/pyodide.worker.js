// runtime/pyodide.worker.js — Python in a Web Worker (Pyodide: CPython compiled to WebAssembly).
//
// Messages in:  init | files | run | api | listFiles
// Messages out: ready | stream | status | input-request | result | done | error
//
// input() blocks on a SharedArrayBuffer until the IDE answers (needs cross-origin isolation, which
// the IDE page has). Matplotlib figures are captured after each run and sent back as PNGs.
const PYODIDE_VERSION = '314.0.7';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PROJECT_DIR = '/home/pyodide/project';

let pyodide = null;
let stdinShared = null;   // { flag: Int32Array, len: Int32Array, data: Uint8Array }
let written = new Map();  // path -> content we wrote (to detect files the code created/changed)
const installed = new Set();

const post = (msg) => self.postMessage(msg);

// Python helpers: run code as a script or notebook cell, render values, capture figures, call web apps
const HARNESS = String.raw`
import sys, os, io, base64, json, traceback, importlib
from pyodide.code import eval_code_async

PROJECT = ${JSON.stringify(PROJECT_DIR)}
_ss_cell_ns = {"__name__": "__main__"}

def _ss_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import matplotlib.pyplot as plt
    out = []
    for num in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(num).savefig(buf, format="png", bbox_inches="tight", dpi=100)
        out.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out

def _ss_repr(value):
    if value is None:
        return None
    data = {}
    for method, mime in (("_repr_html_", "text/html"), ("_repr_markdown_", "text/markdown"), ("_repr_png_", "image/png"), ("_repr_svg_", "image/svg+xml")):
        fn = getattr(value, method, None)
        if callable(fn):
            try:
                r = fn()
                if r is not None:
                    data[mime] = r if isinstance(r, str) else base64.b64encode(r).decode()
            except Exception:
                pass
    data["text/plain"] = repr(value)
    return data

def _ss_forget_project_modules():
    # So edits to helper modules are picked up on the next run
    for name, mod in list(sys.modules.items()):
        f = getattr(mod, "__file__", None) or ""
        if f.startswith(PROJECT):
            del sys.modules[name]

async def _ss_run(code, filename, mode, cwd=""):
    # Like Jupyter, notebooks run from their own folder (so "../data/x.csv" works)
    os.chdir(os.path.join(PROJECT, cwd) if cwd and os.path.isdir(os.path.join(PROJECT, cwd)) else PROJECT)
    if PROJECT not in sys.path:
        sys.path.insert(0, PROJECT)
    if mode == "cell":
        ns = _ss_cell_ns
    else:
        _ss_forget_project_modules()
        ns = {"__name__": "__main__", "__file__": os.path.join(PROJECT, filename)}
    try:
        value = await eval_code_async(code, globals=ns, filename=filename,
                                      return_mode="last_expr" if mode == "cell" else "none")
        return json.dumps({"ok": True, "value": _ss_repr(value) if mode == "cell" else None, "figures": _ss_figures()})
    except SystemExit as e:
        ok = e.code in (None, 0)
        return json.dumps({"ok": ok, "ename": "SystemExit", "evalue": str(e.code), "traceback": "" if ok else f"SystemExit: {e.code}", "figures": _ss_figures()})
    except BaseException as e:
        tb = traceback.format_exception(type(e), e, e.__traceback__)
        # Hide the harness's own frames
        tb = [line for line in tb if "_pyodide" not in line and "pyodide/code" not in line and "<exec>" not in line]
        return json.dumps({"ok": False, "ename": type(e).__name__, "evalue": str(e), "traceback": "".join(tb), "figures": _ss_figures()})

def _ss_reset_cells():
    _ss_cell_ns.clear()
    _ss_cell_ns["__name__"] = "__main__"

# ---- Web API tester: call a FastAPI (ASGI) or Flask (WSGI) app without a network port ----
_ss_api = {"app": None, "kind": None, "entry": None}

def _ss_no_threads():
    # FastAPI/Starlette run plain "def" endpoints in a thread pool; the browser has no threads,
    # so run them inline instead
    try:
        import anyio.to_thread
        async def run_sync(func, *args, **kwargs):
            return func(*args)
        anyio.to_thread.run_sync = run_sync
    except ImportError:
        pass

async def _ss_load_api(entry):
    os.chdir(PROJECT)
    if PROJECT not in sys.path:
        sys.path.insert(0, PROJECT)
    _ss_forget_project_modules()
    _ss_no_threads()
    module = importlib.import_module(entry[:-3].replace("/", "."))
    app, kind = None, None
    for value in vars(module).values():
        cls = type(value).__name__
        if cls == "FastAPI" or (hasattr(value, "router") and hasattr(value, "openapi")):
            app, kind = value, "asgi"; break
        if cls == "Flask" or hasattr(value, "wsgi_app"):
            app, kind = value, "wsgi"; break
    if app is None:
        raise RuntimeError(f"No FastAPI or Flask app found in {entry}")
    _ss_api.update(app=app, kind=kind, entry=entry)
    routes = []
    if kind == "asgi":
        for r in app.routes:
            for m in sorted(getattr(r, "methods", None) or []):
                if m not in ("HEAD", "OPTIONS"):
                    routes.append({"method": m, "path": r.path})
    else:
        for rule in app.url_map.iter_rules():
            for m in sorted(rule.methods - {"HEAD", "OPTIONS"}):
                routes.append({"method": m, "path": rule.rule})
    return json.dumps({"kind": kind, "routes": routes})

async def _ss_call_api(method, path, headers_json, body):
    headers = json.loads(headers_json)
    app, kind = _ss_api["app"], _ss_api["kind"]
    if app is None:
        raise RuntimeError("The API is not loaded")
    route, _, query = path.partition("?")
    if kind == "asgi":
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
                 "scheme": "http", "path": route, "raw_path": route.encode(), "query_string": query.encode(),
                 "root_path": "", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
                 "client": ("127.0.0.1", 50000), "server": ("localhost", 80)}
        pending = [{"type": "http.request", "body": body.encode(), "more_body": False}]
        out = {"status": 500, "headers": [], "body": b""}
        async def receive():
            return pending.pop(0) if pending else {"type": "http.disconnect"}
        async def send(message):
            if message["type"] == "http.response.start":
                out["status"] = message["status"]
                out["headers"] = [(k.decode(), v.decode()) for k, v in message.get("headers", [])]
            elif message["type"] == "http.response.body":
                out["body"] += message.get("body", b"")
        await app(scope, receive, send)
        return json.dumps({"status": out["status"], "headers": out["headers"], "body": out["body"].decode("utf-8", "replace")})
    client = app.test_client()
    r = client.open(path, method=method, data=body.encode() if body else None, headers=headers)
    return json.dumps({"status": r.status_code, "headers": list(r.headers.items()), "body": r.get_data(as_text=True)})
`;

async function init({ stdinBuffer, interruptBuffer }) {
    const { loadPyodide } = await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`);
    pyodide = await loadPyodide({ indexURL: INDEX_URL, env: { MPLBACKEND: 'Agg', HOME: '/home/pyodide' } });
    // Raw writes (not line-buffered) so prompts like input("Name? ") show before waiting for input
    for (const [name, setter] of [['stdout', 'setStdout'], ['stderr', 'setStderr']]) {
        const decoder = new TextDecoder();
        pyodide[setter]({
            write: (bytes) => {
                post({ type: 'stream', name, text: decoder.decode(bytes, { stream: true }) });
                return bytes.length;
            }
        });
    }
    pyodide.FS.mkdirTree(PROJECT_DIR);
    if (stdinBuffer) {
        stdinShared = {
            flag: new Int32Array(stdinBuffer, 0, 1),
            len: new Int32Array(stdinBuffer, 4, 1),
            data: new Uint8Array(stdinBuffer, 8)
        };
    }
    pyodide.setStdin({
        stdin: () => {
            if (!stdinShared) throw new Error('input() is not available in this browser');
            Atomics.store(stdinShared.flag, 0, 0);
            post({ type: 'input-request' });
            Atomics.wait(stdinShared.flag, 0, 0);
            const n = stdinShared.len[0];
            if (n < 0) return null; // EOF (stopped)
            return new TextDecoder().decode(stdinShared.data.slice(0, n));
        }
        // autoEOF (default): each answer ends one read, so input() returns instead of waiting for more
    });
    if (interruptBuffer) pyodide.setInterruptBuffer(new Uint8Array(interruptBuffer));
    await pyodide.runPythonAsync(HARNESS);
    post({ type: 'ready', version: pyodide.version });
}

function writeFiles(files) {
    const FS = pyodide.FS;
    for (const { path, content } of files) {
        const full = `${PROJECT_DIR}/${path}`;
        FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
        FS.writeFile(full, content);
        written.set(path, content);
    }
}

// Files the code created or changed (e.g. results.csv), to save back into the project
function changedFiles() {
    const FS = pyodide.FS;
    const out = [];
    const walk = (dir, rel) => {
        for (const name of FS.readdir(dir)) {
            if (name === '.' || name === '..' || name === '__pycache__' || name.startsWith('.')) continue;
            const full = `${dir}/${name}`;
            const r = rel ? `${rel}/${name}` : name;
            const stat = FS.stat(full);
            if (FS.isDir(stat.mode)) walk(full, r);
            else if (stat.size <= 512 * 1024) {
                const bytes = FS.readFile(full);
                if (bytes.subarray(0, 8000).includes(0)) continue; // binary (models, images)
                const text = new TextDecoder().decode(bytes);
                if (written.get(r) !== text) out.push({ path: r, content: text });
            }
        }
    };
    walk(PROJECT_DIR, '');
    return out;
}

async function installPackages({ code, requirements }) {
    // Pyodide's built-in packages (numpy, pandas, scikit-learn, matplotlib...) from the imports
    if (code) {
        await pyodide.loadPackagesFromImports(code, {
            messageCallback: (m) => post({ type: 'status', text: m })
        });
    }
    const wanted = (requirements || []).filter(r => r.supported && !installed.has(r.spec));
    if (!wanted.length) return;
    await pyodide.loadPackage('micropip');
    const micropip = pyodide.pyimport('micropip');
    for (const r of wanted) {
        post({ type: 'status', text: `Installing ${r.spec}…` });
        try {
            await micropip.install(r.spec);
            installed.add(r.spec);
        } catch (err) {
            post({ type: 'stream', name: 'stderr', text: `⚠ Could not install ${r.spec} in the browser: ${String(err.message || err).split('\n').pop()}\n` });
            installed.add(r.spec); // don't retry every run
        }
    }
}

async function run({ id, code, filename, mode, requirements, cwd }) {
    try {
        await installPackages({ code, requirements });
        const json = await pyodide.globals.get('_ss_run')(code, filename || '<cell>', mode || 'script', cwd || '');
        const result = JSON.parse(json);
        post({ type: 'done', id, result, files: mode === 'cell' ? [] : changedFiles() });
    } catch (err) {
        post({ type: 'done', id, result: { ok: false, ename: 'Error', evalue: String(err.message || err), traceback: String(err.message || err), figures: [] }, files: [] });
    }
}

async function api({ id, action, entry, framework, method, path, headers, body, requirements }) {
    try {
        if (action === 'load') {
            const extra = framework === 'flask' ? [{ spec: 'flask', supported: true }] : [];
            await installPackages({ code: pyodide.FS.readFile(`${PROJECT_DIR}/${entry}`, { encoding: 'utf8' }), requirements: [...extra, ...(requirements || [])] });
            const info = JSON.parse(await pyodide.globals.get('_ss_load_api')(entry));
            post({ type: 'done', id, result: { ok: true, ...info } });
        } else {
            const res = JSON.parse(await pyodide.globals.get('_ss_call_api')(method, path, JSON.stringify(headers || {}), body || ''));
            post({ type: 'done', id, result: { ok: true, ...res } });
        }
    } catch (err) {
        post({ type: 'done', id, result: { ok: false, evalue: String(err.message || err).split('\n').filter(Boolean).slice(-3).join('\n') } });
    }
}

self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'init') await init(data);
        else if (data.type === 'files') { writeFiles(data.files); post({ type: 'done', id: data.id, result: { ok: true } }); }
        else if (data.type === 'run') await run(data);
        else if (data.type === 'reset-cells') { pyodide.globals.get('_ss_reset_cells')(); post({ type: 'done', id: data.id, result: { ok: true } }); }
        else if (data.type === 'api') await api(data);
    } catch (err) {
        post({ type: 'error', id: data.id, message: String(err.message || err) });
    }
};
