const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Project = require('../models/Project');

// Store running processes
const runningProcesses = new Map();

/**
 * Run a project based on its type
 * Returns: { success: boolean, previewUrl: string, processId: string, message: string }
 */
const runProject = async (projectId, projectType, userId, io, roomId) => {
    try {
        // Check if already running
        if (runningProcesses.has(projectId)) {
            return { success: false, message: 'Project is already running' };
        }

        const project = await Project.findById(projectId).populate('room');
        if (!project) {
            return { success: false, message: 'Project not found' };
        }

        const projectPath = path.join(process.cwd(), 'projects', projectId.toString());

        // Ensure project directory exists
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        let command, args, cwd, previewUrl;

        switch (projectType) {
            case 'MERN Stack':
                command = 'npm';
                args = ['run', 'dev'];
                cwd = projectPath;
                previewUrl = 'http://localhost:5173'; // React client via Vite
                break;

            case 'React App':
                command = 'npm';
                args = ['run', 'dev'];
                cwd = projectPath;
                previewUrl = 'http://localhost:5173'; // Vite default
                break;

            case 'Node.js API':
                command = 'npm';
                args = ['start'];
                cwd = projectPath;
                previewUrl = 'http://localhost:5000';
                break;

            case 'Vanilla Web':
                command = 'npx';
                args = ['http-server', projectPath, '-p', '8080', '-c-1'];
                previewUrl = 'http://localhost:8080';
                break;

            case 'Express + EJS':
                command = 'npm';
                args = ['start'];
                cwd = projectPath;
                previewUrl = 'http://localhost:3000';
                break;

            default:
                return { success: false, message: 'Unsupported project type' };
        }

        // Spawn the process
        const childProcess = spawn(command, args, {
            cwd: cwd || projectPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const processId = projectId.toString();
        const consoleOutput = [];

        // Capture stdout
        childProcess.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                consoleOutput.push({ message, type: 'info', timestamp: Date.now() });

                // Emit to room via socket
                if (io && roomId) {
                    io.to(roomId).emit('project-console', {
                        projectId,
                        message,
                        type: 'info'
                    });
                }
            }
        });

        // Capture stderr
        childProcess.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message) {
                consoleOutput.push({ message, type: 'error', timestamp: Date.now() });

                // Emit to room via socket
                if (io && roomId) {
                    io.to(roomId).emit('project-console', {
                        projectId,
                        message,
                        type: 'error'
                    });
                }
            }
        });

        // Handle process close
        childProcess.on('close', (code) => {
            runningProcesses.delete(processId);
            const exitMessage = code === 0 ? 'Process completed successfully' : `Process exited with code ${code}`;
            consoleOutput.push({ message: exitMessage, type: code === 0 ? 'success' : 'error', timestamp: Date.now() });

            if (io && roomId) {
                io.to(roomId).emit('project-stopped', {
                    projectId,
                    exitCode: code
                });
            }
        });

        // Handle errors
        childProcess.on('error', (err) => {
            runningProcesses.delete(processId);
            console.error(`Project execution error: ${err.message}`);

            if (io && roomId) {
                io.to(roomId).emit('project-error', {
                    projectId,
                    error: err.message
                });
            }
        });

        // Store process info
        runningProcesses.set(processId, {
            process: childProcess,
            projectType,
            userId,
            roomId,
            startedAt: Date.now(),
            consoleOutput
        });

        return {
            success: true,
            previewUrl,
            processId,
            message: `${projectType} started successfully`
        };

    } catch (err) {
        console.error('Run project error:', err);
        return { success: false, message: err.message };
    }
};

/**
 * Stop a running project
 */
