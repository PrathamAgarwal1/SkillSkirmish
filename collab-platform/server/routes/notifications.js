const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');

// @route   GET api/notifications
// @desc    Get current user's notifications
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id }).sort({ date: -1 });
        res.json(notifications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/notifications/invite
// @desc    Send a room invitation to another user
router.post('/invite', auth, async (req, res) => {
    const { targetUserId, roomId, roomName } = req.body;
    
    try {
        const sender = await User.findById(req.user.id).select('username');
        
        // Notification Message
        const message = `${sender.username} invited you to join room: ${roomName}`;
        
        // Create Notification with TYPE and RELATEDID
        const notification = new Notification({
            user: targetUserId,
            message: message,
            type: 'invite',    // REQUIRED for button
            relatedId: roomId  // REQUIRED for link
        });
        
        await notification.save();

        // Send Real-time Socket Event
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const recipientSocketId = userSocketMap[targetUserId];

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-notification', notification);
        }

        res.json({ msg: 'Invitation sent' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;