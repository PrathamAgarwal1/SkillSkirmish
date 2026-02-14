const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const path = require('path');
const { spawn } = require('child_process');
const { runProject, stopProject, getConsoleOutput, runFile, writeToProcess, stopProcess } = require('../utils/projectRunner');
const { installPackage, getPackageList } = require('../utils/packageManager');

// Original: Execute single code snippet
router.post('/', auth, (req, res) => {
    const { code } = req.body;

    // Use 'spawn' to create an isolated process
    const nodeProcess = spawn('node', ['-e', code]);

    let output = '';
    let error = '';

    // Capture standard output
    nodeProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Capture error output
    nodeProcess.stderr.on('data', (data) => {
        error += data.toString();
    });

    // Handle process exit
    nodeProcess.on('close', (code) => {
        if (code !== 0) { // If the process crashed
            res.json({ output: error || `Process exited with code ${code}` });
        } else {
            res.json({ output: output });
        }
    });

    // Handle process errors
    nodeProcess.on('error', (err) => {
        res.json({ output: `Failed to start process: ${err.message}` });
    });
});

// New: Run a full project
router.post('/run-project', auth, async (req, res) => {
    try {
        const { projectId, projectType, roomId } = req.body;
        const io = req.app.get('socketio');

        const result = await runProject(projectId, projectType, req.user.id, io, roomId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// New: Stop a running project
router.post('/stop-project', auth, (req, res) => {
    try {
        const { projectId } = req.body;
        const result = stopProject(projectId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// New: Get console output
router.get('/console-output/:projectId', auth, (req, res) => {
    try {
        const { projectId } = req.params;
        const result = getConsoleOutput(projectId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ logs: [] });
    }
});

// New: Install a package
router.post('/install-package', auth, async (req, res) => {
    try {
        const { projectId, packageName, projectType } = req.body;
        const projectPath = path.join(process.cwd(), 'projects', projectId.toString());

        const result = await installPackage(projectId, packageName, projectType, projectPath);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// New: Get available packages
router.get('/packages/:projectType', auth, (req, res) => {
    try {
        const { projectType } = req.params;
        const packages = getPackageList(projectType);
        res.json({ packages });
    } catch (err) {
        res.status(500).json({ packages: [] });
    }
});

// New: Run a single file
router.post('/run-file', auth, async (req, res) => {
    try {
        const { projectId, filePath, roomId } = req.body;
        const io = req.app.get('socketio');

        const result = await runFile(projectId, filePath, req.user.id, io, roomId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// New: Write to process stdin
router.post('/write-terminal', auth, (req, res) => {
    try {
        const { processId, input } = req.body;
        const result = writeToProcess(processId, input);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// New: Stop generic process
router.post('/stop-process', auth, (req, res) => {
    try {
        const { processId } = req.body;
        const result = stopProcess(processId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;