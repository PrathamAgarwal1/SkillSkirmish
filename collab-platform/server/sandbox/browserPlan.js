// sandbox/browserPlan.js — how a project runs when code executes in the user's browser
// (browser mode: no Docker on the server, e.g. free hosting on Render).
//
// JavaScript projects run in a WebContainer (real Node.js + npm in the browser tab), Python runs in
// Pyodide (CPython compiled to WebAssembly: pandas, NumPy, scikit-learn, matplotlib...), Streamlit
// apps run with stlite, and Expo apps can also open in Expo Snack for a real phone. Deploys are
// built in the browser and uploaded as static files.
const fs = require('fs');
const path = require('path');

const PORT = '3000';
const withPort = (cmd) => cmd.replace(/\$PORT\b/g, PORT);

const readText = (file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
};

// Packages Pyodide can't install (native code with no WebAssembly build, or not needed in the browser)
const UNSUPPORTED_PY = new Set(['torch', 'torchvision', 'torchaudio', 'tensorflow', 'keras', 'jax', 'jaxlib',
    'xgboost', 'lightgbm', 'catboost', 'kaggle', 'jupyter', 'jupyterlab', 'notebook', 'ipykernel',
    'uvicorn', 'gunicorn', 'streamlit', 'psycopg2', 'psycopg2-binary', 'mysqlclient', 'opencv-python']);

/** requirements.txt -> [{ spec, name, supported }] */
const parseRequirements = (text) => String(text || '').split(/\r?\n/)
    .map(l => l.replace(/#.*/, '').trim())
    .filter(l => l && !l.startsWith('-'))
    .map(spec => {
        const name = spec.split(/[<>=!~;\[\s]/)[0].toLowerCase();
        return { spec, name, supported: !UNSUPPORTED_PY.has(name) };
    });

function nodePlan(cfg, dir, files) {
    const rootDir = path.join(dir, cfg.root || '');
    const targets = cfg.targets
        .filter(t => t.id !== 'phone')
        .map(t => ({
            id: t.id,
            label: t.label,
            preview: t.preview,
            engine: 'wc',
            // http-server is preinstalled in the Docker image, not in a WebContainer
            cmd: withPort(t.cmd).replace(/^http-server\b/, 'npx --yes http-server')
        }));

    const isExpo = cfg.label.startsWith('Expo');
    if (isExpo) {
        // Inside a WebContainer the Expo CLI only serves on port 8081
        for (const t of targets) t.cmd = t.cmd.replace(/--port 3000\b/, '--port 8081');
        targets.push({ id: 'snack', label: 'Phone (Expo Snack)', preview: false, engine: 'snack' });
    }

    let deploy = { kind: null, reason: cfg.deploy.reason || null };
    if (cfg.deploy.kind === 'static') {
        let build = cfg.deploy.build;
        // Deployed sites are served from /apps/<name>/, so builds should use relative asset URLs
        if (build === 'npx vite build') build = 'npx vite build --base=./';
        if (build === 'npx react-scripts build') build = 'PUBLIC_URL=. npx react-scripts build';
        deploy = { kind: 'static', engine: 'wc', build, output: cfg.deploy.output, root: cfg.root || '' };
    } else if (cfg.label === 'Next.js') {
        const nextConfig = ['next.config.js', 'next.config.mjs', 'next.config.ts']
            .map(f => readText(path.join(rootDir, f))).join('\n');
        deploy = /output\s*:\s*['"]export['"]/.test(nextConfig)
            ? { kind: 'static', engine: 'wc', build: 'npx next build', output: 'out', root: cfg.root || '' }
            : { kind: null, reason: 'Free hosting serves static sites. Add output: "export" to next.config.js to deploy this Next.js app as a static site.' };
    } else if (cfg.deploy.kind === 'server') {
        deploy = { kind: null, reason: 'Free hosting serves static sites only. Servers (Express, APIs) run in the preview while you code; to host one permanently, deploy the project on a server with Docker (see DEPLOYMENT.md).' };
    }

    return {
        runtime: 'node',
        root: cfg.root || '',
        install: cfg.install.map(s => ({ dir: s.dir, cmd: s.cmd })),
        targets,
        deploy,
        hasPackageJson: files.some(f => f.endsWith('package.json'))
    };
}

function pythonPlan(cfg, dir, files) {
    const requirements = parseRequirements(readText(path.join(dir, 'requirements.txt')));
    const sources = Object.fromEntries(files.filter(f => f.endsWith('.py') && !f.includes('/'))
        .map(f => [f, readText(path.join(dir, f))]));
    const find = (re) => Object.keys(sources).sort((a, b) => (a === 'app.py' ? -1 : b === 'app.py' ? 1 : 0)).find(f => re.test(sources[f]));

    const streamlitEntry = find(/import\s+streamlit|from\s+streamlit/);
    const fastapiEntry = find(/FastAPI\s*\(/);
    const flaskEntry = find(/Flask\s*\(/);
    const notebooks = files.filter(f => f.endsWith('.ipynb'));
    const scripts = Object.keys(sources).filter(f => ![streamlitEntry, fastapiEntry, flaskEntry].includes(f) && !f.startsWith('test_'));

    const targets = [];
    if (streamlitEntry) targets.push({ id: 'streamlit', label: `Streamlit (${streamlitEntry})`, preview: true, engine: 'streamlit', entry: streamlitEntry });
    if (fastapiEntry) targets.push({ id: 'api', label: `FastAPI (${fastapiEntry})`, preview: false, engine: 'api', framework: 'fastapi', entry: fastapiEntry });
    else if (flaskEntry) targets.push({ id: 'api', label: `Flask (${flaskEntry})`, preview: false, engine: 'api', framework: 'flask', entry: flaskEntry });
    if (notebooks.length) targets.push({ id: 'notebook', label: `Notebook (${path.posix.basename(notebooks[0])})`, preview: false, engine: 'notebook', file: notebooks[0] });
    const preferred = ['main.py', 'train.py'].find(f => scripts.includes(f)) || scripts[0];
    for (const s of [preferred, ...scripts.filter(x => x !== preferred)].filter(Boolean).slice(0, 5)) {
        targets.push({ id: `script:${s}`, label: `python ${s}`, preview: false, engine: 'python', file: s });
    }

    let deploy;
    if (streamlitEntry) deploy = { kind: 'static', engine: 'stlite', entry: streamlitEntry };
    else if (notebooks.length) deploy = { kind: 'static', engine: 'notebook', notebooks };
    else if (fastapiEntry || flaskEntry) deploy = { kind: null, reason: 'Free hosting serves static sites only. Use the API tester to try your endpoints; to host the API permanently, deploy on a server with Docker (see DEPLOYMENT.md).' };
    else deploy = { kind: null, reason: 'Add a Streamlit app (app.py) or a notebook to publish this project.' };

    return { runtime: 'python', requirements, targets, deploy };
}

/** Browser run plan for the IDE, from the regular run config (sandbox/runConfig.js). */
function browserPlan(cfg, dir, files) {
    if (cfg.env === 'python' || cfg.env === 'ml') return pythonPlan(cfg, dir, files);
    if (cfg.label === 'Empty project') {
        return { runtime: 'node', install: [], targets: [], deploy: { kind: null, reason: cfg.deploy.reason } };
    }
    return nodePlan(cfg, dir, files);
}

module.exports = { browserPlan, parseRequirements, UNSUPPORTED_PY };
