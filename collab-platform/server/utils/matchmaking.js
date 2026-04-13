/**
 * matchmaking.js — Pure helper functions for the enhanced matchmaking scoring system.
 *
 * All functions are stateless (no DB calls) and designed for easy unit testing.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
    SKILL_SIMILARITY: 40,     // max points from cosine skill similarity
    RATING_SIMILARITY: 20,    // max points from ELO proximity
    GROWTH_BONUS: 10,         // max points from growth-based matching
    MASTERY_WEIGHT: 15,       // max points from mastery freshness
    QUEUE_TIME_CAP: 15,       // hard cap on queue-time bonus
    RECENT_OPPONENT_PENALTY: 30, // flat penalty for recently matched opponents
    MIN_MATCH_SCORE: 15,      // minimum acceptable match quality
    MIN_GUARANTEED_RESULTS: 3 // always return at least this many matches
};

const NON_LINEAR_POWER = 1.5; // exponent for non-linear weighting

// ─── Skill Vector Helpers ─────────────────────────────────────────────────────

/**
 * Builds a numeric rating vector for a user's skills.
 *
 * @param {Array<{name: string, elo?: number}>} userSkills - The user's skill array.
 * @param {string[]} allSkillNames - Union of all skill names to create a consistent vector space.
 * @returns {number[]} A vector with one entry per skill name (ELO or 0 if absent).
 */
function buildSkillVector(userSkills, allSkillNames) {
    const skillMap = new Map();
    for (const s of userSkills) {
        skillMap.set(s.name.toLowerCase(), s.elo || 1200);
    }
    return allSkillNames.map(name => skillMap.get(name.toLowerCase()) || 0);
}

/**
 * Computes the cosine similarity between two numeric vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Similarity in [0, 1]. Returns 0 if either vector is zero.
 */
