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
    const { name, path, projectId, isFolder } = req.body;
    try {
        // A simple check to see if the user has access to this project
        const project = await Project.findById(projectId);
        if (!project.members.includes(req.user.id)) {
            return res.status(401).send('User not authorized');
        }
        
        const newFile = new File({
            name, path, project: projectId, isFolder,
            content: isFolder ? '' : '// New file - ' + name
        });
        await newFile.save();
        res.json(newFile);
    } catch (err) { res.status(500).send('Server Error'); }
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

// Rename a file or folder
router.put('/rename/:fileId', auth, async (req, res) => {
    try {
        const { newName, newPath } = req.body;
        // In a real app, we'd also have to update all children paths if this is a folder
        const file = await File.findByIdAndUpdate(req.params.fileId,
            { $set: { name: newName, path: newPath } },
            { new: true }
        );
        res.json(file);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Delete a file or folder
router.delete('/:fileId', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });

        if (file.isFolder) {
            // If it's a folder, delete it AND all files/folders inside it
            await File.deleteMany({ project: file.project, path: { $regex: `^${file.path}` } });
        } else {
            await file.deleteOne();
        }
        res.json({ msg: 'File removed' });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;