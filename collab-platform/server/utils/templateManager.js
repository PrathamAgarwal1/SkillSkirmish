const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const File = require('../models/File');

// Defines the file structure for each project type (stored in DB)
const templates = {

    // ─── MERN STACK ──────────────────────────────────────────
    'MERN Stack': [
        {
            name: 'package.json', path: 'package.json', content: JSON.stringify({
                name: 'mern-app',
                version: '1.0.0',
                scripts: {
                    dev: 'concurrently "npm run server" "npm run client"',
                    server: 'node server/index.js',
                    client: 'cd client && npm run dev'
                },
                dependencies: {
                    express: '^4.18.0',
                    mongoose: '^7.0.0',
                    cors: '^2.8.5',
                    dotenv: '^16.0.0',
                    concurrently: '^8.0.0'
                }
            }, null, 2)
        },
        { name: 'server', path: 'server', isFolder: true },
        {
            name: 'index.js', path: 'server/index.js', content:
                `const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Example API route
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from MERN API!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
` },
        { name: 'routes', path: 'server/routes', isFolder: true },
        { name: 'models', path: 'server/models', isFolder: true },
        { name: 'client', path: 'client', isFolder: true },
        { name: 'src', path: 'client/src', isFolder: true },
        {
            name: 'App.jsx', path: 'client/src/App.jsx', content:
                `import { useState, useEffect } from 'react';

function App() {
    const [message, setMessage] = useState('Loading...');

    useEffect(() => {
        fetch('/api/hello')
            .then(res => res.json())
            .then(data => setMessage(data.message))
            .catch(() => setMessage('Could not reach API'));
    }, []);

    return (
        <div style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '4rem' }}>
            <h1>MERN Stack App</h1>
            <p>{message}</p>
        </div>
    );
}

export default App;
` },
        {
            name: 'main.jsx', path: 'client/src/main.jsx', content:
                `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
` },
        {
            name: 'index.html', path: 'client/index.html', content:
                `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>MERN App</title></head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
` },
        {
            name: 'package.json', path: 'client/package.json', content: JSON.stringify({
                name: 'mern-client',
                version: '1.0.0',
                type: 'module',
                scripts: { dev: 'vite' },
                dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                devDependencies: { vite: '^4.0.0', '@vitejs/plugin-react': '^3.0.0' }
            }, null, 2)
        },
    ],

    // ─── MERN STACK (Full Template — kept for restore) ──────
    'MERN-Template': [
        // Same as MERN Stack above — kept as alias
    ],

    // ─── REACT APP ───────────────────────────────────────────
    'React App': [
        {
            name: 'package.json', path: 'package.json', content: JSON.stringify({
                name: 'react-app',
                version: '1.0.0',
                type: 'module',
                scripts: { dev: 'vite', build: 'vite build' },
                dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                devDependencies: { vite: '^4.0.0', '@vitejs/plugin-react': '^3.0.0' }
            }, null, 2)
        },
        { name: 'public', path: 'public', isFolder: true },
        {
            name: 'index.html', path: 'index.html', content:
                `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>React App</title></head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
` },
        { name: 'src', path: 'src', isFolder: true },
        {
            name: 'main.jsx', path: 'src/main.jsx', content:
                `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
` },
        {
            name: 'App.jsx', path: 'src/App.jsx', content:
                `import { useState } from 'react';

function App() {
    const [count, setCount] = useState(0);

    return (
        <div style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '4rem' }}>
            <h1>React App</h1>
            <p>Count: {count}</p>
            <button onClick={() => setCount(c => c + 1)}>Increment</button>
        </div>
    );
}

export default App;
` },
        {
            name: 'App.css', path: 'src/App.css', content:
                `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; }
button { padding: 10px 20px; font-size: 1rem; cursor: pointer; border-radius: 6px; border: none; background: #0f3460; color: white; }
button:hover { background: #16213e; }
` }
    ],

    // ─── NODE.JS API ─────────────────────────────────────────
    'Node.js API': [
        {
            name: 'package.json', path: 'package.json', content: JSON.stringify({
                name: 'node-api',
                version: '1.0.0',
                scripts: { start: 'node index.js', dev: 'node --watch index.js' },
                dependencies: { express: '^4.18.0', cors: '^2.8.5', dotenv: '^16.0.0' }
            }, null, 2)
        },
        {
            name: 'index.js', path: 'index.js', content:
                `const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Sample data
let items = [
    { id: 1, name: 'Item 1', description: 'First item' },
    { id: 2, name: 'Item 2', description: 'Second item' },
];

// GET all items
app.get('/api/items', (req, res) => {
    res.json(items);
});

// GET single item
app.get('/api/items/:id', (req, res) => {
    const item = items.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
});

// POST new item
app.post('/api/items', (req, res) => {
    const item = { id: items.length + 1, ...req.body };
    items.push(item);
    res.status(201).json(item);
});

// DELETE item
app.delete('/api/items/:id', (req, res) => {
    items = items.filter(i => i.id !== parseInt(req.params.id));
    res.json({ message: 'Deleted' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(\`API Server running on port \${PORT}\`));
` },
        { name: 'routes', path: 'routes', isFolder: true },
        { name: '.env', path: '.env', content: 'PORT=5000\n' }
    ],

    // ─── VANILLA WEB ─────────────────────────────────────────
    'Vanilla Web': [
        {
            name: 'index.html', path: 'index.html', content:
                `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vanilla Web App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Welcome to Vanilla Web</h1>
        <p>Build with plain HTML, CSS, and JavaScript.</p>
        <button id="btn">Click Me</button>
        <p id="output"></p>
    </div>
    <script src="script.js"></script>
</body>
</html>
` },
        {
            name: 'style.css', path: 'style.css', content:
                `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { text-align: center; }
h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #58a6ff; }
p { margin-bottom: 1rem; font-size: 1.1rem; }
button { padding: 12px 24px; font-size: 1rem; cursor: pointer; border: none; border-radius: 8px; background: #238636; color: white; transition: background 0.2s; }
button:hover { background: #2ea043; }
` },
        {
            name: 'script.js', path: 'script.js', content:
                `let clickCount = 0;
const btn = document.getElementById('btn');
const output = document.getElementById('output');

btn.addEventListener('click', () => {
    clickCount++;
    output.textContent = \`Clicked \${clickCount} time(s)!\`;
    console.log('Button clicked:', clickCount);
});

console.log('Page loaded successfully');
` }
    ],

    // ─── EXPRESS + EJS ───────────────────────────────────────
    'Express + EJS': [
        {
            name: 'package.json', path: 'package.json', content: JSON.stringify({
                name: 'express-ejs-app',
                version: '1.0.0',
                scripts: { start: 'node app.js', dev: 'node --watch app.js' },
                dependencies: { express: '^4.18.0', ejs: '^3.1.9' }
            }, null, 2)
        },
        {
            name: 'app.js', path: 'app.js', content:
                `const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

let todos = ['Learn Express', 'Build an app', 'Deploy it'];

app.get('/', (req, res) => {
    res.render('index', { title: 'Express + EJS App', todos });
});

app.post('/add', (req, res) => {
    if (req.body.todo) todos.push(req.body.todo);
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on http://localhost:\${PORT}\`));
` },
        { name: 'views', path: 'views', isFolder: true },
        {
            name: 'index.ejs', path: 'views/index.ejs', content:
                `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title><%= title %></title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="container">
        <h1><%= title %></h1>
        <form action="/add" method="POST">
            <input type="text" name="todo" placeholder="Add a to-do..." required />
            <button type="submit">Add</button>
        </form>
        <ul>
            <% todos.forEach(todo => { %>
                <li><%= todo %></li>
            <% }) %>
        </ul>
    </div>
</body>
</html>
` },
        { name: 'public', path: 'public', isFolder: true },
        {
            name: 'style.css', path: 'public/style.css', content:
                `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; background: #161b22; color: #c9d1d9; display: flex; justify-content: center; padding-top: 3rem; }
.container { width: 500px; }
h1 { color: #58a6ff; margin-bottom: 1.5rem; }
form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
input { flex: 1; padding: 10px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; border-radius: 6px; font-size: 1rem; }
button { padding: 10px 20px; border: none; background: #238636; color: white; border-radius: 6px; cursor: pointer; font-size: 1rem; }
button:hover { background: #2ea043; }
ul { list-style: none; }
li { padding: 10px; border-bottom: 1px solid #21262d; font-size: 1rem; }
` }
    ]
};

