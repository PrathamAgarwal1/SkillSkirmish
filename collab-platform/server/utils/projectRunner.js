const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const Project = require('../models/Project');
const File = require('../models/File');
const { syncAllFilesToDisk, installDependencies } = require('./templateManager');
const { analyzeProject } = require('../services/aiService');

// Store running processes
const runningProcesses = new Map();

/* ---------------------------------------------------------
   PORT UTILITIES — find an available port automatically
--------------------------------------------------------- */
const isPortAvailable = (port) => {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
};

const findAvailablePort = async (startPort = 3001) => {
    // Ports to avoid: main server port, Vite dev, and common conflicts
    const serverPort = parseInt(process.env.PORT || '5000', 10);
    const blockedPorts = [serverPort, 5000, 5173];
    let port = startPort;
    const maxPort = startPort + 100;

    while (port < maxPort) {
        if (!blockedPorts.includes(port) && await isPortAvailable(port)) {
            return port;
        }
        port++;
    }
    return startPort; // fallback
};

/**
 * Wait for a port to start accepting connections.
 * Retries up to `maxRetries` times with `intervalMs` delay between attempts.
 * Returns true if the port became reachable, false if all retries exhausted.
 */
const waitForPort = (port, maxRetries = 30, intervalMs = 1000) => {
    return new Promise((resolve) => {
        let attempts = 0;
        const tryConnect = () => {
            attempts++;
            const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
                client.destroy();
                resolve(true);
            });
            client.on('error', () => {
                client.destroy();
                if (attempts >= maxRetries) {
                    resolve(false);
                } else {
                    setTimeout(tryConnect, intervalMs);
                }
            });
        };
        tryConnect();
    });
};

/* ---------------------------------------------------------
   ENSURE PROJECT READY — sync files + install deps
--------------------------------------------------------- */
const ensureProjectReady = async (projectId, projectPath, io, roomId) => {
    const emitToRoom = (message, type = 'info') => {
        if (io && roomId) {
            io.to(roomId).emit('project-console', { projectId, message, type });
        }
    };

    emitToRoom('📂 Syncing project files to disk...', 'info');
    await syncAllFilesToDisk(projectId);
    emitToRoom('✅ Files synced', 'success');

    if (!fs.existsSync(projectPath)) return;

    // Helper to recursively find all package.jsons (ignore node_modules/.git)
    const findPackageJsons = (dir, pkgList) => {
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    findPackageJsons(fullPath, pkgList);
                } else if (item.name === 'package.json') {
                    pkgList.push(fullPath);
                }
            }
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err);
        }
    };

    const packageJsons = [];
    findPackageJsons(projectPath, packageJsons);

    if (packageJsons.length === 0) return;

    // Install dependencies in every directory that has a package.json
    for (const pkgJsonPath of packageJsons) {
        const installDir = path.dirname(pkgJsonPath);
        const nodeModulesPath = path.join(installDir, 'node_modules');
        
        let relativeDir = path.relative(projectPath, installDir);
        if (!relativeDir) relativeDir = 'root';

        if (!fs.existsSync(nodeModulesPath)) {
            emitToRoom(`📦 Installing dependencies in /${relativeDir}...`, 'info');
            const result = await installDependencies(installDir);
            if (result.success) {
                emitToRoom(`✅ Dependencies installed successfully in /${relativeDir}`, 'success');
            } else {
                emitToRoom(`⚠️ Dependency install issue in /${relativeDir}: ${result.message}`, 'warning');
            }
        }
    }
};

