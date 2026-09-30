// sandbox/runConfig.js — figures out how to install, run, build and deploy a project from its files.
//
// Commands run with `sh` inside the sandbox and use $PORT for the app port (substituted by the runner).
const fs = require('fs');
const path = require('path');

// Folders that are never part of the project's source (installs, caches, build output)
const IGNORED_DIRS = new Set(['node_modules', '.git', '.pydeps', '.ss', '.next', '.expo', '__pycache__',
    '.ipynb_checkpoints', '.venv', 'venv', '.cache', '.ss-site']);

const readText = (file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
};
const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

/** Walks the project (skipping IGNORED_DIRS) and returns relative posix paths, capped for huge repos. */
const listFiles = (root, limit = 5000) => {
    const out = [];
    const walk = (dir, rel) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (out.length >= limit) return;
            if (e.isDirectory()) {
                if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
            } else {
                out.push(rel ? `${rel}/${e.name}` : e.name);
            }
        }
    };
    walk(root, '');
    return out;
};

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // single-quote for sh

const stamp = (dir, sources, stampFile) => ({ dir, sources, stampFile });

/** Every folder with a package.json (root first), so multi-package repos get all their deps. */
const nodeInstall = (files) => {
    const dirs = files.filter(f => f.endsWith('package.json') && !f.includes('node_modules/'))
        .map(f => path.posix.dirname(f))
        .map(d => (d === '.' ? '' : d))
        .sort((a, b) => a.split('/').length - b.split('/').length)
        .slice(0, 5);
    return dirs.map(d => ({
        ...stamp(d, ['package.json', 'package-lock.json'], 'node_modules/.ss-installed'),
        cmd: 'npm install --no-audit --no-fund --loglevel=error'
    }));
};

const pythonInstall = (files) => files.includes('requirements.txt')
    ? [{ ...stamp('', ['requirements.txt'], '.pydeps/.ss-installed'), cmd: 'pip install --user --no-warn-script-location -r requirements.txt' }]
    : [];

const STREAMLIT = (entry, dev) =>
    `streamlit run ${q(entry)} --server.port $PORT --server.address 0.0.0.0 --server.headless true ` +
    `--server.enableCORS false --server.enableXsrfProtection false${dev ? ' --server.runOnSave true' : ''}`;

const JUPYTER = 'jupyter lab --ip=0.0.0.0 --port=$PORT --no-browser --ServerApp.token="" --ServerApp.password="" ' +
    '--ServerApp.allow_origin="*" --ServerApp.disable_check_xsrf=True --ServerApp.root_dir=/workspace --LabApp.news_url=None';

function detectNode(dir, files, pkgPath) {
    const pkg = readJson(path.join(dir, pkgPath)) || {};
    const root = path.posix.dirname(pkgPath) === '.' ? '' : path.posix.dirname(pkgPath);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const scripts = pkg.scripts || {};
    const install = nodeInstall(files);
    const base = { env: 'node', root, install };

    if (deps.expo) {
        return {
            ...base,
            label: 'Expo (React Native)',
            targets: [
                { id: 'web', label: 'Web preview', preview: true, cmd: 'npx expo start --web --port $PORT' },
                { id: 'phone', label: 'Phone (Expo Go, tunnel)', preview: false, cmd: 'npx expo start --tunnel --port $PORT' }
            ],
            deploy: { kind: 'static', build: 'npx expo export --platform web', output: 'dist' }
        };
    }
    if (deps.next) {
        return {
            ...base,
            label: 'Next.js',
            targets: [{ id: 'dev', label: 'Dev server', preview: true, cmd: 'npx next dev -H 0.0.0.0 -p $PORT' }],
            deploy: { kind: 'server', build: scripts.build ? 'npm run build' : 'npx next build', start: 'npx next start -H 0.0.0.0 -p $PORT' }
        };
    }
    const serverFramework = ['express', 'fastify', 'koa', 'hono', '@nestjs/core'].some(d => deps[d]);
    if (serverFramework && (scripts.start || scripts.dev)) {
        return {
            ...base,
            label: 'Node.js server',
            targets: [{ id: 'dev', label: 'Dev server', preview: true, cmd: scripts.dev ? 'npm run dev' : 'npm start' }],
            deploy: { kind: 'server', build: scripts.build ? 'npm run build' : null, start: scripts.start ? 'npm start' : 'npm run dev' }
        };
    }
    if (deps.vite) {
        return {
            ...base,
            label: 'Vite app',
            targets: [{ id: 'dev', label: 'Dev server', preview: true, cmd: 'npx vite --host 0.0.0.0 --port $PORT --strictPort' }],
            deploy: { kind: 'static', build: 'npx vite build', output: 'dist' }
        };
    }
    if (deps['react-scripts']) {
        return {
            ...base,
            label: 'Create React App',
            targets: [{ id: 'dev', label: 'Dev server', preview: true, cmd: 'BROWSER=none HOST=0.0.0.0 npx react-scripts start' }],
            deploy: { kind: 'static', build: 'npx react-scripts build', output: 'build' }
        };
    }
    if (scripts.start || scripts.dev) {
        return {
            ...base,
            label: 'Node.js app',
            targets: [{ id: 'dev', label: scripts.dev ? 'npm run dev' : 'npm start', preview: true, cmd: scripts.dev ? 'npm run dev' : 'npm start' }],
            deploy: { kind: 'server', build: scripts.build ? 'npm run build' : null, start: scripts.start ? 'npm start' : 'npm run dev' }
        };
    }
    const entry = pkg.main || ['index.js', 'server.js', 'app.js'].find(f => files.includes(path.posix.join(root, f)));
    return {
        ...base,
        label: 'Node.js script',
        targets: [{ id: 'run', label: `node ${entry || 'index.js'}`, preview: false, cmd: `node ${q(entry || 'index.js')}` }],
        deploy: { kind: null, reason: 'Add an Express server or a "start" script to deploy this project.' }
    };
}

