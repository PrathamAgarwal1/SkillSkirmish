const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   POST api/matchmaking/find-match
router.post('/find-match', auth, async (req, res) => {
    try {
        const { requiredSkills, minElo } = req.body;
        const requestorId = req.user.id;

        // Simple database query - find users with matching skills
        let matches = [];
        
        if (requiredSkills && requiredSkills.length > 0) {
            // Search for users with the skill
            matches = await User.find({
                _id: { $ne: requestorId },
                'skills.name': { $in: requiredSkills.map(s => new RegExp(s, 'i')) }
            })
                .select('username skills')
                .limit(10)
                .lean();
        }

        // If no skill matches, get any other users
        if (matches.length === 0) {
            matches = await User.find({ _id: { $ne: requestorId } })
                .select('username skills')
                .sort({ updatedAt: -1 })
                .limit(10)
                .lean();
        }

        if (matches.length === 0) {
            return res.status(404).json({ reason: "No users found." });
        }

        // Format response with real users
        const formattedMatches = matches.map((user, idx) => ({
            userId: user._id.toString(),
            username: user.username,
            matchScore: 80 - (idx * 5),
            reason: user.skills && user.skills.length > 0 
                ? `Skills: ${user.skills.map(s => s.name).join(', ')}`
                : 'Active developer',
            skills: user.skills ? user.skills.map(s => ({ name: s.name, elo: s.elo })) : []
        }));

        res.json({ matches: formattedMatches });

    } catch (err) {
        console.error("Matchmaking Error:", err);
        res.status(500).json({ msg: 'Server Error', reason: err.message });
    }
});

module.exports = router;