/* ---------------------------------------------------------
   LOCAL PROJECT ANALYSIS — deterministic fallback when AI fails
   Parses package.json scripts + file structure directly
--------------------------------------------------------- */
const analyzeProjectLocally = (fileList, packageJsonContent, projectPath) => {
    const filePaths = fileList.map(f => (typeof f === 'string' ? f : f.path) || '');
    const hasFile = (name) => filePaths.some(p => p === name || p.endsWith('/' + name));
    const hasExt = (ext) => filePaths.some(p => p.endsWith(ext));

    let pkgJson = null;
    try {
        if (packageJsonContent) pkgJson = JSON.parse(packageJsonContent);
    } catch (e) { /* ignore */ }

    const scripts = pkgJson?.scripts || {};
    const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };

    // ── Vite project ──
    if (deps['vite'] || deps['@vitejs/plugin-react'] || scripts.dev?.includes('vite')) {
        return {
            installCmd: 'npm install',
            runCmd: `npx vite --port PORT --host`,
            defaultPort: 3001,
            projectType: 'vite',
            needsInstall: true,
            entryFile: 'index.html',
            notes: 'Vite dev server detected'
        };
    }

    // ── Next.js ──
    if (deps['next'] || scripts.dev?.includes('next')) {
        return {
            installCmd: 'npm install',
            runCmd: `npx next dev -p PORT`,
            defaultPort: 3001,
            projectType: 'nextjs',
            needsInstall: true,
            entryFile: 'pages/index.js',
            notes: 'Next.js project detected'
        };
    }

    // ── Create React App ──
    if (deps['react-scripts']) {
        return {
            installCmd: 'npm install',
            runCmd: `npx react-scripts start`,
            defaultPort: 3001,
            projectType: 'react-cra',
            needsInstall: true,
            entryFile: 'src/index.js',
            notes: 'Create React App detected'
        };
    }

    // ── Express / Node server ──
    if (deps['express'] || deps['fastify'] || deps['koa']) {
        const entryFile = pkgJson?.main ||
            (scripts.start?.match(/node\s+(\S+)/)?.[1]) ||
            (hasFile('server.js') ? 'server.js' :
             hasFile('app.js') ? 'app.js' : 'index.js');
        const runCmd = scripts.dev ? 'npm run dev' :
                       scripts.start ? 'npm start' : `node ${entryFile}`;
        return {
            installCmd: 'npm install',
            runCmd,
            defaultPort: 4000,
            projectType: 'express',
            needsInstall: true,
            entryFile,
            notes: `Express/Node server → ${runCmd}`
        };
    }

    // ── Generic Node.js with package.json ──
    if (pkgJson) {
        const entryFile = pkgJson.main ||
            (scripts.start?.match(/node\s+(\S+)/)?.[1]) || 'index.js';
        const runCmd = scripts.dev ? 'npm run dev' :
                       scripts.start ? 'npm start' : `node ${entryFile}`;
        return {
            installCmd: Object.keys(deps).length > 0 ? 'npm install' : '',
            runCmd,
            defaultPort: 3001,
            projectType: 'node',
            needsInstall: Object.keys(deps).length > 0,
            entryFile,
            notes: `Node.js project → ${runCmd}`
        };
    }

    // ── Python ──
    if (hasExt('.py')) {
        const mainPy = hasFile('main.py') ? 'main.py' :
                       hasFile('app.py') ? 'app.py' :
                       filePaths.find(p => p.endsWith('.py')) || 'main.py';
        return {
            installCmd: hasFile('requirements.txt') ? 'pip install -r requirements.txt' : '',
            runCmd: `python ${mainPy}`,
            defaultPort: 8000, projectType: 'python', needsInstall: hasFile('requirements.txt'),
            entryFile: mainPy, notes: `Python → ${mainPy}`
        };
    }

    // ── Static HTML ──
    if (hasFile('index.html') || hasExt('.html')) {
        return {
            installCmd: '', runCmd: `npx http-server . -p PORT -c-1`,
            defaultPort: 8080, projectType: 'static', needsInstall: false,
            entryFile: 'index.html', notes: 'Static HTML → http-server'
        };
    }

    // ── Last resort ──
    const firstJs = filePaths.find(p => p.endsWith('.js') && !p.includes('/'));
    return {
        installCmd: '', runCmd: firstJs ? `node ${firstJs}` : 'echo No runnable files found',
        defaultPort: 3001, projectType: 'unknown', needsInstall: false,
        entryFile: firstJs || '', notes: firstJs ? `Running ${firstJs}` : 'Unknown project type'
    };
};

