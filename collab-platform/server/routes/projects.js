const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Project = require('../models/Project');
const Room = require('../models/Room');
const User = require('../models/User');
const Notification = require('../models/Notification');
// Import the template manager to create File documents correctly
const { createProjectFiles } = require('../utils/templateManager');

// --- MIDDLEWARE: Check Room Access ---
const checkRoomAccess = async (req, res, next) => {
    try {
        const roomId = req.body.roomId || req.params.roomId;
        
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
            return res.status(401).json({ msg: 'Not authorized to modify this room' });
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
        const projects = await Project.find({ room: req.params.roomId }).sort({ updatedAt: -1 });
        res.json(projects);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/projects
router.post('/', [auth, checkRoomAccess], async (req, res) => {
    const { name, description, projectType = 'React App', roomId } = req.body;
    
    try {
        const room = req.room; 
        
        const newProject = new Project({
            name,
            description,
            projectType, // Save the type (e.g., 'React App')
            room: roomId,
            members: [req.user.id] // Add creator as a member
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
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await project.deleteOne();
        
        const io = req.app.get('socketio');
        io.to(room._id.toString()).emit('room-update');

        res.json({ msg: 'Project removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/projects/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ msg: 'Project not found' });
        res.json(project);
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

        if (name) project.name = name;
        if (description) project.description = description;
        
        await project.save();
        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/projects/:id/members
router.post('/:id/members', [auth, checkRoomAccess], async (req, res) => {
    try {
        const { userId } = req.body;
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { members: userId } },
            { new: true }
        ).populate('members', 'username');
        
        res.json(project.members);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/projects/:id/members/:memberId
router.delete('/:id/members/:memberId', [auth, checkRoomAccess], async (req, res) => {
    try {
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

module.exports = router;