const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
    WEIGHTS,
    buildSkillVector,
    computeMatchScore
} = require('../utils/matchmaking');

// @route   POST api/matchmaking/find-match
router.post('/find-match', auth, async (req, res) => {
    try {
        const { requiredSkills, minElo, queueStartTime, recentOpponents } = req.body;
        const requestorId = req.user.id;

        // 1. Fetch Requestor Profile
        const requestor = await User.findById(requestorId).select('skills');
        const requestorSkills = requestor ? requestor.skills : [];

        // 2. Fetch Potential Candidates
        let candidates = await User.find({
            _id: { $ne: requestorId }
        }).select('username skills bio location').lean();

        // 3. Collect the union of all skill names (for consistent vector space)
        const allSkillNamesSet = new Set();
        for (const s of requestorSkills) allSkillNamesSet.add(s.name.toLowerCase());
        for (const c of candidates) {
            for (const s of (c.skills || [])) allSkillNamesSet.add(s.name.toLowerCase());
        }
        const allSkillNames = Array.from(allSkillNamesSet);

        // 4. Build requestor's skill vector once
        const requestorVector = buildSkillVector(requestorSkills, allSkillNames);

        // Compute queue wait time
        const waitTimeMs = queueStartTime
            ? Math.max(0, Date.now() - new Date(queueStartTime).getTime())
            : 0;

        // 5. Score Each Candidate using the new composite scoring
        const scoredMatches = candidates.map(candidate => {
            const candidateSkills = candidate.skills || [];
            const candidateVector = buildSkillVector(candidateSkills, allSkillNames);

            const { score, reasoning } = computeMatchScore({
                requestorVector,
                candidateVector,
                requestorSkills,
                candidateSkills,
                requiredSkills,
                waitTimeMs,
                candidateId: candidate._id.toString(),
                recentOpponents: recentOpponents || []
            });

            return {
                userId: candidate._id.toString(),
                username: candidate.username,
                matchScore: score,
                reason: reasoning.length > 0 ? reasoning.join(' + ') : 'Active Developer',
                skills: candidateSkills.map(s => ({ name: s.name, elo: s.elo }))
            };
        });

        // 6. Sort by Score Descending
        scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

        // 7. Apply Minimum Match Quality Threshold
        let filtered = scoredMatches.filter(m => m.matchScore >= WEIGHTS.MIN_MATCH_SCORE);

        // Always guarantee at least MIN_GUARANTEED_RESULTS matches
        if (filtered.length < WEIGHTS.MIN_GUARANTEED_RESULTS) {
            filtered = scoredMatches.slice(0, WEIGHTS.MIN_GUARANTEED_RESULTS);
        }

        // 8. Return Top 10
        res.json({ matches: filtered.slice(0, 10) });

    } catch (err) {
        console.error("Matchmaking Error:", err);
        res.status(500).json({ msg: 'Server Error', reason: err.message });
    }
});

module.exports = router;