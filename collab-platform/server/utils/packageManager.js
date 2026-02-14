const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Popular packages registry by project type — curated libraries with descriptions
 */
const PACKAGE_REGISTRY = {
    'MERN Stack': {
        'mongoose': { version: '7.x', description: 'MongoDB object modeling — define schemas, validate data, query DB' },
        'jsonwebtoken': { version: '9.x', description: 'JWT authentication — create and verify login tokens' },
        'bcryptjs': { version: '2.x', description: 'Password hashing — securely store user passwords' },
        'axios': { version: '1.x', description: 'HTTP client — make API requests from React frontend' },
        'react-router-dom': { version: '6.x', description: 'Client-side routing — multi-page React navigation' },
        'socket.io': { version: '4.x', description: 'Real-time communication — live chat, notifications' },
        'multer': { version: '1.x', description: 'File upload handling — accept images, documents' },
        'dotenv': { version: '16.x', description: 'Environment variables — store secrets safely' },
        'redux': { version: '4.x', description: 'Global state management for React' },
        'zustand': { version: '4.x', description: 'Lightweight state management — simpler than Redux' },
    },
    'React App': {
        'react-router-dom': { version: '6.x', description: 'Client-side routing — navigate between pages' },
        'axios': { version: '1.x', description: 'HTTP client — fetch data from APIs' },
        'redux': { version: '4.x', description: 'Predictable state container for complex apps' },
        'zustand': { version: '4.x', description: 'Lightweight state management — simple API' },
        'framer-motion': { version: '10.x', description: 'Animation library — page transitions, gestures' },
        'react-query': { version: '5.x', description: 'Server state management — caching, refetching' },
        'react-hook-form': { version: '7.x', description: 'Form handling — validation, error messages' },
        'tailwindcss': { version: '3.x', description: 'Utility-first CSS framework — rapid styling' },
        'react-icons': { version: '4.x', description: 'Icon library — 1000s of icons from popular sets' },
        'chart.js': { version: '4.x', description: 'Charts and graphs — bar, line, pie, radar' },
    },
    'Node.js API': {
        'express': { version: '4.x', description: 'Web framework — routing, middleware, HTTP handling' },
        'mongoose': { version: '7.x', description: 'MongoDB ODM — schemas, queries, data modeling' },
        'cors': { version: '2.x', description: 'Cross-Origin Resource Sharing — allow frontend requests' },
        'dotenv': { version: '16.x', description: 'Environment variables — store secrets and config' },
        'jsonwebtoken': { version: '9.x', description: 'JWT tokens — stateless authentication' },
        'bcryptjs': { version: '2.x', description: 'Password hashing — secure user credentials' },
        'socket.io': { version: '4.x', description: 'WebSocket server — real-time bidirectional events' },
        'joi': { version: '17.x', description: 'Data validation — validate request bodies/params' },
        'helmet': { version: '7.x', description: 'Security headers — protect against common attacks' },
        'morgan': { version: '1.x', description: 'HTTP request logger — log method, status, time' },
    },
    'Vanilla Web': {
        'lodash': { version: '4.x', description: 'Utility functions — arrays, objects, strings' },
        'gsap': { version: '3.x', description: 'Animation engine — smooth, high-performance animations' },
        'three': { version: '0.x', description: '3D graphics — WebGL scenes, models, effects' },
        'chart.js': { version: '4.x', description: 'Charts and graphs — bar, line, pie, doughnut' },
        'dayjs': { version: '1.x', description: 'Date handling — parse, format, manipulate dates' },
        'sortablejs': { version: '1.x', description: 'Drag-and-drop — reorderable lists and grids' },
    },
    'Express + EJS': {
        'express': { version: '4.x', description: 'Web framework — routing, middleware, templating' },
        'ejs': { version: '3.x', description: 'Template engine — embed JavaScript in HTML' },
        'mongoose': { version: '7.x', description: 'MongoDB ODM — store and query data' },
        'express-session': { version: '1.x', description: 'Session management — login persistence' },
        'connect-flash': { version: '0.x', description: 'Flash messages — success/error notifications' },
        'multer': { version: '1.x', description: 'File uploads — handle multipart form data' },
        'dotenv': { version: '16.x', description: 'Environment variables — config management' },
        'method-override': { version: '3.x', description: 'HTTP method override — PUT/DELETE in forms' },
    }
};

