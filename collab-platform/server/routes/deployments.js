// routes/deployments.js — deploy a project to <slug>.apps.<domain>, list versions, roll back, stop.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireProjectAccess } = require('../utils/access');
const deployService = require('../services/deployService');

const fromParams = (req) => req.params.projectId;
const io = (req) => req.app.get('socketio');

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        console.error(`[deployments] ${req.path}:`, err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Current deployment (URL, status, versions)
router.get('/:projectId', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    res.json({ deployment: await deployService.getDeployment(req.params.projectId), building: deployService.isBuilding(req.params.projectId) });
}));

// Browser mode: publish a static site the IDE built in the browser. Body: { files: [{ path, data (base64) }], builder }
router.post('/:projectId/publish', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const result = await deployService.publishStatic(req.params.projectId, req.user.id, {
        files: req.body.files,
        builder: typeof req.body.builder === 'string' ? req.body.builder.slice(0, 80) : undefined
    }, io(req));
    res.status(result.success ? 201 : 400).json(result);
}));

// Start a new deploy (build runs in the background; progress arrives over the socket)
router.post('/:projectId', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const result = await deployService.deployProject(req.params.projectId, req.user.id, io(req));
    res.status(result.success ? 202 : 400).json(result);
}));

// Build log of one version
router.get('/:projectId/versions/:number/log', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const log = await deployService.getVersionLog(req.params.projectId, req.params.number);
    if (!log) return res.status(404).json({ message: 'Version not found' });
    res.json({ log });
}));

// Make an earlier version live again (or restart a stopped deployment)
router.post('/:projectId/rollback', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const result = await deployService.rollback(req.params.projectId, req.body.version, io(req));
    res.status(result.success ? 200 : 400).json(result);
}));

// Public gallery settings: list the live app at /gallery, allow forking, short description
router.put('/:projectId/gallery', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const Deployment = require('../models/Deployment');
    const dep = await Deployment.findOne({ project: req.params.projectId });
    if (!dep) return res.status(404).json({ message: 'Deploy the project first' });

    const { listed, forkable, description } = req.body || {};
    if (listed === true && dep.status !== 'live') return res.status(400).json({ message: 'Only live apps can be listed in the gallery' });
    if (typeof listed === 'boolean') {
        if (listed && !dep.gallery.listed) {
            dep.gallery.listedAt = new Date();
            dep.gallery.listedBy = req.user.id;
        }
        dep.gallery.listed = listed;
    }
    if (typeof forkable === 'boolean') dep.gallery.forkable = forkable;
    if (typeof description === 'string') dep.gallery.description = description.trim().slice(0, 280);
    await dep.save();
    res.json({ success: true, deployment: await deployService.getDeployment(req.params.projectId) });
}));

// Take the app offline
router.post('/:projectId/stop', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const result = await deployService.stopDeployment(req.params.projectId, io(req));
    res.status(result.success ? 200 : 400).json(result);
}));

module.exports = router;
