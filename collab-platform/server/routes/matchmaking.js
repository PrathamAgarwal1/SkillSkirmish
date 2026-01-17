const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { generateJSON } = require('../utils/aiHelper');

// @route   POST api/matchmaking/find-match
router.post('/find-match', auth, async (req, res) => {
    try {
        const { requiredSkills, minElo } = req.body; // e.g., ["React", "Node"]
        const requestorId = req.user.id;

        // 1. Pre-filter Candidates via Database (Scalability Fix)
        // Find users who have at least ONE of the required skills
        // This avoids sending the entire user base to the LLM
        const query = {
            _id: { $ne: requestorId }
        };

        if (requiredSkills && requiredSkills.length > 0) {
            query['skills.name'] = { $in: requiredSkills.map(s => new RegExp(s, 'i')) };
        }

        let candidates = await User.find(query)
            .select('username skills projects')
            .limit(20) // Limit to top 20 matches from DB to fit context window
            .lean();

        // If strict filtering yields no results, fallback to a broader search (recent active users)
        if (candidates.length === 0) {
            candidates = await User.find({ _id: { $ne: requestorId } })
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('username skills projects')
                .lean();
        }

        if (candidates.length === 0) {
            return res.status(404).json({ reason: "No developers found." });
        }

        // 2. Prepare Data for AI Ranking
        const candidateSummary = candidates.map(u => ({
            id: u._id,
            name: u.username,
            skills: u.skills ? u.skills.map(s => `${s.name} (${s.elo})`).join(', ') : "None",
            projects: u.projects ? u.projects.length : 0
        }));

        const prompt = `
            Act as an embedded HR Tech Matchmaker.
            My Project Needs: ${requiredSkills.join(', ')}
            Min ELO Preference: ${minElo || 0}

            Candidate Pool:
            ${JSON.stringify(candidateSummary)}

            Task:
            Analyze the candidates and select the TOP 3 matches based on skill overlap and expertise.
            
            Return strictly a JSON object with this structure:
            {
                "matches": [
                    {
                        "userId": "id_here",
                        "matchScore": 95,
                        "reason": "Expert in React with high ELO."
                    },
                    ...
                ]
            }
        `;

        // 3. Call AI with Fallback
        let result;
        try {
            result = await generateJSON(prompt);
        } catch (aiError) {
            console.error("⚠️ AI Matchmaking Failed (Providers down). Using Fallback.", aiError.message);
            result = null; // Trigger fallback below
        }

        if (!result || !result.matches) {
            // Fallback if AI fails to return structure
            const fallbackMatches = candidates.slice(0, 3).map(c => ({
                userId: c._id,
                matchScore: 50 + Math.floor(Math.random() * 30), // Random score 50-80
                reason: "Matched based on database skill overlap (AI service unavailable)."
            }));
            return res.json({ matches: fallbackMatches });
        }

        res.json(result);

    } catch (err) {
        console.error("Matchmaking Critical Error:", err);
        res.status(500).json({ msg: 'Server Error during matchmaking', matches: [] });
    }
});

module.exports = router;