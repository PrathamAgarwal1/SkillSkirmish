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
        
        if (!room.members.includes(req.user.id)) {
            room.members.push(req.user.id);
            await room.save();
        }
        res.json(room);
    } catch (err) {
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