/**
 * Sync a file or folder to disk under projects/<projectId>/
 */
const syncToDisk = (projectId, filePath, content, isFolder = false) => {
    const fullPath = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString(), filePath);
    try {
        if (isFolder) {
            if (!fsSync.existsSync(fullPath)) {
                fsSync.mkdirSync(fullPath, { recursive: true });
            }
        } else {
            const dir = path.dirname(fullPath);
            if (!fsSync.existsSync(dir)) {
                fsSync.mkdirSync(dir, { recursive: true });
            }
            fsSync.writeFileSync(fullPath, content || '');
        }
    } catch (err) {
        console.error('Error syncing template file to disk:', err);
    }
};

/**
 * Sync ALL project files from MongoDB to disk (ensures disk matches DB)
 */
const syncAllFilesToDisk = async (projectId) => {
    try {
        const files = await File.find({ project: projectId });
        const projectDir = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());
        
        if (!fsSync.existsSync(projectDir)) {
            fsSync.mkdirSync(projectDir, { recursive: true });
        }

        for (const file of files) {
            syncToDisk(projectId, file.path, file.content || '', file.isFolder || false);
        }
        console.log(`[syncAllFilesToDisk] Synced ${files.length} files for project ${projectId}`);
    } catch (err) {
        console.error('[syncAllFilesToDisk] Error:', err);
    }
};

