// sandbox/scaffold.js — JavaScript projects without a package.json: works out what to create so they run.
//
//   React (any .jsx/.tsx, or code importing react)  -> package.json for Vite + React, vite.config.js,
//                                                       an entry (main.jsx) and index.html when missing
//   Node (everything else)                           -> package.json with a start script for the entry file
//
// Dependencies come from the import/require lines in the code. Nothing is written here; planScaffold()
// returns the files and the runner writes them when the user presses Run.
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const SOURCE = /\.(m?js|cjs|jsx|tsx?)$/;
const SKIP_DIRS = /(^|\/)(node_modules|dist|build|\.next|out|coverage)\//;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const SERVER_LIBS = ['express', 'fastify', 'koa', 'hono', '@nestjs/core', 'http-server'];
const ENTRY_NAMES = ['index', 'server', 'app', 'main'];
const MAX_FILES_SCANNED = 400;

const read = (dir, rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return ''; } };

/** The npm package a bare import refers to ("react-dom/client" -> "react-dom"), or null. */
function packageOf(spec) {
    if (!spec || /^[./~]|^[a-z]+:/i.test(spec) || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])) return null;
    const parts = spec.split('/');
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    return NPM_NAME.test(name) && !name.startsWith('@/') ? name.toLowerCase() : null;
}

/** Bare package names imported anywhere in `code`. */
function importsOf(code) {
    const out = new Set();
    const patterns = [
        /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"\n]+)['"]/g,
        /\bexport\s+[\w*{}\s,$]+\s+from\s+['"]([^'"\n]+)['"]/g,
        /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
        /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g
    ];
    for (const re of patterns) for (const m of code.matchAll(re)) { const p = packageOf(m[1]); if (p) out.add(p); }
    return out;
}