function cosineSimilarity(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot  += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

// ─── Rating Helpers ───────────────────────────────────────────────────────────

/**
 * Normalizes the absolute ELO difference into a 0–1 similarity score.
 * Uses a smooth decay curve instead of the old linear 0–1000 ramp.
 *
 * ratingDifferenceSimilarity(0) = 1
 * ratingDifferenceSimilarity(400) ≈ 0.5
 * ratingDifferenceSimilarity(1200) ≈ 0.25
 *
 * @param {number} myElo
 * @param {number} theirElo
 * @returns {number} Similarity in [0, 1].
 */
function ratingDifferenceSimilarity(myElo, theirElo) {
    const diff = Math.abs(myElo - theirElo);
    return 1 / (1 + diff / 400);
}

/**
 * Growth-based matchmaking bonus.
 * Prefers opponents who are slightly stronger (ideal gap ~50–100 ELO above).
 * Uses a Gaussian-like curve centered at gap = 75.
 *
 * @param {number} myElo
 * @param {number} theirElo
 * @returns {number} Bonus in [0, 1]. Peaks when theirElo is ~75 above myElo.
 */
function growthBonus(myElo, theirElo) {
    const gap = theirElo - myElo; // positive = opponent is stronger
    const idealGap = 75;
    const sigma = 50;
    return Math.exp(-Math.pow(gap - idealGap, 2) / (2 * sigma * sigma));
}

// ─── Reliability & Penalty Helpers ────────────────────────────────────────────

/**
 * Rating Deviation penalty.
 * Uses matchesPlayed as a proxy for rating certainty.
 * Players with < 20 matches get a proportionally lower trust multiplier.
 *
 * @param {boolean} isProvisional
 * @param {number} matchesPlayed
 * @returns {number} Trust multiplier in [0, 1]. 1.0 = fully trusted.
 */
function rdPenalty(isProvisional, matchesPlayed) {
    // Use matchesPlayed as the primary signal; isProvisional is a hard flag
    if (isProvisional && matchesPlayed < 5) {
        return Math.max(0.1, matchesPlayed / 20);
    }
    return Math.min(1, matchesPlayed / 20);
}

/**
 * Logarithmic queue-time bonus.
 * Starts slow, grows with wait time, hard-capped at QUEUE_TIME_CAP.
 *
 * @param {number} waitTimeMs - Milliseconds the requestor has been in queue.
 * @returns {number} Bonus points (0 to QUEUE_TIME_CAP).
 */
function queueTimeBonus(waitTimeMs) {
    if (waitTimeMs <= 0) return 0;
    const raw = 5 * Math.log2(1 + waitTimeMs / 30000);
    return Math.min(WEIGHTS.QUEUE_TIME_CAP, raw);
}

/**
 * Penalty for recently matched opponents to prevent repetitive matches.
 *
 * @param {string} candidateId - The candidate's user ID.
 * @param {string[]} recentOpponents - Array of recently matched opponent IDs.
 * @returns {number} Penalty points to subtract (0 or RECENT_OPPONENT_PENALTY).
 */
function recentOpponentPenalty(candidateId, recentOpponents) {
    if (!recentOpponents || recentOpponents.length === 0) return 0;
    return recentOpponents.includes(candidateId) ? WEIGHTS.RECENT_OPPONENT_PENALTY : 0;
}

/**
 * Mastery-based quality multiplier.
 * Candidates with higher mastery (skill freshness) are prioritized.
 * Low mastery (from skill decay) signals stale/inactive skills.
 *
 * Uses sqrt curve: mastery 100% → 1.0,  50% → 0.71,  0% → 0.3 (floor)
 *
 * @param {Array<{name: string, mastery?: number}>} candidateSkills - Candidate's skill objects.
 * @param {string[]} requiredSkills - Skills being evaluated.
 * @returns {{ multiplier: number, avgMastery: number }}
 */
function masteryMultiplier(candidateSkills, requiredSkills) {
    const skillsToCheck = (requiredSkills && requiredSkills.length > 0)
        ? requiredSkills
        : candidateSkills.map(s => s.name);

    let totalMastery = 0;
    let count = 0;

    for (const skillName of skillsToCheck) {
        const s = candidateSkills.find(sk => sk.name.toLowerCase() === skillName.toLowerCase());
        if (s) {
            totalMastery += (s.mastery != null ? s.mastery : 50); // default 50 if never set
            count++;
        }
    }

    if (count === 0) return { multiplier: 0.3, avgMastery: 0 };

    const avgMastery = totalMastery / count;
    // sqrt curve: 100→1.0, 50→0.71, 25→0.5, 0→0.3 (floor)
    const raw = Math.sqrt(avgMastery / 100);
    const multiplier = Math.max(0.3, raw);

    return { multiplier, avgMastery: Math.round(avgMastery) };
}

// ─── Composite Scoring ───────────────────────────────────────────────────────

/**
 * Computes the full match score for a single candidate against the requestor.
 *
 * @param {Object} params
 * @param {number[]} params.requestorVector - Requestor's skill vector.
 * @param {number[]} params.candidateVector - Candidate's skill vector.
 * @param {Array<{name: string, elo?: number}>} params.requestorSkills - Requestor's skill objects.
 * @param {Array<{name: string, elo?: number, matchesPlayed?: number, isProvisional?: boolean}>} params.candidateSkills - Candidate's skill objects.
 * @param {string[]} params.requiredSkills - Skills the requestor is seeking.
 * @param {number} params.waitTimeMs - How long the requestor has been queuing (ms).
 * @param {string} params.candidateId - Candidate's user ID.
 * @param {string[]} params.recentOpponents - Recently matched opponent IDs.
 * @returns {{ score: number, reasoning: string[] }}
 */
function computeMatchScore({
    requestorVector,
    candidateVector,
    requestorSkills,
    candidateSkills,
    requiredSkills,
    waitTimeMs = 0,
    candidateId = '',
    recentOpponents = []
}) {
    const reasoning = [];

    // ── 1. Cosine Skill Similarity (non-linear) ──
    const rawCosine = cosineSimilarity(requestorVector, candidateVector);
    const skillScore = Math.pow(rawCosine, NON_LINEAR_POWER) * WEIGHTS.SKILL_SIMILARITY;

    if (rawCosine > 0.9) {
        reasoning.push(`Excellent skill overlap (${(rawCosine * 100).toFixed(0)}%)`);
    } else if (rawCosine > 0.7) {
        reasoning.push(`Strong skill overlap (${(rawCosine * 100).toFixed(0)}%)`);
    } else if (rawCosine > 0.4) {
        reasoning.push(`Moderate skill overlap (${(rawCosine * 100).toFixed(0)}%)`);
    }

    // ── Helper to find ELO ──
    const getElo = (skills, name) => {
        const s = skills.find(sk => sk.name.toLowerCase() === name.toLowerCase());
        return s ? (s.elo || 1200) : 1200;
    };

    const getMatchesPlayed = (skills, name) => {
        const s = skills.find(sk => sk.name.toLowerCase() === name.toLowerCase());
        return s ? (s.matchesPlayed || 0) : 0;
    };

    const getIsProvisional = (skills, name) => {
        const s = skills.find(sk => sk.name.toLowerCase() === name.toLowerCase());
        return s ? (s.isProvisional !== false) : true;
    };

    // ── 2. Per-skill Rating Similarity & Growth Bonus ──
    let totalRatingSim = 0;
    let totalGrowth = 0;
    let totalRd = 0;
    let skillCount = 0;

    const skillsToEvaluate = (requiredSkills && requiredSkills.length > 0)
        ? requiredSkills
        : candidateSkills.map(s => s.name);

    for (const skillName of skillsToEvaluate) {
        const myElo = getElo(requestorSkills, skillName);
        const theirElo = getElo(candidateSkills, skillName);

        // Only count if candidate actually has this skill
        const candidateHasSkill = candidateSkills.some(
            s => s.name.toLowerCase() === skillName.toLowerCase()
        );
        if (!candidateHasSkill) continue;

        totalRatingSim += ratingDifferenceSimilarity(myElo, theirElo);
        totalGrowth += growthBonus(myElo, theirElo);

        const mp = getMatchesPlayed(candidateSkills, skillName);
        const prov = getIsProvisional(candidateSkills, skillName);
        totalRd += rdPenalty(prov, mp);

        skillCount++;

        // Per-skill reasoning (for the best matches)
        const diff = theirElo - myElo;
        if (Math.abs(diff) < 100) {
            reasoning.push(`${skillName} ELO: ${theirElo} (very close to yours)`);
        } else if (diff > 0 && diff < 200) {
            reasoning.push(`${skillName} ELO: ${theirElo} (great growth challenge)`);
        } else {
            reasoning.push(`${skillName} ELO: ${theirElo}`);
        }
    }

    if (skillCount === 0) {
        // No overlapping skills at all — give a minimal base score
        return { score: 0, reasoning: ['No overlapping skills'] };
    }

    const avgRatingSim = totalRatingSim / skillCount;
    const avgGrowth = totalGrowth / skillCount;
    const avgRd = totalRd / skillCount;

    const ratingScore = Math.pow(avgRatingSim, NON_LINEAR_POWER) * WEIGHTS.RATING_SIMILARITY;
    const growthScore = avgGrowth * WEIGHTS.GROWTH_BONUS;

    // ── 3. Combine & Apply RD Penalty ──
    let score = (skillScore + ratingScore + growthScore) * avgRd;

    // ── 3b. Mastery freshness bonus ──
    const mastery = masteryMultiplier(candidateSkills, requiredSkills);
    const masteryScore = mastery.multiplier * WEIGHTS.MASTERY_WEIGHT;
    score += masteryScore;

    if (mastery.avgMastery >= 80) {
        reasoning.push(`High skill freshness (${mastery.avgMastery}% mastery)`);
    } else if (mastery.avgMastery >= 50) {
        reasoning.push(`Moderate skill freshness (${mastery.avgMastery}% mastery)`);
    } else if (mastery.avgMastery > 0) {
        reasoning.push(`Low skill freshness (${mastery.avgMastery}% mastery — inactive)`);
    }

    // ── 4. Queue-time bonus ──
    const qtBonus = queueTimeBonus(waitTimeMs);
    score += qtBonus;

    // ── 5. Recent opponent penalty ──
    const roPenalty = recentOpponentPenalty(candidateId, recentOpponents);
    score -= roPenalty;
    if (roPenalty > 0) {
        reasoning.push('Recently matched (score reduced)');
    }

    return {
        score: Math.max(0, Math.round(score)),
        reasoning
    };
}

// ─── Room Scoring ─────────────────────────────────────────────────────────────

const ROOM_WEIGHTS = {
    SKILL_SIMILARITY: 40,    // max points from cosine skill similarity
    RATING_COMPAT: 25,       // max points from rating compatibility
    GROWTH_POTENTIAL: 15,    // max points from growth-based fit
    ACTIVITY: 10,            // max points from room activity
    CAPACITY_HEADROOM: 10,   // max points from remaining capacity
    MIN_ROOM_SCORE: 10       // minimum score to recommend
};

/**
 * Builds a weighted skill vector for a room's required skills.
 * Each skill's value = weight (1–5) instead of ELO, creating a "demand" vector.
 *
 * @param {Array<{name: string, weight?: number}>} requiredSkills - Room's required skills with weights.
 * @param {string[]} allSkillNames - Union of all skill names for consistent vector space.
 * @returns {number[]} A vector with one entry per skill name (weight or 0 if absent).
 */
function buildRoomSkillVector(requiredSkills, allSkillNames) {
    const skillMap = new Map();
    for (const s of requiredSkills) {
        skillMap.set(s.name.toLowerCase(), s.weight || 1);
    }
    return allSkillNames.map(name => skillMap.get(name.toLowerCase()) || 0);
}

/**
 * Builds a binary presence vector for a user's skills (1 if they have it, 0 if not).
 * Used for room matching where we care about whether a user HAS a skill, not their ELO.
 *
 * @param {Array<{name: string}>} userSkills - The user's skill array.
 * @param {string[]} allSkillNames - Union of all skill names.
 * @returns {number[]} A vector with 1 for possessed skills, 0 otherwise.
 */
function buildUserPresenceVector(userSkills, allSkillNames) {
    const skillSet = new Set(userSkills.map(s => s.name.toLowerCase()));
    return allSkillNames.map(name => skillSet.has(name.toLowerCase()) ? 1 : 0);
}

/**
 * Computes a recommendation score for a single room against a user.
 *
 * @param {Object} params
 * @param {Array<{name: string, elo?: number}>} params.userSkills - User's skill objects.
 * @param {Array<{name: string, weight?: number}>} params.roomRequiredSkills - Room's required skills.
 * @param {number} params.roomMinRating - Room's minimum rating requirement.
 * @param {number} params.memberCount - Current number of members in the room.
 * @param {number} params.capacity - Room's max capacity.
 * @returns {{ score: number, reasoning: string[] }}
 */
function computeRoomScore({
    userSkills,
    roomRequiredSkills,
    roomMinRating = 0,
    memberCount = 0,
    capacity = 10
}) {
    const reasoning = [];

    // Collect union of all skill names
    const allSkillNamesSet = new Set();
    for (const s of userSkills) allSkillNamesSet.add(s.name.toLowerCase());
    for (const s of roomRequiredSkills) allSkillNamesSet.add(s.name.toLowerCase());
    const allSkillNames = Array.from(allSkillNamesSet);

    // ── 1. Skill Similarity (non-linear) ──
    // User presence vector (binary) vs room weight vector
    const userVec = buildUserPresenceVector(userSkills, allSkillNames);
    const roomVec = buildRoomSkillVector(roomRequiredSkills, allSkillNames);
    const rawCosine = cosineSimilarity(userVec, roomVec);
    const skillScore = Math.pow(rawCosine, NON_LINEAR_POWER) * ROOM_WEIGHTS.SKILL_SIMILARITY;

    if (rawCosine > 0.9) {
        reasoning.push(`Excellent skill match (${(rawCosine * 100).toFixed(0)}%)`);
    } else if (rawCosine > 0.7) {
        reasoning.push(`Strong skill match (${(rawCosine * 100).toFixed(0)}%)`);
    } else if (rawCosine > 0.4) {
        reasoning.push(`Moderate skill match (${(rawCosine * 100).toFixed(0)}%)`);
    } else if (rawCosine > 0) {
        reasoning.push(`Some skill overlap (${(rawCosine * 100).toFixed(0)}%)`);
    }

    // ── 2. Rating Compatibility ──
    // Compute user's average ELO across relevant skills
    const relevantSkillNames = roomRequiredSkills.map(s => s.name.toLowerCase());
    let eloSum = 0, eloCount = 0;
    for (const us of userSkills) {
        if (relevantSkillNames.includes(us.name.toLowerCase())) {
            eloSum += (us.elo || 1200);
            eloCount++;
        }
    }
    const avgUserElo = eloCount > 0 ? eloSum / eloCount : 1200;

    // Penalize if user is below the room's minRating
    const ratingGap = Math.max(0, roomMinRating - avgUserElo);
    const ratingCompat = (1 / (1 + ratingGap / 400)) * ROOM_WEIGHTS.RATING_COMPAT;

    if (ratingGap === 0) {
        reasoning.push('Meets rating requirement');
    } else if (ratingGap < 200) {
        reasoning.push(`Slightly below room rating (gap: ${Math.round(ratingGap)})`);
    } else {
        reasoning.push(`Below room rating (gap: ${Math.round(ratingGap)})`);
    }

    // ── 3. Growth Potential ──
    // Gaussian bonus: peaks when room's minRating is 50–100 above the user's avg
    const growthGap = roomMinRating - avgUserElo;
    const idealGrowthGap = 75;
    const growthSigma = 50;
    const growthVal = Math.exp(-Math.pow(growthGap - idealGrowthGap, 2) / (2 * growthSigma * growthSigma));
    const growthScore = growthVal * ROOM_WEIGHTS.GROWTH_POTENTIAL;

    if (growthVal > 0.8) {
        reasoning.push('Great growth opportunity');
    }

    // ── 4. Activity Score ──
    const activityScore = Math.min(ROOM_WEIGHTS.ACTIVITY, memberCount * 2);

    // ── 5. Capacity Headroom ──
    const headroom = capacity > 0 ? (1 - memberCount / capacity) : 0;
    const capacityScore = Math.max(0, headroom) * ROOM_WEIGHTS.CAPACITY_HEADROOM;

    if (headroom < 0.2) {
        reasoning.push('Almost full');
    }

    // ── Total ──
    const total = skillScore + ratingCompat + growthScore + activityScore + capacityScore;

    return {
        score: Math.max(0, Math.round(total)),
        reasoning
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    WEIGHTS,
    ROOM_WEIGHTS,
    NON_LINEAR_POWER,
    buildSkillVector,
    buildRoomSkillVector,
    buildUserPresenceVector,
    cosineSimilarity,
    ratingDifferenceSimilarity,
    growthBonus,
    rdPenalty,
    queueTimeBonus,
    recentOpponentPenalty,
    masteryMultiplier,
    computeMatchScore,
    computeRoomScore
};
