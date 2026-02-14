const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const File = require('../models/File');
const Project = require('../models/Project');

// Get all files for a project
router.get('/project/:projectId', auth, async (req, res) => {
    try {
        const files = await File.find({ project: req.params.projectId }).sort({ path: 1 });
        res.json(files);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Create a new file or folder
router.post('/', auth, async (req, res) => {
    const { name, path, projectId, isFolder, content } = req.body;
    try {
        // A simple check to see if the user has access to this project
        const project = await Project.findById(projectId);
        if (!project.members.includes(req.user.id)) {
            return res.status(401).json({ msg: 'User not authorized' });
        }
        
        const newFile = new File({
            name, 
            path, 
            project: projectId, 
            isFolder,
            content: isFolder ? '' : (content || '// New file')
        });
        await newFile.save();
        res.json(newFile);
    } catch (err) { 
        console.error('File creation error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message }); 
    }
});

// Update a file's content
router.put('/:fileId', auth, async (req, res) => {
    try {
        const file = await File.findByIdAndUpdate(req.params.fileId, 
            { $set: { content: req.body.content } }, 
            { new: true }
        );
        res.json(file);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Rename file/folder
router.put('/rename/:fileId', auth, async (req, res) => {
    try {
        const { newName, newPath } = req.body;
        const file = await File.findByIdAndUpdate(
            req.params.fileId,
            { $set: { name: newName, path: newPath } },
            { new: true }
        );
        if (!file) return res.status(404).json({ msg: 'File not found' });
        res.json(file);
    } catch (err) { 
        console.error('Rename error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message }); 
    }
});

// Delete a file or folder
router.delete('/:fileId', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });

        if (file.isFolder) {
            // If it's a folder, delete it AND all files/folders inside it
            await File.deleteMany({ project: file.project, path: { $regex: `^${file.path}/` } });
            await file.deleteOne();
        } else {
            await file.deleteOne();
        }
        res.json({ msg: 'File removed' });
    } catch (err) { 
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message }); 
    }
});

// Delete by path (for backwards compatibility)
router.delete('/path/:filePath', auth, async (req, res) => {
    try {
        const filePath = req.params.filePath;
        const { projectId } = req.body;
        
        const file = await File.findOne({ path: filePath, project: projectId });
        if (!file) return res.status(404).json({ msg: 'File not found' });
        
        if (file.isFolder) {
            await File.deleteMany({ project: projectId, path: { $regex: `^${filePath}/` } });
            await file.deleteOne();
        } else {
            await file.deleteOne();
        }
        res.json({ msg: 'File removed' });
    } catch (err) { 
        console.error('File deletion error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message }); 
    }
});

module.exports = router;