const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const { isValidId } = require('../utils/access');
const { sendRoomInvite } = require('./rooms');

// @route   GET api/notifications
// @desc    Get current user's notifications
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id }).sort({ date: -1 }).limit(100);
        res.json(notifications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/notifications/invite
// @desc    Send a room invitation to another user (same rules as /api/rooms/:id/send-invite)
router.post('/invite', auth, async (req, res) => {
    try {
        const { targetUserId, roomId, message } = req.body;
        if (!isValidId(String(roomId || ''))) return res.status(400).json({ msg: 'Valid room ID required' });
        return await sendRoomInvite(req, res, roomId, targetUserId, message);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/notifications/read
// @desc    Mark all of the current user's notifications as read
router.put('/read', auth, async (req, res) => {
    try {
        await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
        res.json({ msg: 'Notifications marked as read' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/notifications/:id
// @desc    Dismiss one of the current user's notifications
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(404).json({ msg: 'Notification not found' });
        const result = await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
        if (result.deletedCount === 0) return res.status(404).json({ msg: 'Notification not found' });
        res.json({ msg: 'Notification dismissed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