const looksLikeJsx = (code) => /<\/?[A-Z][\w.]*[\s/>]|return\s*\(\s*<|<>\s*$/m.test(code);

/**
 * What to create so the project runs, or null when nothing applies (there's a package.json, it isn't a
 * JavaScript project, ...). `files` are project-relative paths.
 */
function planScaffold(dir, files, projectName = 'my-app') {
    if (files.some(f => f.endsWith('package.json') && !f.includes('node_modules/'))) return null;
    const sources = files.filter(f => SOURCE.test(f) && !SKIP_DIRS.test(`${f}`) && !f.endsWith('.d.ts')).slice(0, MAX_FILES_SCANNED);
    if (!sources.length) return null;

    const code = Object.fromEntries(sources.map(f => [f, read(dir, f)]));
    const deps = new Set();
    for (const c of Object.values(code)) importsOf(c).forEach(d => deps.add(d));
    const typescript = sources.some(f => /\.tsx?$/.test(f));

    const isReact = deps.has('react') || sources.some(f => /\.(jsx|tsx)$/.test(f)) ||
        sources.some(f => /\.js$/.test(f) && /from\s+['"]react['"]/.test(code[f]));
    const name = String(projectName).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'my-app';

    if (isReact) return planReact(dir, files, sources, code, deps, name, typescript);
    return planNode(sources, code, deps, name);
}

function planReact(dir, files, sources, code, deps, name, typescript) {
    deps.delete('react'); deps.delete('react-dom'); deps.delete('vite'); deps.delete('@vitejs/plugin-react');
    const create = {};
    const notes = [];

    // The entry: a file that mounts React, or a new main.jsx next to App
    let entry = sources.find(f => /createRoot\s*\(|ReactDOM\.render\s*\(|hydrateRoot\s*\(/.test(code[f]));
    let mountId = 'root';
    if (entry) {
        const m = /getElementById\(\s*['"]([\w-]+)['"]\s*\)/.exec(code[entry]);
        if (m) mountId = m[1];
    } else {
        const app = sources.find(f => /(^|\/)App\.(jsx|tsx|js|ts)$/.test(f)) || sources.find(f => /\.(jsx|tsx)$/.test(f));
        if (!app) return null;
        const appDir = path.posix.dirname(app) === '.' ? '' : `${path.posix.dirname(app)}/`;
        entry = `${appDir}main.${typescript ? 'tsx' : 'jsx'}`;
        const importName = `./${path.posix.basename(app).replace(/\.(jsx|tsx|js|ts)$/, '')}`;
        const exportsDefault = /export\s+default/.test(code[app]);
        const appName = exportsDefault ? 'App' : ((/export\s+(?:function|const|class)\s+(\w+)/.exec(code[app]) || [])[1] || 'App');
        const importLine = exportsDefault ? `import App from '${importName}';` : `import { ${appName} as App } from '${importName}';`;
        const css = sources.length && files.find(f => f === `${appDir}index.css`);
        create[entry] = `import React from 'react';
import { createRoot } from 'react-dom/client';
${importLine}
${css ? "import './index.css';\n" : ''}
createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
`;
        notes.push(`${entry} (starts the app)`);
    }

    // index.html at the top, pointing at the entry
    const scriptTag = `<script type="module" src="/${entry}"></script>`;
    if (!files.includes('index.html')) {
        const old = read(dir, 'public/index.html');
        const title = (/<title>([^<]*)<\/title>/i.exec(old) || [])[1] || name;
        create['index.html'] = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/[<>&]/g, '')}</title>
  </head>
  <body>
    <div id="${mountId}"></div>
    ${scriptTag}
  </body>
</html>
`;
        notes.push('index.html');
    } else {
        const html = read(dir, 'index.html');
        if (!/<script[^>]+type=["']module["']/i.test(html)) {
            create['index.html'] = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `  ${scriptTag}\n  </body>`) : `${html}\n${scriptTag}\n`;
            if (!new RegExp(`id=["']${mountId}["']`).test(html)) create['index.html'] = create['index.html'].replace(scriptTag, `<div id="${mountId}"></div>\n    ${scriptTag}`);
            notes.push('index.html (added the script tag)');
        }
    }

    // JSX inside plain .js files (Create React App style) needs a loader setting
    const jsxInJs = sources.some(f => /\.js$/.test(f) && looksLikeJsx(code[f]));
    if (!files.some(f => /^vite\.config\.(m?js|ts)$/.test(f))) {
        create['vite.config.js'] = jsxInJs
            ? `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// JSX is written in .js files here, so Vite is told to read them as JSX
export default defineConfig({
    plugins: [react({ include: /\\.(js|jsx|ts|tsx)$/ })],
    esbuild: { loader: 'jsx', include: /.*\\.jsx?$/, exclude: [] },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } }
});
`
            : `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()]
});
`;
        notes.push('vite.config.js');
    }

    const pkg = {
        name,
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: Object.fromEntries([['react', '^18.3.1'], ['react-dom', '^18.3.1'], ...[...deps].sort().map(d => [d, 'latest'])]),
        devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0', ...(typescript ? { typescript: '^5.5.0' } : {}) }
    };
    create['package.json'] = `${JSON.stringify(pkg, null, 2)}\n`;
    return {
        kind: 'react',
        label: 'React app (needs setup)',
        entry,
        deps: [...deps].sort(),
        files: create,
        summary: `package.json (React + Vite${deps.size ? `, ${[...deps].sort().join(', ')}` : ''}), ${notes.join(', ') || 'no other files'}`.replace(/, no other files$/, '')
    };
}

function planNode(sources, code, deps, name) {
    // Entry: a top-level index/server/app/main file, then the same in src/, then a file that starts a server
    const candidates = [];
    for (const dirName of ['', 'src/']) {
        for (const base of ENTRY_NAMES) for (const ext of ['js', 'mjs', 'cjs', 'ts']) candidates.push(`${dirName}${base}.${ext}`);
    }
    let entry = candidates.find(c => sources.includes(c)) ||
        sources.find(f => /\.listen\s*\(|createServer\s*\(/.test(code[f])) ||
        sources.filter(f => !f.includes('/')).sort()[0] || sources.sort()[0];
    if (!entry) return null;

    const esm = /^\s*(import\s[\s\S]*?from\s+['"]|import\s+['"]|export\s)/m.test(code[entry]) && !/\brequire\(/.test(code[entry]);
    const ts = /\.ts$/.test(entry);
    const pkg = {
        name,
        private: true,
        version: '1.0.0',
        ...(esm && !entry.endsWith('.cjs') ? { type: 'module' } : {}),
        main: entry,
        scripts: { start: ts ? `tsx ${entry}` : `node ${entry}` },
        dependencies: Object.fromEntries([...deps].sort().map(d => [d, 'latest'])),
        ...(ts ? { devDependencies: { tsx: '^4.19.0', typescript: '^5.5.0' } } : {})
    };
    const server = [...deps].some(d => SERVER_LIBS.includes(d)) || /\.listen\s*\(/.test(code[entry]);
    return {
        kind: 'node',
        label: server ? 'Node.js server (needs setup)' : 'Node.js (needs setup)',
        entry,
        server,
        deps: [...deps].sort(),
        files: { 'package.json': `${JSON.stringify(pkg, null, 2)}\n` },
        summary: `package.json (runs ${entry}${deps.size ? `, installs ${[...deps].sort().join(', ')}` : ''})`
    };
}

module.exports = { planScaffold, importsOf, packageOf };
