const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const File = require('../models/File');
const fs = require('fs');
const path = require('path');
const { isValidId, resolveProjectPath, sanitizeRelPath, getProjectAccess, requireProjectAccess } = require('../utils/access');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- HELPER FUNCTIONS FOR DISK SYNC ---
// All disk paths go through resolveProjectPath so a crafted path can never escape the project folder.
const syncToDisk = (projectId, filePath, content, isFolder = false) => {
    try {
        const fullPath = resolveProjectPath(projectId, filePath);
        if (isFolder) {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content || '');
        }
    } catch (err) {
        console.error('Error syncing to disk:', err.message);
    }
};

const deleteFromDisk = (projectId, filePath) => {
    try {
        const fullPath = resolveProjectPath(projectId, filePath);
        if (fullPath === resolveProjectPath(projectId, '')) return; // never wipe the project root
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        }
    } catch (err) {
        console.error('Error deleting from disk:', err.message);
    }
};

const renameOnDisk = (projectId, oldPath, newPath) => {
    try {
        const fullOldPath = resolveProjectPath(projectId, oldPath);
        const fullNewPath = resolveProjectPath(projectId, newPath);
        if (fs.existsSync(fullOldPath)) {
            fs.mkdirSync(path.dirname(fullNewPath), { recursive: true });
            fs.renameSync(fullOldPath, fullNewPath);
        }
    } catch (err) {
        console.error('Error renaming on disk:', err.message);
    }
};

// Loads the file from :fileId and checks the caller can access its project.
const loadFileWithAccess = async (req, res, next) => {
    try {
        const { fileId } = req.params;
        if (!isValidId(fileId)) return res.status(400).json({ msg: 'Invalid file ID format' });

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });

        const access = await getProjectAccess(file.project.toString(), req.user.id);
        if (!access) return res.status(403).json({ msg: 'You are not a member of this project' });

        req.file = file;
        next();
    } catch (err) {
        console.error('File access error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
// --------------------------------------

// Get all files for a project
router.get('/project/:projectId', auth, requireProjectAccess(req => req.params.projectId), async (req, res) => {
    try {
        const files = await File.find({ project: req.params.projectId }).sort({ path: 1 });
        res.json(files);
    } catch (err) {
        console.error('Error fetching files:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Delete by path (MUST be before /:fileId so Express matches it first)
router.delete('/by-path', auth, requireProjectAccess(req => req.body.projectId), async (req, res) => {
    try {
        const { projectId } = req.body;
        const filePath = sanitizeRelPath(req.body.filePath);
        if (!filePath) return res.status(400).json({ msg: 'Valid filePath is required' });

        const file = await File.findOne({ path: filePath, project: projectId });
        if (!file) return res.status(404).json({ msg: 'File not found' });

        if (file.isFolder) {
            await File.deleteMany({ project: projectId, path: { $regex: `^${escapeRegex(filePath)}/` } });
        }
        await file.deleteOne();

        deleteFromDisk(projectId, filePath);
        res.json({ msg: 'File removed' });
    } catch (err) {
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Get a specific file by ID
router.get('/:fileId', auth, loadFileWithAccess, (req, res) => {
    res.json(req.file);
});

// Create a new file or folder
router.post('/', auth, requireProjectAccess(req => req.body.projectId), async (req, res) => {
    const { projectId, isFolder, content } = req.body;
    const filePath = sanitizeRelPath(req.body.path);
    if (!filePath) return res.status(400).json({ msg: 'Valid path is required' });

    try {
        const existing = await File.findOne({ project: projectId, path: filePath });
        if (existing) {
            return res.status(400).json({ msg: 'File or folder already exists at this path' });
        }

        const newFile = new File({
            name: req.body.name || path.posix.basename(filePath),
            path: filePath,
            project: projectId,
            isFolder: !!isFolder,
            content: isFolder ? '' : (typeof content === 'string' ? content : '// New file')
        });
        await newFile.save();

        syncToDisk(projectId, filePath, newFile.content, newFile.isFolder);
        res.json(newFile);
    } catch (err) {
        console.error('File creation error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Rename file/folder
router.put('/rename/:fileId', auth, loadFileWithAccess, async (req, res) => {
    try {
        const file = req.file;
        const newPath = sanitizeRelPath(req.body.newPath);
        if (!newPath) return res.status(400).json({ msg: 'Valid newPath is required' });

        const oldPath = file.path;
        if (newPath === oldPath) return res.json(file);

        const clash = await File.findOne({ project: file.project, path: newPath });
        if (clash) return res.status(400).json({ msg: 'A file or folder already exists at that path' });

        file.name = req.body.newName || path.posix.basename(newPath);
        file.path = newPath;
        await file.save();

        // If it's a folder, update all children's paths in DB
        if (file.isFolder) {
            const children = await File.find({
                project: file.project,
                path: { $regex: `^${escapeRegex(oldPath)}/` }
            });
            for (const child of children) {
                child.path = newPath + child.path.substring(oldPath.length);
                await child.save();
            }
        }

        renameOnDisk(file.project, oldPath, newPath);
        res.json(file);
    } catch (err) {
        console.error('Rename error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Update a file's content
router.put('/:fileId', auth, loadFileWithAccess, async (req, res) => {
    try {
        const file = req.file;
        if (file.isFolder) return res.status(400).json({ msg: 'Cannot write content to a folder' });

        file.content = typeof req.body.content === 'string' ? req.body.content : '';
        await file.save();

        syncToDisk(file.project, file.path, file.content, false);
        res.json(file);
    } catch (err) {
        console.error('File update error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// Delete a file or folder by ID
router.delete('/:fileId', auth, loadFileWithAccess, async (req, res) => {
    try {
        const file = req.file;
        const projectId = file.project;
        const filePath = file.path;

        if (file.isFolder) {
            // Delete the folder AND everything inside it
            await File.deleteMany({ project: projectId, path: { $regex: `^${escapeRegex(filePath)}/` } });
        }
        await file.deleteOne();

        deleteFromDisk(projectId, filePath);
        res.json({ msg: 'File removed' });
    } catch (err) {
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;