/* ---------------------------------------------------------
   SMART RUN PROJECT — AI analyzes, then executes
--------------------------------------------------------- */
const runProject = async (projectId, projectType, userId, io, roomId) => {
    try {
        if (runningProcesses.has(projectId)) {
            return { success: false, message: 'Project is already running' };
        }

        const project = await Project.findById(projectId).populate('room');
        if (!project) {
            return { success: false, message: 'Project not found' };
        }

        const projectPath = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        const emitToRoom = (message, type = 'info') => {
            if (io && roomId) {
                io.to(roomId).emit('project-console', { projectId, message, type });
            }
            // Also emit to terminal for visibility
            if (io && roomId) {
                io.to(roomId).emit('terminal-output', { processId: 'system', message, type });
            }
        };

        // ── STEP 1: Sync files and install deps ──
        await ensureProjectReady(projectId, projectPath, io, roomId);

        // ── STEP 2: Find package.json and determine execution directory ──
        const dbFiles = await File.find({ project: projectId });
        const fileList = dbFiles.map(f => ({ path: f.path, isFolder: f.isFolder }));

        let packageJsonContent = '';
        let executeDir = projectPath;
        
        // Find the best package.json (root preferred, then shallowest nested)
        const pkgFiles = dbFiles.filter(f => f.path.endsWith('package.json'));
        if (pkgFiles.length > 0) {
            pkgFiles.sort((a, b) => a.path.split('/').length - b.path.split('/').length);
            const bestPkg = pkgFiles[0];
            packageJsonContent = bestPkg.content || '';
            const dirName = path.dirname(bestPkg.path);
            if (dirName && dirName !== '.') {
                executeDir = path.join(projectPath, dirName);
            }
        } else {
            // Check disk just in case
            const items = fs.readdirSync(projectPath, { withFileTypes: true });
            const firstFolder = items.find(item => item.isDirectory() && !item.name.startsWith('.'));
            if (firstFolder) {
                const nestedPkgJson = path.join(projectPath, firstFolder.name, 'package.json');
                if (fs.existsSync(nestedPkgJson)) {
                    packageJsonContent = fs.readFileSync(nestedPkgJson, 'utf-8');
                    executeDir = path.join(projectPath, firstFolder.name);
                }
            } else if (fs.existsSync(path.join(projectPath, 'package.json'))) {
                packageJsonContent = fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8');
            }
        }

        // ── STEP 3: Smart Analysis (AI → local fallback) ──
        let analysis;
        try {
            emitToRoom('🤖 AI is analyzing your project...', 'info');
            analysis = await analyzeProject(fileList, packageJsonContent);
            
            // If AI returned 'unknown' or clearly wrong, override with local
            if (analysis.projectType === 'unknown' || analysis.notes?.includes('failed')) {
                emitToRoom('🔄 AI was unsure, using smart local analysis...', 'info');
                analysis = analyzeProjectLocally(fileList, packageJsonContent, projectPath);
            }
        } catch (aiErr) {
            emitToRoom('🔄 Using smart local analysis...', 'info');
            analysis = analyzeProjectLocally(fileList, packageJsonContent, projectPath);
        }
        
        emitToRoom(`📋 Detected: ${analysis.projectType} project — ${analysis.notes}`, 'info');
        
        // Show any AI-identified errors that need fixing!
        if (analysis.errorsToFix && analysis.errorsToFix.length > 0) {
            emitToRoom(`⚠️ AI found potential issues needing fixing:`, 'warning');
            analysis.errorsToFix.forEach(err => {
                emitToRoom(`  - ${err}`, 'warning');
            });
        }
        
        console.log('[Project Analysis]:', JSON.stringify(analysis, null, 2));

        // ── STEP 4: Find available port ──
        const desiredPort = analysis.defaultPort || 3001;
        const port = await findAvailablePort(desiredPort);
        emitToRoom(`🔌 Using port ${port}${port !== desiredPort ? ` (${desiredPort} was busy)` : ''}`, 'info');

        // ── STEP 5: Install dependencies if needed ──
        if (analysis.needsInstall && analysis.installCmd) {
            const nodeModulesPath = path.join(executeDir, 'node_modules');
            if (!fs.existsSync(nodeModulesPath)) {
                emitToRoom(`📦 Running: ${analysis.installCmd} (in ${path.relative(projectPath, executeDir) || 'root'})`, 'info');
                const installResult = await installDependencies(executeDir);
                if (installResult.success) {
                    emitToRoom('✅ Dependencies ready', 'success');
                } else {
                    emitToRoom(`⚠️ Install warning: ${installResult.message}`, 'warning');
                }
            }
        }

        // ── STEP 6: Build the run command with correct port ──
        let runCmd = analysis.runCmd || 'node index.js';
        // Replace PORT placeholder with actual port
        runCmd = runCmd.replace(/PORT/g, port.toString());
        // Also replace hard-coded ports in the command
        runCmd = runCmd.replace(/--port \d+/, `--port ${port}`);
        runCmd = runCmd.replace(/-p \d+/, `-p ${port}`);

        emitToRoom(`🚀 Running: ${runCmd} (in ${path.relative(projectPath, executeDir) || 'root'})`, 'info');

        // ── STEP 7: Spawn the process ──
        const env = { ...process.env, PORT: port.toString(), HOST: '0.0.0.0' };
        // Build relative preview URL so production clients can reliably resolve it using VITE_SERVER_URL
        const previewUrl = `/api/preview/${port}`;

        const childProcess = spawn(runCmd, {
            cwd: executeDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            env
        });

        const processId = projectId.toString();
        const consoleOutput = [];

        // Capture stdout
        // Regex to dynamically detect locally running dev servers like Vite
        const urlRegex = /(http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+)/i;

        childProcess.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                consoleOutput.push({ message, type: 'info', timestamp: Date.now() });
                if (io && roomId) {
                    io.to(roomId).emit('project-console', { projectId, message, type: 'info' });
                    
                    // Emitting dynamic preview URL update if matched
                    const match = message.match(urlRegex);
                    if (match) {
                        io.to(roomId).emit('project-preview-url', { projectId, url: match[1] });
                    }
                }
            }
        });

        // Capture stderr
        childProcess.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                // Vite/webpack output goes to stderr but isn't actually errors
                const isActualError = message.toLowerCase().includes('error') && 
                                     !message.includes('localhost') && 
                                     !message.includes('ready in');
                const type = isActualError ? 'error' : 'info';
                consoleOutput.push({ message, type, timestamp: Date.now() });
                if (io && roomId) {
                    io.to(roomId).emit('project-console', { projectId, message, type });
                    
                    // Emitting dynamic preview URL update if matched
                    const match = message.match(urlRegex);
                    if (match) {
                        io.to(roomId).emit('project-preview-url', { projectId, url: match[1] });
                    }
                }
            }
        });

        // Handle process close
        childProcess.on('close', (code) => {
            runningProcesses.delete(processId);
            const msg = code === 0 ? 'Process completed successfully' : `Process exited with code ${code}`;
            consoleOutput.push({ message: msg, type: code === 0 ? 'success' : 'error', timestamp: Date.now() });
            if (io && roomId) {
                io.to(roomId).emit('project-stopped', { projectId, exitCode: code });
            }
        });

        childProcess.on('error', (err) => {
            runningProcesses.delete(processId);
            console.error(`Project execution error: ${err.message}`);
            if (io && roomId) {
                io.to(roomId).emit('project-error', { projectId, error: err.message });
                io.to(roomId).emit('project-console', { projectId, message: `❌ Error: ${err.message}`, type: 'error' });
            }
        });

        // Store process info
        runningProcesses.set(processId, {
            process: childProcess,
            projectType: analysis.projectType,
            userId,
            roomId,
            port,
            previewUrl,
            startedAt: Date.now(),
            consoleOutput,
            analysis
        });

        // Return the HTTP response IMMEDIATELY so the client gets the preview URL
        // Then check port readiness in the background via Socket.IO
        emitToRoom(`⏳ Waiting for project to become ready on port ${port}...`, 'info');

        // Fire-and-forget: poll port readiness & emit live status via Socket.IO
        waitForPort(port, 40, 1500).then((portReady) => {
            if (portReady) {
                emitToRoom(`✅ Project is live on port ${port}!`, 'success');
                // Re-emit the preview URL so any late-joining members get it too
                if (io && roomId) {
                    io.to(roomId).emit('project-preview-url', { projectId, url: previewUrl });
                }
            } else {
                emitToRoom(`⚠️ Port ${port} did not respond in 60s — the project may have crashed. Check console output above for errors.`, 'warning');
            }
        });

        return {
            success: true,
            previewUrl,
            processId,
            port,
            analysis,
            message: `${analysis.projectType} project started on port ${port}`
        };

    } catch (err) {
        console.error('Run project error:', err);
        // Emit error to console
        if (io && roomId) {
            io.to(roomId).emit('project-console', {
                projectId,
                message: `❌ Failed to start project: ${err.message}`,
                type: 'error'
            });
        }
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   STOP PROJECT
--------------------------------------------------------- */
const kill = require('tree-kill'); // Guarantees orphaned processes actually die!

const stopProject = (projectId) => {
    const processId = projectId.toString();
    const info = runningProcesses.get(processId);

    if (!info) {
        return { success: false, message: 'Project is not running' };
    }

    try {
        // Force-kill the parent shell AND every descendant subprocess it spawned (like Vite, nodemon)
        kill(info.process.pid, 'SIGKILL', (err) => {
            if (err) {
                console.error(`Error terminating process tree ${info.process.pid}:`, err);
            }
        });
        runningProcesses.delete(processId);
        return { success: true, message: 'Project stopped' };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   CONSOLE OUTPUT
--------------------------------------------------------- */
const getConsoleOutput = (projectId) => {
    const processId = projectId.toString();
    const info = runningProcesses.get(processId);
    return { logs: info ? info.consoleOutput : [] };
};

const isProjectRunning = (projectId) => {
    return runningProcesses.has(projectId.toString());
};

/* ---------------------------------------------------------
   STATUS OUTPUT
--------------------------------------------------------- */
const getProjectStatus = (projectId) => {
    const processId = projectId.toString();
    const info = runningProcesses.get(processId);
    if (!info) return { running: false };
    return {
        running: true,
        projectType: info.projectType,
        port: info.port,
        previewUrl: info.previewUrl,
        startedAt: info.startedAt
    };
};

/* ---------------------------------------------------------
   RUN FILE — uses project root as cwd
--------------------------------------------------------- */
const runFile = async (projectId, filePath, userId, io, roomId, userSocketMap) => {
    try {
        const projectRoot = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());
        const fullPath = path.join(projectRoot, filePath);
        const fileExt = path.extname(filePath);
        const fileName = path.basename(filePath);

        // ALWAYS sync this singular file to disk before running so it reflects the latest edits
        const dbFile = await File.findOne({ project: projectId, path: filePath });
        if (!dbFile) {
            return { success: false, message: 'File not found in database' };
        }
        
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, dbFile.content || '');

        let command, args;

        if (fileExt === '.js') {
            command = 'node';
            args = [fullPath];
        } else if (fileExt === '.py') {
            command = 'python';
            args = [fullPath];
        } else if (fileExt === '.html') {
            // For HTML files, serve them
            const port = await findAvailablePort(8080);
            command = 'npx';
            args = ['http-server', projectRoot, '-p', port.toString(), '-c-1', '-o', filePath];
            // Return immediately with preview URL
            const childProcess = spawn(command, args, {
                cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'], shell: true
            });
            const processId = `file-${Date.now()}`;
            runningProcesses.set(processId, {
                process: childProcess, type: 'file', filePath, userId, roomId,
                startedAt: Date.now(), consoleOutput: []
            });
            return { success: true, processId, previewUrl: `/api/preview/${port}/${filePath}`, message: `Serving ${fileName} on port ${port}` };
        } else {
            return { success: false, message: 'Unsupported file type for direct execution' };
        }

        const childProcess = spawn(command, args, {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        const processId = `file-${Date.now()}`;
        const consoleOutput = [];

        const emitOutput = (eventName, data) => {
            if (!io) return;
            if (roomId) {
                io.to(roomId).emit(eventName, data);
            } else if (userSocketMap && userSocketMap[userId]) {
                io.to(userSocketMap[userId]).emit(eventName, data);
            }
        };

        childProcess.stdout.on('data', (data) => {
            const message = data.toString();
            if (message) {
                consoleOutput.push({ message, type: 'info', timestamp: Date.now() });
                emitOutput('terminal-output', { processId, message, type: 'info' });
            }
        });

        childProcess.stderr.on('data', (data) => {
            const message = data.toString();
            if (message) {
                consoleOutput.push({ message, type: 'error', timestamp: Date.now() });
                emitOutput('terminal-output', { processId, message, type: 'error' });
            }
        });

        childProcess.on('close', (code) => {
            runningProcesses.delete(processId);
            const exitMessage = `\nProcess exited with code ${code}`;
            consoleOutput.push({ message: exitMessage, type: code === 0 ? 'success' : 'error', timestamp: Date.now() });
            emitOutput('terminal-output', { processId, message: exitMessage, type: code === 0 ? 'success' : 'error' });
        });

        runningProcesses.set(processId, {
            process: childProcess, type: 'file', filePath, userId, roomId,
            startedAt: Date.now(), consoleOutput
        });

        return { success: true, processId, message: `Running ${fileName}...` };
    } catch (err) {
        console.error('Run file error:', err);
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   WRITE TO PROCESS STDIN
--------------------------------------------------------- */
const writeToProcess = (processId, input) => {
    const info = runningProcesses.get(processId);
    if (!info || !info.process) {
        return { success: false, message: 'Process not running' };
    }
    try {
        info.process.stdin.write(input + '\n');
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   STOP PROCESS
--------------------------------------------------------- */
const stopProcess = (processId) => {
    const info = runningProcesses.get(processId);
    if (!info) {
        return { success: false, message: 'Process not running' };
    }
    try {
        info.process.kill('SIGTERM');
        runningProcesses.delete(processId);
        return { success: true, message: 'Process stopped' };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/* ---------------------------------------------------------
   EXECUTE SHELL/GIT COMMAND
--------------------------------------------------------- */
const executeCommand = (projectId, command, io, roomId, subDir = '') => {
    return new Promise((resolve) => {
        const projectRoot = path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());
        if (!fs.existsSync(projectRoot)) {
            fs.mkdirSync(projectRoot, { recursive: true });
        }

        // Calculate the actual execution directory
        let executeDir = projectRoot;
        if (subDir) {
            // Prevent directory traversal attacks outside the project
            const resolvedPath = path.resolve(projectRoot, subDir);
            if (resolvedPath.startsWith(projectRoot)) {
                executeDir = resolvedPath;
            }
        }
        
        if (!fs.existsSync(executeDir)) {
             resolve({ success: false, output: `Directory not found: ${subDir}`, exitCode: 1 });
             return;
        }

        const childProcess = spawn(command, {
            cwd: executeDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        let output = '';
        let errorOutput = '';

        const emitToRoom = (message, type = 'info') => {
            if (io && roomId) {
                io.to(roomId).emit('terminal-output', { processId: 'cmd', message, type });
            }
        };

        childProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            output += msg;
            emitToRoom(msg, 'info');
        });

        childProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            errorOutput += msg;
            emitToRoom(msg, 'info');
        });

        childProcess.on('close', (code) => {
            resolve({ success: code === 0, output: output + errorOutput, exitCode: code });
        });

        childProcess.on('error', (err) => {
            resolve({ success: false, output: err.message, exitCode: 1 });
        });

        // Don't kill long-running processes! Just release the HTTP request 
        // after 1.5 seconds so the UI terminal doesn't hang. The process will
        // continue to stream output to the socket.
        const timeout = setTimeout(() => {
            childProcess.unref(); // Detach from parent
            resolve({ success: true, output: '\n[Process detached to background and continuing to run...]\n', exitCode: 0 });
        }, 1500);

        // Clear timeout if process finishes quickly before 1.5s
        childProcess.on('exit', () => {
            clearTimeout(timeout);
        });
    });
};

module.exports = {
    runProject,
    stopProject,
    runFile,
    writeToProcess,
    stopProcess,
    getConsoleOutput,
    isProjectRunning,
    getProjectStatus,
    executeCommand,
    findAvailablePort
};
