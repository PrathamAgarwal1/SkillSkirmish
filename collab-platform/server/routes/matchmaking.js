const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   POST api/matchmaking/find-match
router.post('/find-match', auth, async (req, res) => {
    try {
        const { requiredSkills, minElo } = req.body;
        const requestorId = req.user.id;

        // 1. Fetch Requestor Profile to get their ELO per skill
        const requestor = await User.findById(requestorId).select('skills');
        const requestorSkills = requestor ? requestor.skills : [];

        // Helper to get ELO for a specific skill
        const getSkillElo = (skills, skillName) => {
            const s = skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return s ? s.elo || 1200 : 1200; // Default to 1200 if unrated
        };

        const getSkillMatchesPlayed = (skills, skillName) => {
            const s = skills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
            return s ? s.matchesPlayed || 0 : 0;
        };

        // 2. Fetch Potential Candidates
        // We fetch everyone (optimizable later with geospatial/pagination)
        let candidates = await User.find({
            _id: { $ne: requestorId }
        }).select('username skills bio location').lean();

        // 3. Score Each Candidate
        const scoredMatches = candidates.map(candidate => {
            let score = 0;
            let reasoningParts = [];
            const candidateSkills = candidate.skills || [];

            // A. Skill Match Score (Max 80)
            let matchedSkillsCount = 0;
            if (requiredSkills && requiredSkills.length > 0) {
                requiredSkills.forEach(reqSkill => {
                    const hasSkill = candidateSkills.some(cs => cs.name.toLowerCase().includes(reqSkill.toLowerCase()));
                    if (hasSkill) {
                        score += 40; // High reward for required skill
                        matchedSkillsCount++;

                        // B. ELO Proximity Bonus (Max 20 per skill)
                        const myElo = getSkillElo(requestorSkills, reqSkill);
                        const theirElo = getSkillElo(candidateSkills, reqSkill);
                        const diff = Math.abs(myElo - theirElo);

                        // Formula: Closer ELO = Higher Score. 
                        // If diff is 0, bonus is 20. If diff is 1000, bonus is 0.
                        const eloBonus = 20 * Math.max(0, (1 - diff / 1000));
                        score += eloBonus;

                        // C. Reliability Bonus (Prioritize active players)
                        const matchesPlayed = getSkillMatchesPlayed(candidateSkills, reqSkill);
                        const reliabilityBonus = Math.min(10, matchesPlayed); // Cap at 10 pts
                        score += reliabilityBonus;

                        // Reasoning Logic
                        if (eloBonus > 18) {
                            reasoningParts.push(`Perfect Fit! ${reqSkill} ELO: ${theirElo} (Very close to yours)`);
                        } else if (eloBonus > 14) {
                            reasoningParts.push(`Great Match! ${reqSkill} ELO: ${theirElo}`);
                        } else if (eloBonus > 10) {
                            reasoningParts.push(`Good Match. ${reqSkill} ELO: ${theirElo}`);
                        } else {
                            reasoningParts.push(`${reqSkill} User (ELO: ${theirElo})`);
                        }


                    }
                });


            } else {
                // General Browse Mode - Score based on total skill count variance?
                // For now, just active skills
                score += Math.min(50, candidateSkills.length * 10);
            }

            // Cap Score at 100 (soft cap, can go higher with bonuses)
            // score = Math.min(100, score);

            return {
                userId: candidate._id.toString(),
                username: candidate.username,
                matchScore: Math.round(score),
                reason: reasoningParts.length > 0 ? reasoningParts.join(' + ') : 'Active Developer',
                skills: candidateSkills.map(s => ({ name: s.name, elo: s.elo }))
            };
        });

        // 4. Sort by Score Descending
        scoredMatches.sort((a, b) => b.matchScore - a.matchScore);

        // 5. Return Top 10
        res.json({ matches: scoredMatches.slice(0, 10) });

    } catch (err) {
        console.error("Matchmaking Error:", err);
        res.status(500).json({ msg: 'Server Error', reason: err.message });
    }
});

module.exports = router;