const stopProject = (projectId) => {
    const processId = projectId.toString();
    const info = runningProcesses.get(processId);

    if (!info) {
        return { success: false, message: 'Project is not running' };
    }

    try {
        info.process.kill('SIGTERM');
        runningProcesses.delete(processId);
        return { success: true, message: 'Project stopped' };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/**
 * Get console output for a project
 */
const getConsoleOutput = (projectId) => {
    const processId = projectId.toString();
    const info = runningProcesses.get(processId);

    if (!info) {
        return { logs: [] };
    }

    return { logs: info.consoleOutput };
};

/**
 * Check if project is running
 */
const isProjectRunning = (projectId) => {
    return runningProcesses.has(projectId.toString());
};

/**
 * Run a single file
 */
const runFile = async (projectId, filePath, userId, io, roomId, userSocketMap) => {
    try {
        const fullPath = path.join(process.cwd(), 'projects', projectId.toString(), filePath);
        const fileExt = path.extname(filePath);
        const fileName = path.basename(filePath);

        if (!fs.existsSync(fullPath)) {
            // File not on disk — try to sync from MongoDB
            const File = require('../models/File');
            const dbFile = await File.findOne({ project: projectId, path: filePath });
            if (!dbFile) {
                return { success: false, message: 'File not found' };
            }
            // Write it to disk
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, dbFile.content || '');
            console.log(`Synced file from DB to disk: ${filePath}`);
        }

        let command, args;

        if (fileExt === '.js') {
            command = 'node';
            args = [fullPath];
        } else if (fileExt === '.py') {
            command = 'python';
            args = [fullPath];
        } else {
            return { success: false, message: 'Unsupported file type for direct execution' };
        }

        // Spawn process
        const childProcess = spawn(command, args, {
            cwd: path.dirname(fullPath),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const processId = `file-${Date.now()}`; // Unique ID for this file run
        const consoleOutput = [];

        // Helper: emit to room if available, otherwise directly to user's socket
        const emitOutput = (eventName, data) => {
            if (!io) return;
            if (roomId) {
                io.to(roomId).emit(eventName, data);
            } else if (userSocketMap && userSocketMap[userId]) {
                io.to(userSocketMap[userId]).emit(eventName, data);
            }
        };

        // Capture stdout
        childProcess.stdout.on('data', (data) => {
            const message = data.toString(); // Don't trim to preserve formatting
            if (message) {
                consoleOutput.push({ message, type: 'info', timestamp: Date.now() });
                emitOutput('terminal-output', { processId, message, type: 'info' });
            }
        });

        // Capture stderr
        childProcess.stderr.on('data', (data) => {
            const message = data.toString();
            if (message) {
                consoleOutput.push({ message, type: 'error', timestamp: Date.now() });
                emitOutput('terminal-output', { processId, message, type: 'error' });
            }
        });

        // Handle process close
        childProcess.on('close', (code) => {
            runningProcesses.delete(processId);
            const exitMessage = `\nProcess exited with code ${code}`;
            consoleOutput.push({ message: exitMessage, type: code === 0 ? 'success' : 'error', timestamp: Date.now() });
            emitOutput('terminal-output', { processId, message: exitMessage, type: code === 0 ? 'success' : 'error' });
        });

        runningProcesses.set(processId, {
            process: childProcess,
            type: 'file',
            filePath,
            userId,
            roomId,
            startedAt: Date.now(),
            consoleOutput
        });

        return { success: true, processId, message: `Running ${fileName}...` };

    } catch (err) {
        console.error('Run file error:', err);
        return { success: false, message: err.message };
    }
};

/**
 * Write to a running process stdin
 */
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

/**
 * Stop any running process by ID
 */
const stopProcess = (processId) => {
    const info = runningProcesses.get(processId);
    if (!info) {
        return { success: false, message: 'Process not running' };
    }

    try {
        info.process.kill('SIGTERM'); // Try graceful termination
        // Force kill after timeout if needed? 
        // For now let's just send kill signal
        runningProcesses.delete(processId);
        return { success: true, message: 'Process stopped' };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

module.exports = {
    runProject,
    stopProject, // Keeps original stopProject (by projectId) logic intact if needed, or we can unify
    runFile,
    writeToProcess,
    stopProcess,
    getConsoleOutput,
    isProjectRunning
};
