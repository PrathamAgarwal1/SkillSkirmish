// Projects without a package.json: what gets created so they run (sandbox/scaffold.js + runConfig).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planScaffold, importsOf } = require('../sandbox/scaffold');
const { detectRunConfig, listFiles } = require('../sandbox/runConfig');
const { browserPlan } = require('../sandbox/browserPlan');

function project(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-scaffold-'));
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}
const plan = (files, name) => { const dir = project(files); return planScaffold(dir, listFiles(dir), name); };
const pkgOf = (p) => JSON.parse(p.files['package.json']);

describe('scaffold: projects without a package.json', () => {
    test('reads npm packages from import/require lines, ignoring built-ins, relative paths and aliases', () => {
        const deps = importsOf(`
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import Button from '@mui/material/Button';
            import './styles.css';
            import x from '@/components/x';
            const fs = require('fs');
            const p = require('node:path');
            const axios = require("axios");
            export { thing } from 'lodash/fp';
            const lazy = import('dayjs');
        `);
        assert.deepEqual([...deps].sort(), ['@mui/material', 'axios', 'dayjs', 'lodash', 'react', 'react-dom']);
    });

    test('Create React App layout (JSX in .js, public/index.html) becomes a Vite app', () => {
        const p = plan({
            'public/index.html': '<!doctype html><html><head><title>Todo</title></head><body><div id="root"></div></body></html>',
            'src/index.js': "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n",
            'src/App.js': "import { useState } from 'react';\nimport axios from 'axios';\nexport default function App() { return (<div>Hi</div>); }\n"
        }, 'Todo App');
        assert.equal(p.kind, 'react');
        assert.equal(p.entry, 'src/index.js');
        const pkg = pkgOf(p);
        assert.equal(pkg.name, 'todo-app');
        assert.ok(pkg.dependencies.react && pkg.dependencies['react-dom'] && pkg.dependencies.axios);
        assert.ok(pkg.devDependencies.vite && pkg.devDependencies['@vitejs/plugin-react']);
        assert.match(p.files['index.html'], /<script type="module" src="\/src\/index\.js"><\/script>/);
        assert.match(p.files['index.html'], /<title>Todo<\/title>/);
        assert.match(p.files['vite.config.js'], /loader: 'jsx'/, 'JSX in .js files needs the jsx loader');
    });

    test('just an App.jsx gets a main.jsx and an index.html', () => {
        const p = plan({ 'App.jsx': 'export default function App() { return <h1>Hello</h1>; }\n' });
        assert.equal(p.kind, 'react');
        assert.equal(p.entry, 'main.jsx');
        assert.match(p.files['main.jsx'], /import App from '\.\/App';/);
        assert.match(p.files['main.jsx'], /createRoot\(document\.getElementById\('root'\)\)/);
        assert.match(p.files['index.html'], /src="\/main\.jsx"/);
        assert.doesNotMatch(p.files['vite.config.js'], /loader: 'jsx'/);
    });

    test('an Express server gets a start script and its packages', () => {
        const p = plan({ 'server.js': "const express = require('express');\nconst cors = require('cors');\nconst app = express();\napp.listen(process.env.PORT || 3000);\n", 'routes/users.js': "const { Router } = require('express');\n" });
        assert.equal(p.kind, 'node');
        assert.equal(p.server, true);
        const pkg = pkgOf(p);
        assert.equal(pkg.scripts.start, 'node server.js');
        assert.deepEqual(Object.keys(pkg.dependencies), ['cors', 'express']);
        assert.equal(pkg.type, undefined, 'CommonJS stays CommonJS');
    });

    test('ES modules get "type": "module"; TypeScript runs with tsx', () => {
        const esm = pkgOf(plan({ 'index.js': "import chalk from 'chalk';\nconsole.log(chalk.green('hi'));\n" }));
        assert.equal(esm.type, 'module');
        assert.equal(esm.scripts.start, 'node index.js');
        const ts = pkgOf(plan({ 'src/main.ts': "const x: number = 1;\nconsole.log(x);\n" }));
        assert.equal(ts.scripts.start, 'tsx src/main.ts');
        assert.ok(ts.devDependencies.tsx);
    });

    test('nothing to do when there is a package.json, or no JavaScript', () => {
        assert.equal(plan({ 'package.json': '{}', 'index.js': "require('express')" }), null);
        assert.equal(plan({ 'main.py': 'print(1)' }), null);
    });

    test('run config: npm imports get "Set up and run"; plain websites stay static sites', () => {
        const server = project({ 'server.js': "const express = require('express');\nexpress().listen(3000);\n" });
        const cfg = detectRunConfig(server, '', 'api');
        assert.ok(cfg.scaffold);
        assert.equal(cfg.targets[0].id, 'setup');
        assert.equal(browserPlan(cfg, server, listFiles(server)).targets[0].engine, 'setup');

        const site = project({ 'index.html': '<script src="script.js"></script>', 'script.js': "document.body.append('hi');\n" });
        assert.equal(detectRunConfig(site).label, 'Static website');

        const script = project({ 'hello.js': "console.log('hi');\n" });
        assert.ok(detectRunConfig(script).scaffold, 'a lone script still gets a Run button');

        const py = project({ 'app.py': 'import streamlit as st\n', 'helper.js': "require('lodash')" });
        assert.equal(detectRunConfig(py).scaffold, undefined, 'Python apps are left alone');
    });

    test('after setup the project is detected normally (Vite app / Node server)', () => {
        const dir = project({ 'App.jsx': 'export default function App() { return <p>x</p>; }\n' });
        const p = planScaffold(dir, listFiles(dir));
        for (const [rel, content] of Object.entries(p.files)) fs.writeFileSync(path.join(dir, rel), content);
        const cfg = detectRunConfig(dir);
        assert.equal(cfg.label, 'Vite app');
        assert.equal(cfg.scaffold, undefined);

        const api = project({ 'index.js': "const express = require('express');\nexpress().listen(3000);\n" });
        const p2 = planScaffold(api, listFiles(api));
        fs.writeFileSync(path.join(api, 'package.json'), p2.files['package.json']);
        assert.equal(detectRunConfig(api).label, 'Node.js server');
    });
});
