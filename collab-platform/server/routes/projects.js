const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Project = require('../models/Project');
const Room = require('../models/Room');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const File = require('../models/File');
const fs = require('fs');
// Import the template manager to create File documents correctly
const { createProjectFiles } = require('../utils/templateManager');
const { isValidId, isRoomMember, getProjectDir } = require('../utils/access');
const { stopAllForProject } = require('../utils/projectRunner');
const { destroyDeployment } = require('../services/deployService');
const { encrypt, decrypt, validateKey } = require('../utils/secrets');

const PROJECT_TYPES = Project.schema.path('projectType').enumValues;

// --- MIDDLEWARE: Check Room Access ---
const checkRoomAccess = async (req, res, next) => {
    try {
        const roomId = req.body.roomId || req.params.roomId;
        if (req.params.id && !isValidId(req.params.id)) return res.status(404).json({ msg: 'Project not found' });
        if (roomId && !isValidId(String(roomId))) return res.status(404).json({ msg: 'Room not found' });

        // If finding by Project ID (for PUT/DELETE), get room from project
        if (!roomId && req.params.id) {
            const project = await Project.findById(req.params.id);
            if (!project) return res.status(404).json({ msg: 'Project not found' });
            req.project = project; // Save project for later

            const room = await Room.findById(project.room);
            if (!room) return res.status(404).json({ msg: 'Room not found' });
            req.room = room;
        }
        // If creating a project, we have roomId in body
        else if (roomId) {
            const room = await Room.findById(roomId);
            if (!room) return res.status(404).json({ msg: 'Room not found' });
            req.room = room;
        } else {
            return next(); // Let the route handle it if no ID found
        }

        // Allow Owner OR Member to modify
        const isOwner = req.room.owner.toString() === req.user.id;
        const isMember = req.room.members.some(m => m.toString() === req.user.id);

        if (!isOwner && !isMember) {
            return res.status(403).json({ msg: 'Not authorized to modify this room' });
        }

        next();
    } catch (err) {
        console.error("Middleware Error:", err);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/projects/room/:roomId
router.get('/room/:roomId', auth, async (req, res) => {
    try {
        if (!isValidId(req.params.roomId)) return res.status(404).json({ msg: 'Room not found' });
        const room = await Room.findById(req.params.roomId).select('owner members');
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!isRoomMember(room, req.user.id)) return res.status(403).json({ msg: 'Access Denied' });

        const projects = await Project.find({ room: req.params.roomId }).sort({ updatedAt: -1 });
        res.json(projects);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/projects
// Create a new project - leader (room owner) is automatically added
router.post('/', [auth, checkRoomAccess], async (req, res) => {
    const { description, projectType = 'React App', roomId } = req.body;
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';

    if (!req.room) return res.status(400).json({ msg: 'roomId is required' });
    if (!name) return res.status(400).json({ msg: 'Project name is required' });
    if (!PROJECT_TYPES.includes(projectType)) {
        return res.status(400).json({ msg: `Unknown project type. Choose one of: ${PROJECT_TYPES.join(', ')}` });
    }

    try {
        const room = req.room;

        // Always add the room leader (owner) and the creator to the project
        const membersSet = new Set([req.user.id, room.owner.toString()]);
        const members = Array.from(membersSet);

        const newProject = new Project({
            name,
            description,
            projectType, // Save the type (e.g., 'React App')
            room: roomId,
            members: members
        });

        const project = await newProject.save();

        // --- FIX: Use the template manager to create File documents ---
        // This creates actual File objects in the DB, not just an array in Project
        await createProjectFiles(projectType, project._id);
        // -----------------------------------------------------------

        // Update Room projects array if schema supports it (optional based on your Room model)
        // if (room.projects) {
        //     room.projects.push(project.id); 
        //     await room.save();
        // }

        // --- NOTIFICATION LOGIC ---
        const sender = await User.findById(req.user.id).select('username');
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');

        // Notify other members
        if (room.members && room.members.length > 0) {
            for (const memberId of room.members) {
                if (memberId.toString() !== req.user.id) {
                    const message = `${sender.username} created project "${project.name}" in "${room.name}"`;

                    // Save Notification
                    const notification = new Notification({ user: memberId, message, type: 'info' });
                    await notification.save();

                    // Send Socket Event
                    const socketId = userSocketMap[memberId.toString()];
                    if (socketId) {
                        io.to(socketId).emit('new-notification', notification);
                    }
                }
            }
        }

        // Notify room for real-time update
        io.to(roomId).emit('room-update');

        // Emitting a SYSTEM chat message for the action
        try {
            const chatMsg = new Message({
                room: roomId,
                sender: req.user.id,
                text: `created a new project: "${project.name}"`
            });
            await chatMsg.save();
            io.to(roomId).emit('message', { 
                ...chatMsg.toObject(), 
                sender: { _id: sender._id, username: 'System' },
                text: `${sender.username} created a new project: "${project.name}"` 
            });
        } catch (msgErr) {
            console.error('Error sending system chat message:', msgErr);
        }

        res.json(project);
    } catch (err) {
        console.error("Create Project Error:", err);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/projects/:id
router.delete('/:id', [auth, checkRoomAccess], async (req, res) => {
    try {
        const project = req.project; // Got from middleware

        // Allow Owner of Project OR Owner of Room to delete
        const room = req.room;
        const isRoomOwner = room && room.owner.toString() === req.user.id;
        // Check if current user is in project members (creator is usually first member)
        const isProjectMember = project.members.includes(req.user.id);

        if (!isProjectMember && !isRoomOwner) {
            return res.status(403).json({ msg: 'User not authorized' });
        }

        // Remove everything the project owns: running processes, files in the DB and on disk
        await stopAllForProject(project._id);
        await destroyDeployment(project._id);
        await File.deleteMany({ project: project._id });
        await project.deleteOne();
        fs.rm(getProjectDir(project._id), { recursive: true, force: true }, () => {});

        const io = req.app.get('socketio');
        io.to(room._id.toString()).emit('room-update');

        res.json({ msg: 'Project removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/projects/:id
router.get('/:id', [auth, checkRoomAccess], async (req, res) => {
    try {
        if (!req.project) {
            return res.status(404).json({ msg: 'Project not found' });
        }

        // Re-fetch with populated members so the client gets {_id, username} objects
        let populatedProject = await Project.findById(req.project._id)
            .populate('members', 'username');

        // Retroactively enforce Room Owner in members list for older projects
        const roomOwnerStr = req.room.owner.toString();
        if (!populatedProject.members.some(m => m._id.toString() === roomOwnerStr)) {
            populatedProject = await Project.findByIdAndUpdate(
                req.project._id,
                { $addToSet: { members: req.room.owner } },
                { new: true }
            ).populate('members', 'username');
        }

        // Project access check: Must be room owner or explicitly added to the project
        const isOwner = req.room.owner.toString() === req.user.id;
        const isProjectMember = populatedProject.members.some(m => m._id.toString() === req.user.id);

        if (!isOwner && !isProjectMember) {
            return res.status(403).json({ msg: 'You must be added to this project to open it' });
        }

        res.json(populatedProject);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/projects/:id
router.put('/:id', [auth, checkRoomAccess], async (req, res) => {
    try {
        const { name, description } = req.body;
        // Middleware already fetched req.project
        let project = req.project;

        if (typeof name === 'string' && name.trim()) project.name = name.trim().slice(0, 80);
        // Any string (including '') is accepted so the description can be cleared
        if (typeof description === 'string') project.description = description.slice(0, 2000);

        await project.save();
        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/projects/:id/members
// Only the room leader (owner) can add members to projects
router.post('/:id/members', [auth, checkRoomAccess], async (req, res) => {
    try {
        // Only room leader (owner) can add members
        const isLeader = req.room.owner.toString() === req.user.id;
        
        if (!isLeader) {
            return res.status(403).json({ msg: 'Only the room leader can add members to projects' });
        }

        const { userId } = req.body;
        // Project members must come from the room — otherwise outsiders could be given file access
        if (!isValidId(String(userId || '')) || !isRoomMember(req.room, userId)) {
            return res.status(400).json({ msg: 'Only members of this room can be added to its projects' });
        }
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { members: userId } },
            { new: true }
        ).populate('members', 'username');

        // Emitting a SYSTEM chat message for the action
        try {
            const addedUser = await User.findById(userId).select('username');
            const leader = await User.findById(req.user.id).select('username');
            const roomId = req.room._id.toString();
            
            const chatMsg = new Message({
                room: roomId,
                sender: req.user.id,
                text: `added ${addedUser.username} to project "${project.name}"`
            });
            await chatMsg.save();
            const io = req.app.get('socketio');
            io.to(roomId).emit('message', { 
                ...chatMsg.toObject(), 
                sender: { _id: leader._id, username: 'System' },
                text: `${leader.username} added ${addedUser.username} to project "${project.name}"` 
            });
        } catch (msgErr) {
            console.error('Error sending system chat message:', msgErr);
        }

        res.json(project.members);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/projects/:id/members/:memberId
// Only the room leader (owner) can remove members from projects
router.delete('/:id/members/:memberId', [auth, checkRoomAccess], async (req, res) => {
    try {
        // Only room leader (owner) can remove members
        const isLeader = req.room.owner.toString() === req.user.id;
        
        if (!isLeader) {
            return res.status(403).json({ msg: 'Only the room leader can remove members from projects' });
        }

        // Leader (room owner) cannot be removed from the project
        if (req.params.memberId === req.room.owner.toString()) {
            return res.status(400).json({ msg: 'The room leader cannot be removed from the project' });
        }

        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { $pull: { members: req.params.memberId } },
            { new: true }
        ).populate('members', 'username');

        res.json(project.members);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/projects/:id/restore-template
// --- ENVIRONMENT VARIABLES / SECRETS ---
// Only project members (and the room owner) can see or change them. Values are write-only:
// the client only ever gets a masked preview back.
const requireProjectMember = (req, res, next) => {
    const isOwner = req.room.owner.toString() === req.user.id;
    const isMember = req.project.members.some(m => m.toString() === req.user.id);
    if (!isOwner && !isMember) return res.status(403).json({ msg: 'You must be a member of this project' });
    next();
};

const maskedEnv = (envVars) => envVars.map(({ key, value }) => {
    let preview = '••••••';
    try {
        const plain = decrypt(value);
        preview = plain.length > 6 ? `••••••${plain.slice(-2)}` : '••••••';
    } catch { /* unreadable */ }
    return { key, preview };
});

// @route   GET api/projects/:id/env
router.get('/:id/env', [auth, checkRoomAccess, requireProjectMember], (req, res) => {
    res.json({ envVars: maskedEnv(req.project.envVars || []) });
});

// @route   PUT api/projects/:id/env
// Body: { envVars: [{ key, value? }] } — the full list. Omit `value` to keep an existing secret.
router.put('/:id/env', [auth, checkRoomAccess, requireProjectMember], async (req, res) => {
    try {
        const incoming = Array.isArray(req.body.envVars) ? req.body.envVars : null;
        if (!incoming || incoming.length > 50) return res.status(400).json({ msg: 'envVars must be a list of at most 50 entries' });

        const existing = new Map((req.project.envVars || []).map(e => [e.key, e.value]));
        const seen = new Set();
        const next = [];
        for (const entry of incoming) {
            const key = typeof entry?.key === 'string' ? entry.key.trim() : '';
            const error = validateKey(key);
            if (error) return res.status(400).json({ msg: `${key || '(empty)'}: ${error}` });
            if (seen.has(key)) return res.status(400).json({ msg: `${key} is listed twice` });
            seen.add(key);

            if (typeof entry.value === 'string') {
                if (entry.value.length > 10000) return res.status(400).json({ msg: `${key}: value is too long` });
                next.push({ key, value: encrypt(entry.value) });
            } else if (existing.has(key)) {
                next.push({ key, value: existing.get(key) });
            } else {
                return res.status(400).json({ msg: `${key}: a value is required` });
            }
        }

        req.project.envVars = next;
        await req.project.save();
        res.json({ envVars: maskedEnv(next), msg: 'Saved. Restart the app / redeploy to apply.' });
    } catch (err) {
        console.error('Env update error:', err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/:id/restore-template', [auth, checkRoomAccess], async (req, res) => {
    try {
        const { templateName } = req.body;
        // Use provided template name or default to project type
        const typeToUse = templateName || req.project.projectType;

        await createProjectFiles(typeToUse, req.project._id);

        // Notify room of file updates
        const io = req.app.get('socketio');
        // We might want a specific event for file refresh, but room-update works
        io.to(req.project.room.toString()).emit('room-update');

        res.json({ msg: 'Template restored successfully' });
    } catch (err) {
        console.error("Restore Template Error:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;