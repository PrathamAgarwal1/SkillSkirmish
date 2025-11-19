const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User'); // Using User model
const { generateJSON } = require('../utils/aiHelper'); // Import the new helper

// @route   POST api/matchmaking/find-match
router.post('/find-match', auth, async (req, res) => {
    try {
        const { requiredSkills, minElo } = req.body;
        const requestorId = req.user.id;

        // 1. Fetch Candidates (excluding requester)
        const candidates = await User.find({
            _id: { $ne: requestorId }
        }).select('-password');

        if (candidates.length === 0) {
            return res.status(404).json({ reason: "No other developers found in the database." });
        }

        // 2. Prepare Data for AI
        const candidateSummary = candidates.map(u => ({
            userId: u._id,
            name: u.username,
            skills: u.skills ? u.skills.map(s => `${s.name} (ELO: ${s.elo || 1200})`).join(', ') : "No skills"
        }));

        const prompt = `
            I need a developer for a project requiring: ${requiredSkills.join(', ')}.
            Minimum ELO preference: ${minElo}.
            
            Analyze these candidates:
            ${JSON.stringify(candidateSummary)}
            
            Select the BEST single match.
            Return ONLY a raw JSON object (no markdown, no backticks):
            {
                "userId": "id_of_best_match",
                "reason": "A short explanation of why they fit."
            }
        `;

        // 3. Call AI (Handles Groq -> Gemini fallback)
        const result = await generateJSON(prompt);
        res.json(result);

    } catch (err) {
        console.error("Matchmaking Error:", err.message);
        res.status(500).send('Server Error: Unable to find match');
    }
});

module.exports = router;