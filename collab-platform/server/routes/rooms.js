const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const User = require('../models/User');
const Message = require('../models/Message'); // Import Message Model

// @route   GET api/rooms/myrooms
router.get('/myrooms', auth, async (req, res) => {
    try {
        const rooms = await Room.find({
            $or: [
                { owner: req.user.id },
                { members: req.user.id }
            ]
        }).populate('owner', 'username').sort({ updatedAt: -1 });
        res.json(rooms);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/search
router.get('/search', auth, async (req, res) => {
    try {
        const { q } = req.query;
        const query = q ? { name: { $regex: q, $options: 'i' } } : {};
        query.isPrivate = false;
        const rooms = await Room.find(query).populate('owner', 'username');
        res.json(rooms);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id)
            .populate('owner', 'username')
            .populate('members', 'username');

        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const isOwner = room.owner._id.toString() === req.user.id;
        const isMember = room.members.some(m => m._id.toString() === req.user.id);

        if (!isOwner && !isMember) {
            return res.status(403).json({ msg: 'Access Denied' });
        }

        res.json(room);
    } catch (err) {
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Room not found' });
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/:id/messages  <-- THIS FIXES CHAT LOADING
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const messages = await Message.find({ room: req.params.id })
            .populate('sender', 'username')
            .sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        console.error("Chat Load Error:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms
router.post('/', auth, async (req, res) => {
    try {
        const newRoom = new Room({
            name: req.body.name,
            description: req.body.description,
            owner: req.user.id,
            members: []
        });
        const room = await newRoom.save();
        res.json(room);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/accept-invite
router.post('/:id/accept-invite', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        if (room.members.includes(req.user.id) || room.owner.toString() === req.user.id) {
            return res.json({ msg: 'Already a member', roomId: room._id });
        }

        room.members.push(req.user.id);
        await room.save();
        res.json({ msg: 'Joined successfully', roomId: room._id });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/request-join
router.post('/:id/request-join', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        if (room.members.includes(req.user.id) || room.owner.toString() === req.user.id) {
            return res.status(400).json({ msg: 'Already a member' });
        }

        // Check availability of Notification model (Lazy load if needed or ensure import)
        const Notification = require('../models/Notification');

        // Check if request already pending
        const existingReq = await Notification.findOne({
            recipient: room.owner,
            type: 'join_request',
            relatedId: room._id, // Room ID
            sender: req.user.id // Requester
        });

        if (existingReq) {
            return res.status(400).json({ msg: 'Request already sent' });
        }

        // Create Notification for Owner
        const newNotif = new Notification({
            recipient: room.owner,
            sender: req.user.id, // The person requesting
            type: 'join_request', // New Type
            message: `${req.user.username} wants to join ${room.name}`,
            relatedId: room._id // Store Room ID here
        });
        await newNotif.save();

        // **SOCKET EMIT TO OWNER VIA IO**
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        if (io && userSocketMap) {
            const recipientSocketId = userSocketMap[room.owner.toString()];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new-notification', newNotif);
            }
        }

        res.json({ msg: 'Join request sent to owner' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/approve-join
router.post('/:id/approve-join', auth, async (req, res) => {
    try {
        const { userId, notificationId } = req.body; // User to approve
        const room = await Room.findById(req.params.id);

        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) return res.status(401).json({ msg: 'Not Authorized' });

        if (!room.members.includes(userId)) {
            room.members.push(userId);
            await room.save();
        }

        // Delete the notification
        const Notification = require('../models/Notification');
        if (notificationId) {
            await Notification.findByIdAndDelete(notificationId);
        }

        // Notify the user they were accepted
        const newNotif = new Notification({
            recipient: userId,
            sender: req.user.id,
            type: 'invite', // Re-using invite type so they see "Accept" or we can just auto-add?
            // "invite" type logic in Dashboard allows "Accept". 
            // Better: Make a 'system' msg or just rely on them seeing the room now.
            // Let's send a generic "system" message for now.
            message: `Your request to join ${room.name} was approved!`,
            relatedId: room._id,
            type: 'info'
        });
        await newNotif.save();

        res.json({ msg: 'User approved', roomId: room._id });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/rooms/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });
        await room.deleteOne();
        res.json({ msg: 'Room removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;