function detectPython(dir, files, projectType) {
    const reqs = (readText(path.join(dir, 'requirements.txt')) || '').toLowerCase();
    const notebooks = files.filter(f => f.endsWith('.ipynb'));
    const isML = projectType === 'Machine Learning (Jupyter)' || notebooks.length > 0 ||
        /\b(torch|tensorflow|scikit-learn|sklearn|pandas|streamlit|xgboost|lightgbm|kaggle)\b/.test(reqs);
    const env = isML ? 'ml' : 'python';

    const entryCandidates = ['app.py', 'main.py', 'server.py', 'streamlit_app.py'];
    const sources = Object.fromEntries(entryCandidates.filter(f => files.includes(f)).map(f => [f, readText(path.join(dir, f)) || '']));
    const find = (re) => Object.keys(sources).find(f => re.test(sources[f]));

    const streamlitEntry = find(/import\s+streamlit|from\s+streamlit/);
    const fastapiEntry = find(/FastAPI\s*\(/);
    const flaskEntry = find(/Flask\s*\(/);
    const mod = (f) => f.replace(/\.py$/, '');

    const targets = [];
    let deploy = { kind: null, reason: 'Add a Streamlit app (app.py), a FastAPI/Flask app, or a notebook to deploy.' };

    if (isML) targets.push({ id: 'jupyter', label: 'JupyterLab', preview: true, cmd: JUPYTER });

    if (streamlitEntry) {
        targets.push({ id: 'streamlit', label: `Streamlit (${streamlitEntry})`, preview: true, cmd: STREAMLIT(streamlitEntry, true) });
        deploy = { kind: 'server', build: null, start: STREAMLIT(streamlitEntry, false) };
    } else if (fastapiEntry) {
        targets.push({ id: 'api', label: `FastAPI (${fastapiEntry})`, preview: true, cmd: `uvicorn ${mod(fastapiEntry)}:app --host 0.0.0.0 --port $PORT --reload` });
        deploy = { kind: 'server', build: null, start: `uvicorn ${mod(fastapiEntry)}:app --host 0.0.0.0 --port $PORT` };
    } else if (flaskEntry) {
        targets.push({ id: 'api', label: `Flask (${flaskEntry})`, preview: true, cmd: `flask --app ${mod(flaskEntry)} run --host 0.0.0.0 --port $PORT --debug` });
        deploy = { kind: 'server', build: null, start: `flask --app ${mod(flaskEntry)} run --host 0.0.0.0 --port $PORT` };
    } else if (notebooks.length > 0) {
        deploy = { kind: 'static', build: 'python .ss-build-notebooks.py', output: '.ss-site', notebooks: true };
    }

    const script = Object.keys(sources)[0] || files.find(f => f.endsWith('.py') && !f.includes('/'));
    if (!streamlitEntry && !fastapiEntry && !flaskEntry && script) {
        targets.push({ id: 'script', label: `python ${script}`, preview: false, cmd: `python ${q(script)}` });
    }

    return {
        env,
        root: '',
        install: pythonInstall(files),
        label: isML ? 'Machine Learning (Python)' : 'Python',
        targets,
        deploy
    };
}

/**
 * Returns { env, root, label, install: [{dir, cmd, sources, stampFile}], targets: [...], deploy: {...} }
 */
function detectRunConfig(projectDir, projectType = '') {
    const files = listFiles(projectDir);

    const pkgFiles = files.filter(f => f.endsWith('package.json') && !f.includes('node_modules/'))
        .sort((a, b) => a.split('/').length - b.split('/').length);
    const hasPython = files.some(f => f.endsWith('.py') || f.endsWith('.ipynb')) || files.includes('requirements.txt');

    if (pkgFiles.length > 0 && !(hasPython && projectType.startsWith('Python')) && projectType !== 'Machine Learning (Jupyter)') {
        return detectNode(projectDir, files, pkgFiles[0]);
    }
    if (hasPython) return detectPython(projectDir, files, projectType);

    if (files.some(f => f.endsWith('.html'))) {
        return {
            env: 'node',
            root: '',
            install: [],
            label: 'Static website',
            targets: [{ id: 'dev', label: 'Static server', preview: true, cmd: 'http-server . -p $PORT -a 0.0.0.0 -c-1 --cors' }],
            deploy: { kind: 'static', build: null, output: '.' }
        };
    }

    return {
        env: 'node',
        root: '',
        install: [],
        label: 'Empty project',
        targets: [],
        deploy: { kind: null, reason: 'Add some code to deploy this project.' }
    };
}

/** True when an install step's stamp is missing or older than its source files. */
const needsInstall = (projectDir, step) => {
    const stampPath = path.join(projectDir, step.dir, step.stampFile);
    let stampTime;
    try { stampTime = fs.statSync(stampPath).mtimeMs; } catch { return true; }
    return step.sources.some(src => {
        try { return fs.statSync(path.join(projectDir, step.dir, src)).mtimeMs > stampTime; } catch { return false; }
    });
};

const markInstalled = (projectDir, step) => {
    const stampPath = path.join(projectDir, step.dir, step.stampFile);
    fs.mkdirSync(path.dirname(stampPath), { recursive: true });
    fs.writeFileSync(stampPath, new Date().toISOString());
};

module.exports = { detectRunConfig, needsInstall, markInstalled, listFiles, IGNORED_DIRS };
