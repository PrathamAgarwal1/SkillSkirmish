const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const File = require('../models/File');
const Project = require('../models/Project');
const fs = require('fs');
const path = require('path');

// --- HELPER FUNCTIONS FOR DISK SYNC ---
const getProjectDir = (projectId) => path.join(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'), projectId.toString());

const syncToDisk = (projectId, filePath, content, isFolder = false) => {
    try {
        const fullPath = path.join(getProjectDir(projectId), filePath);
        if (isFolder) {
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        } else {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content || '');
        }
        console.log(`Synced to disk: ${filePath}`);
    } catch (err) {
        console.error('Error syncing to disk:', err);
    }
};

const deleteFromDisk = (projectId, filePath) => {
    try {
        const fullPath = path.join(getProjectDir(projectId), filePath);
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`Deleted from disk: ${filePath}`);
        }
    } catch (err) {
        console.error('Error deleting from disk:', err);
    }
};

const renameOnDisk = (projectId, oldPath, newPath) => {
    try {
        const fullOldPath = path.join(getProjectDir(projectId), oldPath);
        const fullNewPath = path.join(getProjectDir(projectId), newPath);
        const newDir = path.dirname(fullNewPath);

        if (fs.existsSync(fullOldPath)) {
            if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
            }
            fs.renameSync(fullOldPath, fullNewPath);
            console.log(`Renamed on disk: ${oldPath} -> ${newPath}`);
        }
    } catch (err) {
        console.error('Error renaming on disk:', err);
    }
};
// --------------------------------------

// Get all files for a project
router.get('/project/:projectId', auth, async (req, res) => {
    try {
        const { projectId } = req.params;

        // Validate projectId format (MongoDB ObjectId)
        if (!projectId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid project ID format' });
        }

        const files = await File.find({ project: projectId }).sort({ path: 1 });
        res.json(files);
    } catch (err) {
        console.error('Error fetching files:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Get a specific file by ID
router.get('/:fileId', auth, async (req, res) => {
    try {
        const { fileId } = req.params;

        // Validate fileId format (MongoDB ObjectId)
        if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid file ID format' });
        }

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });
        res.json(file);
    } catch (err) {
        console.error('Error fetching file:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Create a new file or folder
router.post('/', auth, async (req, res) => {
    const { name, path: filePath, projectId, isFolder, content } = req.body;
    try {
        // A simple check to see if the user has access to this project
        const project = await Project.findById(projectId);
        if (!project.members.includes(req.user.id)) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Check if file/folder already exists
        const existing = await File.findOne({ project: projectId, path: filePath });
        if (existing) {
            return res.status(400).json({ msg: 'File or folder already exists at this path' });
        }

        const newFile = new File({
            name,
            path: filePath,
            project: projectId,
            isFolder,
            content: isFolder ? '' : (content || '// New file')
        });
        await newFile.save();

        // Sync to disk
        syncToDisk(projectId, filePath, newFile.content, isFolder);

        res.json(newFile);
    } catch (err) {
        console.error('File creation error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Update a file's content
router.put('/:fileId', auth, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { content } = req.body;

        // Validate fileId format (MongoDB ObjectId)
        if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid file ID format' });
        }

        const file = await File.findByIdAndUpdate(fileId,
            { $set: { content: content || '' } },
            { new: true }
        );

        if (!file) return res.status(404).json({ msg: 'File not found' });

        // Sync to disk
        syncToDisk(file.project, file.path, file.content, file.isFolder);

        res.json(file);
    } catch (err) {
        console.error('File update error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Rename file/folder
router.put('/rename/:fileId', auth, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { newName, newPath } = req.body;

        // Validate fileId format (MongoDB ObjectId)
        if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid file ID format' });
        }

        const file = await File.findById(fileId);

        if (!file) return res.status(404).json({ msg: 'File not found' });

        const oldPath = file.path;
        file.name = newName;
        file.path = newPath;
        await file.save();

        // If it's a folder, update all children's paths in DB
        if (file.isFolder) {
            const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const children = await File.find({
                project: file.project,
                path: { $regex: `^${escapedOldPath}/` }
            });
            for (const child of children) {
                child.path = newPath + child.path.substring(oldPath.length);
                // Update name if the immediate child folder/file name is embedded in path
                await child.save();
            }
        }

        // Sync rename to disk
        renameOnDisk(file.project, oldPath, newPath);

        res.json(file);
    } catch (err) {
        console.error('Rename error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Delete by path (MUST be before /:fileId so Express matches it first)
router.delete('/by-path', auth, async (req, res) => {
    try {
        const { filePath, projectId } = req.body;

        if (!filePath || !projectId) {
            return res.status(400).json({ msg: 'filePath and projectId are required' });
        }

        const file = await File.findOne({ path: filePath, project: projectId });
        if (!file) return res.status(404).json({ msg: 'File not found' });

        if (file.isFolder) {
            // Escape special regex characters in filePath
            const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            await File.deleteMany({ project: projectId, path: { $regex: `^${escapedPath}/` } });
            await file.deleteOne();
        } else {
            await file.deleteOne();
        }

        // Sync delete to disk
        deleteFromDisk(projectId, filePath);

        res.json({ msg: 'File removed' });
    } catch (err) {
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Delete a file or folder by ID
router.delete('/:fileId', auth, async (req, res) => {
    try {
        const { fileId } = req.params;

        // Validate fileId format (MongoDB ObjectId)
        if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid file ID format' });
        }

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });

        const projectId = file.project;
        const filePath = file.path;

        if (file.isFolder) {
            // Escape special regex characters in filePath
            const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // If it's a folder, delete it AND all files/folders inside it
            await File.deleteMany({ project: projectId, path: { $regex: `^${escapedPath}/` } });
            await file.deleteOne();
        } else {
            await file.deleteOne();
        }

        // Sync delete to disk
        deleteFromDisk(projectId, filePath);

        res.json({ msg: 'File removed' });
    } catch (err) {
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;