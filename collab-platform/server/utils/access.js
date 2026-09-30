// utils/access.js — shared authorization and path-safety helpers.
const path = require('path');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Room = require('../models/Room');

const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects'));

const isValidId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);

const idEquals = (a, b) => a != null && b != null && a.toString() === b.toString();

const getProjectDir = (projectId) => path.join(PROJECTS_ROOT, projectId.toString());

/** True when `target` is `root` itself or somewhere beneath it. */
const isInside = (root, target) => {
    const rel = path.relative(root, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Resolve a user-supplied relative path inside a project's directory.
 * Throws if the path escapes the project root (e.g. "../../etc/passwd").
 */
const resolveProjectPath = (projectId, relPath = '') => {
    const root = getProjectDir(projectId);
    const target = path.resolve(root, String(relPath || ''));
    if (!isInside(root, target)) {
        const err = new Error('Invalid path');
        err.status = 400;
        throw err;
    }
    return target;
};

/** Normalized project-relative path ("src/App.jsx"), or null if unsafe. */
const sanitizeRelPath = (relPath) => {
    if (typeof relPath !== 'string' || !relPath.trim()) return null;
    const normalized = path.posix.normalize(relPath.replace(/\\/g, '/')).replace(/^\/+/, '');
    if (!normalized || normalized === '.' || normalized.startsWith('..') || normalized.includes('\0')) return null;
    return normalized;
};

const isRoomMember = (room, userId) =>
    !!room && (idEquals(room.owner?._id || room.owner, userId) ||
        (room.members || []).some(m => idEquals(m?._id || m, userId)));

/**
 * A user may work on a project if they are in its member list or own its room.
 * Returns { project, room } or null.
 */
const getProjectAccess = async (projectId, userId) => {
    if (!isValidId(String(projectId))) return null;
    const project = await Project.findById(projectId);
    if (!project) return null;
    if (project.members.some(m => idEquals(m, userId))) return { project, room: null };
    const room = await Room.findById(project.room).select('owner');
    if (room && idEquals(room.owner, userId)) return { project, room };
    return null;
};

/**
 * Express middleware factory: loads the project id from the request via `pick`
 * and rejects unless the authenticated user can access it. Sets req.project.
 */
const requireProjectAccess = (pick) => async (req, res, next) => {
    try {
        const projectId = pick(req);
        if (!projectId || !isValidId(String(projectId))) {
            return res.status(400).json({ success: false, msg: 'Valid projectId is required' });
        }
        const access = await getProjectAccess(projectId, req.user.id);
        if (!access) return res.status(403).json({ success: false, msg: 'You are not a member of this project' });
        req.project = access.project;
        next();
    } catch (err) {
        console.error('[access] project check failed:', err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

module.exports = {
    PROJECTS_ROOT,
    isValidId,
    idEquals,
    getProjectDir,
    isInside,
    resolveProjectPath,
    sanitizeRelPath,
    isRoomMember,
    getProjectAccess,
    requireProjectAccess
};