/**
 * Run npm install in a project directory
 * Returns a promise that resolves when install completes
 */
const installDependencies = (projectPath) => {
    return new Promise((resolve, reject) => {
        if (!fsSync.existsSync(path.join(projectPath, 'package.json'))) {
            return resolve({ success: true, message: 'No package.json found, skipping install' });
        }

        console.log(`[installDependencies] Running npm install in ${projectPath}`);

        const npmProcess = spawn('npm', ['install', '--legacy-peer-deps'], {
            cwd: projectPath,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        let output = '';
        let errorOutput = '';

        npmProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        npmProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        npmProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`[installDependencies] npm install completed successfully`);
                resolve({ success: true, message: 'Dependencies installed', output });
            } else {
                console.error(`[installDependencies] npm install failed with code ${code}`);
                // Don't reject — install failure shouldn't crash project creation
                resolve({ success: false, message: `npm install failed (code ${code})`, error: errorOutput });
            }
        });

        npmProcess.on('error', (err) => {
            console.error(`[installDependencies] spawn error:`, err);
            resolve({ success: false, message: err.message });
        });

        // Timeout after 2 minutes
        setTimeout(() => {
            try { npmProcess.kill('SIGTERM'); } catch (e) { }
            resolve({ success: false, message: 'npm install timed out after 2 minutes' });
        }, 120000);
    });
};

/**
 * Create project files in the database from template definitions
 * Then sync to disk and auto-install dependencies
 */
const createProjectFiles = async (projectType, projectId) => {
    const template = templates[projectType];
    if (!template || template.length === 0) {
        // Fallback for unknown project types
        const fallback = new File({
            name: 'index.js',
            path: 'index.js',
            content: '// Your code here',
            project: projectId,
        });
        await fallback.save();
        syncToDisk(projectId, 'index.js', '// Your code here');
        return;
    }

    for (const item of template) {
        const newFile = new File({
            name: item.name,
            path: item.path,
            isFolder: item.isFolder || false,
            content: item.content || '',
            project: projectId
        });
        await newFile.save();
        // Also sync to disk so files can be executed locally
        syncToDisk(projectId, item.path, item.content || '', item.isFolder || false);
    }

    // Auto-install dependencies after creating files
    const projectPath = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());
    const pkgJsonPath = path.join(projectPath, 'package.json');
    if (fsSync.existsSync(pkgJsonPath)) {
        console.log(`[createProjectFiles] Auto-installing dependencies for ${projectType}...`);
        const result = await installDependencies(projectPath);
        console.log(`[createProjectFiles] Install result:`, result.message);
    }
};

module.exports = { createProjectFiles, syncAllFilesToDisk, installDependencies };