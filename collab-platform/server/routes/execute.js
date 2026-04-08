const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const { runProject, stopProject, getConsoleOutput, runFile, writeToProcess, stopProcess, executeCommand } = require('../utils/projectRunner');
const { installPackage, getPackageList } = require('../utils/packageManager');
const { installDependencies, syncAllFilesToDisk } = require('../utils/templateManager');
const File = require('../models/File');

// Multer config for file/folder uploads (store in temp, then process)
const upload = multer({
    dest: path.join(process.cwd(), 'temp_uploads'),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Original: Execute single code snippet
router.post('/', auth, (req, res) => {
    const { code } = req.body;

    // Use 'spawn' to create an isolated process
    const nodeProcess = spawn('node', ['-e', code], { shell: true });

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

// Run a full project
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

// Stop a running project
router.post('/stop-project', auth, (req, res) => {
    try {
        const { projectId } = req.body;
        const result = stopProject(projectId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get console output
router.get('/console-output/:projectId', auth, (req, res) => {
    try {
        const { projectId } = req.params;
        const result = getConsoleOutput(projectId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ logs: [] });
    }
});

// Install a specific package
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

// Get available packages
router.get('/packages/:projectType', auth, (req, res) => {
    try {
        const { projectType } = req.params;
        const packages = getPackageList(projectType);
        res.json({ packages });
    } catch (err) {
        res.status(500).json({ packages: [] });
    }
});

// Run a single file
router.post('/run-file', auth, async (req, res) => {
    try {
        const { projectId, filePath, roomId } = req.body;
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');

        const result = await runFile(projectId, filePath, req.user.id, io, roomId, userSocketMap);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Write to process stdin
router.post('/write-terminal', auth, (req, res) => {
    try {
        const { processId, input } = req.body;
        const result = writeToProcess(processId, input);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Stop generic process
router.post('/stop-process', auth, (req, res) => {
    try {
        const { processId } = req.body;
        const io = req.app.get('socketio');
        const roomId = req.body.roomId || null;
        const result = stopProcess(processId, io, roomId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── NEW: Install all dependencies for a project ─────────────────
router.post('/install-deps', auth, async (req, res) => {
    try {
        const { projectId } = req.body;
        const io = req.app.get('socketio');
        const roomId = req.body.roomId || null;
        const projectPath = path.join(process.cwd(), 'projects', projectId.toString());

        // First sync all files from DB to disk
        await syncAllFilesToDisk(projectId);

        if (!fs.existsSync(projectPath)) {
            return res.status(404).json({ success: false, message: 'Project directory not found' });
        }

        // Helper to find all package.jsons recursively
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

        if (packageJsons.length === 0) {
            return res.json({ success: true, message: 'No package.json files found' });
        }

        let overallSuccess = true;
        let messages = [];

        for (const pkgJsonPath of packageJsons) {
            const installDir = path.dirname(pkgJsonPath);
            let relativeDir = path.relative(projectPath, installDir);
            if (!relativeDir) relativeDir = 'root';

            // Emit progress
            if (io && roomId) {
                io.to(roomId).emit('project-console', {
                    projectId,
                    message: `📦 Installing dependencies in /${relativeDir}...`,
                    type: 'info'
                });
            }

            const result = await installDependencies(installDir);

            if (io && roomId) {
                io.to(roomId).emit('project-console', {
                    projectId,
                    message: result.success ? `✅ Dependencies installed in /${relativeDir}` : `⚠️ Failed in /${relativeDir}: ${result.message}`,
                    type: result.success ? 'success' : 'warning'
                });
            }

            if (!result.success) overallSuccess = false;
            messages.push(`/${relativeDir}: ` + (result.success ? 'Success' : result.message));
        }

        res.json({ success: overallSuccess, message: messages.join(' | ') });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── NEW: Execute a shell/git command in project directory ───────
router.post('/run-command', auth, async (req, res) => {
    try {
        const { projectId, command, roomId, cwd = '' } = req.body;
        const io = req.app.get('socketio');
        const cmdLower = command.trim().toLowerCase();

        // Special handling for CD commands to create a stateful terminal!
        if (cmdLower.startsWith('cd ') || cmdLower === 'cd') {
            const dest = command.substring(2).trim();
            const projectRoot = path.join(process.cwd(), 'projects', projectId.toString());
            let newCwd = ''; // root default

            if (dest && dest !== '~' && dest !== '/') {
                // If it's something like `cd backend` from root, or `cd ..` from backend
                const currentAbsolute = path.resolve(projectRoot, cwd);
                const targetAbsolute = path.resolve(currentAbsolute, dest);

                // Prevent traversing outside project root
                if (!targetAbsolute.startsWith(projectRoot)) {
                    return res.json({ success: false, output: 'Cannot navigate outside project root' });
                }

                if (!fs.existsSync(targetAbsolute) || !fs.statSync(targetAbsolute).isDirectory()) {
                    return res.json({ success: false, output: `The system cannot find the path specified: ${dest}` });
                }

                // Make relative to project root again
                newCwd = path.relative(projectRoot, targetAbsolute);
                // Windows path normalize (replace \ with /)
                newCwd = newCwd.replace(/\\/g, '/');
            }
            
            return res.json({ success: true, output: '', newCwd });
        }

        const result = await executeCommand(projectId, command, io, roomId, cwd);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, output: err.message });
    }
});

// ─── NEW: Upload files/folders to a project ──────────────────────
router.post('/upload-files', auth, upload.array('files', 100), async (req, res) => {
    try {
        const { projectId } = req.body;
        const uploadedFiles = req.files;

        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const Project = require('../models/Project');
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectPath = path.join(process.cwd(), 'projects', projectId.toString());
        const results = [];

        for (const file of uploadedFiles) {
            // originalname contains the relative path from upload (webkitRelativePath)
            const relativePath = req.body[`path_${file.originalname}`] || file.originalname;
            const content = fs.readFileSync(file.path, 'utf-8');

            // Create parent folders in DB if needed
            const parts = relativePath.split('/');
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                const existingFolder = await File.findOne({ project: projectId, path: currentPath });
                if (!existingFolder) {
                    const folder = new File({
                        name: parts[i],
                        path: currentPath,
                        isFolder: true,
                        content: '',
                        project: projectId
                    });
                    await folder.save();

                    // Sync folder to disk
                    const folderDiskPath = path.join(projectPath, currentPath);
                    if (!fs.existsSync(folderDiskPath)) {
                        fs.mkdirSync(folderDiskPath, { recursive: true });
                    }
                }
            }

            // Create or update the file in DB
            const fileName = parts[parts.length - 1];
            const existingFile = await File.findOne({ project: projectId, path: relativePath });
            
            if (existingFile) {
                existingFile.content = content;
                await existingFile.save();
            } else {
                const newFile = new File({
                    name: fileName,
                    path: relativePath,
                    isFolder: false,
                    content: content,
                    project: projectId
                });
                await newFile.save();
            }

            // Write to disk
            const diskPath = path.join(projectPath, relativePath);
            const diskDir = path.dirname(diskPath);
            if (!fs.existsSync(diskDir)) {
                fs.mkdirSync(diskDir, { recursive: true });
            }
            fs.writeFileSync(diskPath, content);

            results.push({ path: relativePath, status: 'uploaded' });

            // Clean up temp file
            try { fs.unlinkSync(file.path); } catch (e) { }
        }

        // Check if uploaded files include package.json — auto-install
        const hasPackageJson = results.some(r => r.path === 'package.json' || r.path.endsWith('/package.json'));
        if (hasPackageJson) {
            const installResult = await installDependencies(projectPath);
            results.push({ path: 'node_modules', status: installResult.success ? 'installed' : 'install_failed' });
        }

        res.json({
            success: true,
            message: `${results.length} files uploaded`,
            files: results
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── NEW: Upload files with paths (JSON body, no multer) ─────────
router.post('/upload-files-json', auth, async (req, res) => {
    try {
        const { projectId, files: fileList } = req.body;

        if (!fileList || fileList.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }

        const Project = require('../models/Project');
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }

        const projectPath = path.join(process.cwd(), 'projects', projectId.toString());
        const results = [];

        for (const fileData of fileList) {
            const { filePath, content, isFolder } = fileData;

            if (isFolder) {
                // Create folder
                const existingFolder = await File.findOne({ project: projectId, path: filePath });
                if (!existingFolder) {
                    const folder = new File({
                        name: path.basename(filePath),
                        path: filePath,
                        isFolder: true,
                        content: '',
                        project: projectId
                    });
                    await folder.save();
                }
                const folderDiskPath = path.join(projectPath, filePath);
                if (!fs.existsSync(folderDiskPath)) {
                    fs.mkdirSync(folderDiskPath, { recursive: true });
                }
                results.push({ path: filePath, status: 'created_folder' });
                continue;
            }

            // Create parent folders
            const parts = filePath.split('/');
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                const existingFolder = await File.findOne({ project: projectId, path: currentPath });
                if (!existingFolder) {
                    const folder = new File({
                        name: parts[i],
                        path: currentPath,
                        isFolder: true,
                        content: '',
                        project: projectId
                    });
                    await folder.save();
                }
            }

            // Create or update file in DB
            const existingFile = await File.findOne({ project: projectId, path: filePath });
            if (existingFile) {
                existingFile.content = content || '';
                await existingFile.save();
            } else {
                const newFile = new File({
                    name: path.basename(filePath),
                    path: filePath,
                    isFolder: false,
                    content: content || '',
                    project: projectId
                });
                await newFile.save();
            }

            // Write to disk
            const diskPath = path.join(projectPath, filePath);
            const diskDir = path.dirname(diskPath);
            if (!fs.existsSync(diskDir)) {
                fs.mkdirSync(diskDir, { recursive: true });
            }
            fs.writeFileSync(diskPath, content || '');
            results.push({ path: filePath, status: 'uploaded' });
        }

        // Auto-install if package.json was uploaded
        const hasPackageJson = results.some(r => r.path === 'package.json' || r.path.endsWith('/package.json'));
        if (hasPackageJson) {
            const installResult = await installDependencies(projectPath);
            results.push({ path: 'node_modules', status: installResult.success ? 'installed' : 'install_failed' });
        }

        res.json({
            success: true,
            message: `${results.length} files processed`,
            files: results
        });
    } catch (err) {
        console.error('Upload JSON error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;