/**
 * Install a package into a project
 */
const installPackage = (projectId, packageName, projectType, projectPath) => {
    return new Promise((resolve, reject) => {
        // Determine package manager and command
        let command, args;

        command = 'npm';
        args = ['install', packageName, '--save'];

        // Spawn install process
        const process = spawn(command, args, {
            cwd: projectPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve({
                    success: true,
                    message: `✓ ${packageName} installed successfully`,
                    output
                });
            } else {
                reject({
                    success: false,
                    message: `Failed to install ${packageName}`,
                    error: error || output
                });
            }
        });

        process.on('error', (err) => {
            reject({
                success: false,
                message: `Installation error: ${err.message}`,
                error: err.message
            });
        });
    });
};

/**
 * Get list of popular packages for a project type
 */
const getPackageList = (projectType) => {
    const packages = PACKAGE_REGISTRY[projectType] || [];
    return Object.entries(packages).map(([name, info]) => ({
        name,
        ...info
    }));
};

/**
 * Read installed packages from package.json
 */
const getInstalledPackages = (projectPath) => {
    try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            return {
                dependencies: Object.keys(packageJson.dependencies || {}),
                devDependencies: Object.keys(packageJson.devDependencies || {})
            };
        }
        return { dependencies: [], devDependencies: [] };
    } catch (err) {
        console.error('Error reading package.json:', err);
        return { dependencies: [], devDependencies: [] };
    }
};

/**
 * Initialize a new project with template files
 */
