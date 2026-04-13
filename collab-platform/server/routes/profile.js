const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Room = require('../models/Room');
const Notification = require('../models/Notification');

// @route   GET api/profile/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/profile/user/:user_id
// @desc    Get profile by user ID
// @access  Private
router.get('/user/:user_id', auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.user_id).select('-password');
        if (!user) return res.status(404).json({ msg: 'Profile not found' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.kind == 'ObjectId') return res.status(400).json({ msg: 'Profile not found' });
        res.status(500).send('Server Error');
    }
});

// @route   GET api/profile
// @desc    Get all profiles
// @access  Public
router.get('/', async (req, res) => {
    try {
        // Return all users but mapped to a structure the frontend handles easily
        const users = await User.find().select('-password');
        const profiles = users.map(u => ({
            user: u, // Nesting it under 'user' to match frontend expectations
            skills: u.skills,
            _id: u._id
        }));
        res.json(profiles);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/profile
// @desc    Update user profile
// @access  Private
router.put('/', auth, async (req, res) => {
    const { 
        skills, socialLinks, socialsPublic, 
        bio, location, company, website, username
    } = req.body;

    const profileFields = {};
    if (skills) profileFields.skills = skills;
    if (socialLinks) profileFields.socialLinks = socialLinks;
    if (socialsPublic !== undefined) profileFields.socialsPublic = socialsPublic;
    if (bio) profileFields.bio = bio;
    if (location) profileFields.location = location;
    if (company) profileFields.company = company;
    if (website) profileFields.website = website;

    try {
        let isNameChanged = false;
        let oldUsername = '';

        if (username) {
            const existingUser = await User.findOne({ username, _id: { $ne: req.user.id } });
            if (existingUser) {
                return res.status(400).json({ msg: 'Username is already taken' });
            }
            const currentUser = await User.findById(req.user.id);
            if (currentUser && currentUser.username !== username) {
                isNameChanged = true;
                oldUsername = currentUser.username;
            }
            profileFields.username = username;
        }

        let user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true }
        ).select('-password');

        if (isNameChanged) {
            const rooms = await Room.find({ members: req.user.id });
            const membersToNotify = new Set();
            rooms.forEach(room => {
                room.members.forEach(memberId => {
                    if (memberId.toString() !== req.user.id) {
                        membersToNotify.add(memberId.toString());
                    }
                });
            });

            const notificationsToInsert = Array.from(membersToNotify).map(memberId => ({
                user: memberId,
                sender: req.user.id,
                message: `${oldUsername} changed name to ${username}`,
                type: 'info'
            }));

            if (notificationsToInsert.length > 0) {
                await Notification.insertMany(notificationsToInsert);
                
                const io = req.app.get('socketio');
                const userSocketMap = req.app.get('userSocketMap');
                if (io && userSocketMap) {
                    membersToNotify.forEach(memberId => {
                        const socketId = userSocketMap[memberId];
                        if (socketId) {
                            io.to(socketId).emit('new-notification');
                        }
                    });
                }
            }
        }

        return res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/profile/skill-elo
// @desc    Update ELO (Internal)
router.put('/skill-elo', auth, async (req, res) => {
    const { skillName, newElo } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const skillIndex = user.skills.findIndex(s => s.name === skillName);

        if (skillIndex > -1) {
            user.skills[skillIndex].elo = newElo;
            // Retain current mastery or default to 50
            if (user.skills[skillIndex].mastery === undefined) {
                user.skills[skillIndex].mastery = 50;
            }
        } else {
            user.skills.push({ 
                name: skillName, 
                elo: newElo,
                mastery: 50
            });
        }
        await user.save();
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;