const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

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
        bio, location, company, website 
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
        let user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true }
        ).select('-password');

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
            user.skills[skillIndex].mastery = Math.min(100, Math.max(0, Math.round((newElo / 2400) * 100)));
        } else {
            user.skills.push({ 
                name: skillName, 
                elo: newElo,
                mastery: Math.min(100, Math.max(0, Math.round((newElo / 2400) * 100)))
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