const initializeProject = (projectType, projectPath) => {
    try {
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        const templates = {
            'MERN Stack': {
                'package.json': {
                    name: 'mern-app', version: '1.0.0',
                    scripts: { dev: 'concurrently "npm run server" "npm run client"', server: 'node server/index.js', client: 'cd client && npm run dev' },
                    dependencies: { express: '^4.18.0', mongoose: '^7.0.0', cors: '^2.8.5', dotenv: '^16.0.0', concurrently: '^8.0.0' }
                },
                'server/index.js': `const express = require('express');\nconst cors = require('cors');\nconst app = express();\napp.use(cors());\napp.use(express.json());\napp.get('/api/hello', (req, res) => res.json({ message: 'Hello from MERN API!' }));\nconst PORT = process.env.PORT || 5000;\napp.listen(PORT, () => console.log('Server on port ' + PORT));`,
                'client/package.json': {
                    name: 'mern-client', version: '1.0.0', type: 'module',
                    scripts: { dev: 'vite' },
                    dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                    devDependencies: { vite: '^4.0.0', '@vitejs/plugin-react': '^3.0.0' }
                },
                'client/index.html': `<!DOCTYPE html>\n<html><head><title>MERN App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
                'client/src/main.jsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
                'client/src/App.jsx': `import { useState, useEffect } from 'react';\nfunction App() {\n  const [msg, setMsg] = useState('Loading...');\n  useEffect(() => { fetch('/api/hello').then(r=>r.json()).then(d=>setMsg(d.message)).catch(()=>setMsg('API offline')); }, []);\n  return <div style={{textAlign:'center',marginTop:'4rem'}}><h1>MERN Stack</h1><p>{msg}</p></div>;\n}\nexport default App;`,
            },
            'React App': {
                'package.json': {
                    name: 'react-app', version: '1.0.0', type: 'module',
                    scripts: { dev: 'vite', build: 'vite build' },
                    dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                    devDependencies: { vite: '^4.0.0', '@vitejs/plugin-react': '^3.0.0' }
                },
                'index.html': `<!DOCTYPE html>\n<html><head><title>React App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
                'src/main.jsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
                'src/App.jsx': `import { useState } from 'react';\nfunction App() {\n  const [count, setCount] = useState(0);\n  return <div style={{textAlign:'center',marginTop:'4rem'}}><h1>React App</h1><p>Count: {count}</p><button onClick={()=>setCount(c=>c+1)}>Increment</button></div>;\n}\nexport default App;`,
            },
            'Node.js API': {
                'package.json': {
                    name: 'node-api', version: '1.0.0',
                    scripts: { start: 'node index.js', dev: 'node --watch index.js' },
                    dependencies: { express: '^4.18.0', cors: '^2.8.5', dotenv: '^16.0.0' }
                },
                'index.js': `const express = require('express');\nconst cors = require('cors');\nconst app = express();\napp.use(cors());\napp.use(express.json());\napp.get('/api/items', (req, res) => res.json([{id:1,name:'Item 1'},{id:2,name:'Item 2'}]));\nconst PORT = process.env.PORT || 5000;\napp.listen(PORT, () => console.log('API running on port ' + PORT));`,
                '.env': 'PORT=5000\n',
            },
            'Vanilla Web': {
                'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Vanilla Web</title><link rel="stylesheet" href="style.css"></head>\n<body><div class="container"><h1>Vanilla Web</h1><p>Plain HTML, CSS & JS</p><button id="btn">Click Me</button><p id="output"></p></div><script src="script.js"></script></body></html>`,
                'style.css': `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:sans-serif; background:#0d1117; color:#c9d1d9; display:flex; justify-content:center; align-items:center; min-height:100vh; }\n.container { text-align:center; }\nh1 { color:#58a6ff; margin-bottom:1rem; }\nbutton { padding:12px 24px; border:none; border-radius:8px; background:#238636; color:#fff; cursor:pointer; font-size:1rem; }`,
                'script.js': `let count = 0;\ndocument.getElementById('btn').addEventListener('click', () => {\n  count++;\n  document.getElementById('output').textContent = 'Clicked ' + count + ' time(s)';\n});\nconsole.log('Page loaded');`,
            },
            'Express + EJS': {
                'package.json': {
                    name: 'express-ejs-app', version: '1.0.0',
                    scripts: { start: 'node app.js', dev: 'node --watch app.js' },
                    dependencies: { express: '^4.18.0', ejs: '^3.1.9' }
                },
                'app.js': `const express = require('express');\nconst path = require('path');\nconst app = express();\napp.set('view engine', 'ejs');\napp.set('views', path.join(__dirname, 'views'));\napp.use(express.static(path.join(__dirname, 'public')));\napp.use(express.urlencoded({ extended: true }));\nlet todos = ['Learn Express', 'Build an app'];\napp.get('/', (req, res) => res.render('index', { title: 'Express + EJS', todos }));\napp.post('/add', (req, res) => { if (req.body.todo) todos.push(req.body.todo); res.redirect('/'); });\nconst PORT = 3000;\napp.listen(PORT, () => console.log('Server on http://localhost:' + PORT));`,
                'views/index.ejs': `<!DOCTYPE html><html><head><title><%=title%></title><link rel="stylesheet" href="/style.css"></head><body><div class="container"><h1><%=title%></h1><form action="/add" method="POST"><input name="todo" placeholder="Add to-do..." required/><button type="submit">Add</button></form><ul><% todos.forEach(t => { %><li><%=t%></li><% }) %></ul></div></body></html>`,
                'public/style.css': `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:sans-serif; background:#161b22; color:#c9d1d9; display:flex; justify-content:center; padding-top:3rem; }\n.container { width:500px; }\nh1 { color:#58a6ff; margin-bottom:1.5rem; }\nform { display:flex; gap:.5rem; margin-bottom:1.5rem; }\ninput { flex:1; padding:10px; border:1px solid #30363d; background:#0d1117; color:#c9d1d9; border-radius:6px; }\nbutton { padding:10px 20px; border:none; background:#238636; color:#fff; border-radius:6px; cursor:pointer; }\nli { padding:10px; border-bottom:1px solid #21262d; }`,
            }
        };

        const template = templates[projectType];
        if (!template) return false;

        // Create files
        Object.entries(template).forEach(([filePath, content]) => {
            const fullPath = path.join(projectPath, filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (typeof content === 'object') {
                fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
            } else {
                fs.writeFileSync(fullPath, content);
            }
        });

        return true;
    } catch (err) {
        console.error('Error initializing project:', err);
        return false;
    }
};

module.exports = {
    installPackage,
    getPackageList,
    getInstalledPackages,
    initializeProject,
    PACKAGE_REGISTRY
};
