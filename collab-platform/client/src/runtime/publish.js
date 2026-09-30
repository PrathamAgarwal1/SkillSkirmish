// runtime/publish.js — builds a project in the browser and publishes it as a static site
// (browser mode). The server stores the files and serves them at <server>/apps/<slug>/.
import axios from 'axios';
import React from 'react';
import Markdown from 'react-markdown';
import * as wc from './webcontainer';
import { notebookHtml } from './notebook';

const STLITE = 'https://cdn.jsdelivr.net/npm/@stlite/browser@1.9.2/build';

const toBase64 = (bytes) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};
const textToBase64 = (text) => toBase64(new TextEncoder().encode(text));

const upload = async (projectId, files, builder) => {
    const { data } = await axios.post(`/api/deployments/${projectId}/publish`, { files, builder });
    return data;
};

const snapshot = async (projectId) => (await axios.get(`/api/execute/snapshot/${projectId}`)).data.files;
const runtimeEnv = async (projectId) => (await axios.get(`/api/execute/runtime-env/${projectId}`).catch(() => ({ data: { env: {} } }))).data.env || {};

// JSON inside a <script> tag must not contain "</script>"
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** A static page that runs the Streamlit app in the visitor's browser with stlite. */
export const stliteHtml = ({ title, entry, files, requirements }) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<link rel="stylesheet" href="${STLITE}/stlite.css">
</head><body><div id="root"></div>
<script id="ss-app" type="application/json">${safeJson({ entry, files, requirements })}</script>
<script type="module">
import { mount } from "${STLITE}/stlite.js";
const app = JSON.parse(document.getElementById("ss-app").textContent);
mount({ entrypoint: app.entry, files: app.files, requirements: app.requirements }, document.getElementById("root"));
</script></body></html>`;

// Files a Streamlit app may read at runtime (code, data, config)
export const STLITE_FILE = /\.(py|csv|tsv|json|txt|md|toml|yaml|yml)$/i;

// import name -> package to install, for packages stlite doesn't load on its own
const IMPORT_PACKAGES = {
    sklearn: 'scikit-learn', scipy: 'scipy', matplotlib: 'matplotlib', seaborn: 'seaborn', statsmodels: 'statsmodels',
    plotly: 'plotly', joblib: 'joblib', PIL: 'pillow', yaml: 'pyyaml', bs4: 'beautifulsoup4', networkx: 'networkx',
    sympy: 'sympy', nltk: 'nltk', xlrd: 'xlrd', openpyxl: 'openpyxl', requests: 'requests'
};

/** Requirements for stlite: requirements.txt plus packages the code imports. */
export const stliteRequirements = (files, requirements = []) => {
    const wanted = new Set(requirements.filter(r => r.supported).map(r => r.spec));
    const names = new Set([...wanted].map(s => s.split(/[<>=!~[\s]/)[0].toLowerCase()));
    for (const [path, code] of Object.entries(files)) {
        if (!path.endsWith('.py')) continue;
        for (const m of code.matchAll(/^\s*(?:import|from)\s+([A-Za-z_]\w*)/gm)) {
            const pkg = IMPORT_PACKAGES[m[1]];
            if (pkg && !names.has(pkg)) { wanted.add(pkg); names.add(pkg); }
        }
    }
    return [...wanted];
};

/**
 * Builds and publishes. `deploy` is the plan from /api/execute/config (engine: wc | stlite | notebook).
 * onLine(text, type) receives progress. Resolves with the server's { deployment }.
 */
export async function buildAndPublish({ projectId, projectName, deploy, install, requirements, onLine }) {
    const log = (text, type = 'info') => onLine && onLine(text, type);

    if (deploy.engine === 'stlite') {
        log('📸 Packaging the Streamlit app (it runs in visitors\' browsers with stlite)…');
        const files = Object.fromEntries((await snapshot(projectId)).filter(f => STLITE_FILE.test(f.path)).map(f => [f.path, f.content]));
        const reqs = stliteRequirements(files, requirements);
        const html = stliteHtml({ title: projectName || 'Streamlit app', entry: deploy.entry, files, requirements: reqs });
        log(`🚀 Publishing ${Object.keys(files).length} files…`);
        return upload(projectId, [{ path: 'index.html', data: textToBase64(html) }], 'Streamlit (stlite)');
    }

    if (deploy.engine === 'notebook') {
        log('📓 Rendering notebooks with their saved outputs…');
        const { renderToStaticMarkup } = await import('react-dom/server');
        const renderMarkdown = (md) => renderToStaticMarkup(React.createElement(Markdown, null, md));
        const all = await snapshot(projectId);
        const pages = [];
        const links = [];
        for (const f of all.filter(x => x.path.endsWith('.ipynb'))) {
            let nb;
            try { nb = JSON.parse(f.content); } catch { log(`⚠ Skipping ${f.path} (not valid JSON)`, 'warning'); continue; }
            const name = `${f.path.replace(/\.ipynb$/, '').replace(/[^a-zA-Z0-9_-]+/g, '__')}.html`;
            pages.push({ path: name, data: textToBase64(notebookHtml(nb, f.path, renderMarkdown)) });
            links.push(`<li><a href="${name}">${f.path}</a></li>`);
        }
        if (!pages.length) throw new Error('No notebooks to publish');
        const index = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notebooks</title>
<body style="font-family:system-ui;max-width:720px;margin:3rem auto;padding:0 1rem"><h1>Notebooks</h1><ul>${links.join('')}</ul>
<p style="color:#666">Run a notebook in the IDE before publishing to include its outputs.</p></body>`;
        log(`🚀 Publishing ${pages.length} notebook(s)…`);
        return upload(projectId, [{ path: 'index.html', data: textToBase64(index) }, ...pages], 'Notebooks');
    }

    // JavaScript projects: install + build in the WebContainer, then upload the output folder
    const env = await runtimeEnv(projectId);
    log('📸 Loading the project into the in-browser runtime…');
    await wc.syncFromServer(projectId);
    await wc.installDependencies(install, { env, onLine: log });
    const root = deploy.root || '';
    if (deploy.build) {
        log(`🔨 Building: ${deploy.build}`);
        const proc = await wc.spawn(deploy.build, { cwd: root, env: { ...env, NODE_ENV: 'production' }, onLine: (l) => log(l) });
        const code = await proc.exit;
        if (code !== 0) throw new Error(`Build failed (exit ${code})`);
        log('✅ Build finished');
    }
    const outDir = [root, deploy.output].filter(x => x && x !== '.').join('/') || '.';
    const files = await wc.readFolder(outDir);
    if (!files.some(f => f.path === 'index.html')) throw new Error(`Build output "${outDir}" has no index.html`);
    const bytes = files.reduce((n, f) => n + f.bytes.length, 0);
    log(`🚀 Publishing ${files.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB)…`);
    return upload(projectId, files.map(f => ({ path: f.path, data: toBase64(f.bytes) })), deploy.build ? deploy.build.replace(/^npx /, '') : 'Static site');
}
