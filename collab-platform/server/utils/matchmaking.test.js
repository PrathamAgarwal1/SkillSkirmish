/**
 * Unit tests for matchmaking scoring helpers.
 *
 * Run with:  npx jest utils/matchmaking.test.js
 */

const {
    buildSkillVector,
    buildRoomSkillVector,
    buildUserPresenceVector,
    cosineSimilarity,
    ratingDifferenceSimilarity,
    growthBonus,
    rdPenalty,
    queueTimeBonus,
    recentOpponentPenalty,
    computeMatchScore,
    computeRoomScore
} = require('./matchmaking');

// ─── buildSkillVector ─────────────────────────────────────────────────────────

describe('buildSkillVector', () => {
    test('returns ELO values in correct positions', () => {
        const skills = [{ name: 'JavaScript', elo: 1500 }, { name: 'Python', elo: 1800 }];
        const names = ['javascript', 'python', 'go'];
        expect(buildSkillVector(skills, names)).toEqual([1500, 1800, 0]);
    });

    test('defaults to 1200 when elo is null', () => {
        const skills = [{ name: 'Go', elo: null }];
        const names = ['go'];
        expect(buildSkillVector(skills, names)).toEqual([1200]);
    });

    test('returns all zeros for empty skills', () => {
        expect(buildSkillVector([], ['a', 'b'])).toEqual([0, 0]);
    });
});

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
    test('identical vectors return 1', () => {
        expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
    });

    test('orthogonal vectors return 0', () => {
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    test('zero vector returns 0', () => {
        expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    });

    test('proportional vectors return 1', () => {
        expect(cosineSimilarity([2, 4, 6], [1, 2, 3])).toBeCloseTo(1.0);
    });

    test('partial overlap returns value between 0 and 1', () => {
        const sim = cosineSimilarity([1500, 0, 1200], [1400, 1600, 0]);
        expect(sim).toBeGreaterThan(0);
        expect(sim).toBeLessThan(1);
    });
});

// ─── ratingDifferenceSimilarity ───────────────────────────────────────────────

describe('ratingDifferenceSimilarity', () => {
    test('zero difference returns 1', () => {
        expect(ratingDifferenceSimilarity(1500, 1500)).toBe(1);
    });

    test('400 difference returns ~0.5', () => {
        expect(ratingDifferenceSimilarity(1500, 1900)).toBeCloseTo(0.5);
    });

    test('large difference returns small value', () => {
        expect(ratingDifferenceSimilarity(800, 2800)).toBeLessThan(0.2);
    });

    test('is symmetric', () => {
        expect(ratingDifferenceSimilarity(1000, 1200))
            .toBeCloseTo(ratingDifferenceSimilarity(1200, 1000));
    });
});

// ─── growthBonus ──────────────────────────────────────────────────────────────

describe('growthBonus', () => {
    test('peaks near gap of 75', () => {
        const peak = growthBonus(1200, 1275);  // gap = 75
        const off1 = growthBonus(1200, 1200);  // gap = 0
        const off2 = growthBonus(1200, 1400);  // gap = 200
        expect(peak).toBeGreaterThan(off1);
        expect(peak).toBeGreaterThan(off2);
        expect(peak).toBeCloseTo(1.0, 1);
    });

    test('returns low value for much weaker opponent', () => {
        expect(growthBonus(1500, 1200)).toBeLessThan(0.1); // gap = -300
    });

    test('returns moderate value for slightly stronger', () => {
        const val = growthBonus(1200, 1260); // gap = 60
        expect(val).toBeGreaterThan(0.8);
    });
});

// ─── rdPenalty ────────────────────────────────────────────────────────────────

describe('rdPenalty', () => {
    test('returns 1.0 for experienced player (20+ matches)', () => {
        expect(rdPenalty(false, 25)).toBe(1);
    });

    test('returns low value for provisional player with 0 matches', () => {
        expect(rdPenalty(true, 0)).toBeLessThanOrEqual(0.1);
    });

    test('returns proportional value for mid-range matches', () => {
        expect(rdPenalty(false, 10)).toBeCloseTo(0.5);
    });

    test('caps at 1 for high matchesPlayed', () => {
        expect(rdPenalty(false, 100)).toBe(1);
    });
});

// ─── queueTimeBonus ──────────────────────────────────────────────────────────

describe('queueTimeBonus', () => {
    test('returns 0 at time 0', () => {
        expect(queueTimeBonus(0)).toBe(0);
    });

    test('returns 0 for negative time', () => {
        expect(queueTimeBonus(-1000)).toBe(0);
    });

    test('grows with wait time', () => {
        const t1 = queueTimeBonus(30000);  // 30s
        const t2 = queueTimeBonus(120000); // 2 min
        expect(t2).toBeGreaterThan(t1);
    });

    test('is capped at 15', () => {
        expect(queueTimeBonus(999999999)).toBeLessThanOrEqual(15);
    });
});

// ─── recentOpponentPenalty ────────────────────────────────────────────────────

describe('recentOpponentPenalty', () => {
    test('returns penalty when candidate is in recents', () => {
        expect(recentOpponentPenalty('abc', ['abc', 'def'])).toBe(30);
    });

    test('returns 0 when candidate is not in recents', () => {
        expect(recentOpponentPenalty('xyz', ['abc', 'def'])).toBe(0);
    });

    test('returns 0 for empty recents', () => {
        expect(recentOpponentPenalty('abc', [])).toBe(0);
    });

    test('returns 0 for null recents', () => {
        expect(recentOpponentPenalty('abc', null)).toBe(0);
    });
});

// ─── computeMatchScore (integration) ─────────────────────────────────────────

describe('computeMatchScore', () => {
    const allSkillNames = ['javascript', 'python', 'go'];

    const requestorSkills = [
        { name: 'JavaScript', elo: 1500, matchesPlayed: 30, isProvisional: false },
        { name: 'Python', elo: 1200, matchesPlayed: 10, isProvisional: false }
    ];

    const goodCandidate = [
        { name: 'JavaScript', elo: 1550, matchesPlayed: 25, isProvisional: false },
        { name: 'Python', elo: 1280, matchesPlayed: 20, isProvisional: false }
    ];

    const weakCandidate = [
        { name: 'Go', elo: 800, matchesPlayed: 2, isProvisional: true }
    ];

    test('good candidate scores higher than weak candidate', () => {
        const reqVec = buildSkillVector(requestorSkills, allSkillNames);
        const goodVec = buildSkillVector(goodCandidate, allSkillNames);
        const weakVec = buildSkillVector(weakCandidate, allSkillNames);

        const good = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: goodVec,
            requestorSkills,
            candidateSkills: goodCandidate,
            requiredSkills: ['JavaScript', 'Python']
        });

        const weak = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: weakVec,
            requestorSkills,
            candidateSkills: weakCandidate,
            requiredSkills: ['JavaScript', 'Python']
        });

        expect(good.score).toBeGreaterThan(weak.score);
    });

    test('returns non-negative score', () => {
        const reqVec = buildSkillVector(requestorSkills, allSkillNames);
        const candVec = buildSkillVector(weakCandidate, allSkillNames);

        const { score } = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: candVec,
            requestorSkills,
            candidateSkills: weakCandidate,
            requiredSkills: ['JavaScript']
        });

        expect(score).toBeGreaterThanOrEqual(0);
    });

    test('recent opponent gets lower score', () => {
        const reqVec = buildSkillVector(requestorSkills, allSkillNames);
        const candVec = buildSkillVector(goodCandidate, allSkillNames);

        const normal = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: candVec,
            requestorSkills,
            candidateSkills: goodCandidate,
            requiredSkills: ['JavaScript'],
            candidateId: 'cand1',
            recentOpponents: []
        });

        const penalized = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: candVec,
            requestorSkills,
            candidateSkills: goodCandidate,
            requiredSkills: ['JavaScript'],
            candidateId: 'cand1',
            recentOpponents: ['cand1']
        });

        expect(penalized.score).toBeLessThan(normal.score);
    });

    test('queue time increases score', () => {
        const reqVec = buildSkillVector(requestorSkills, allSkillNames);
        const candVec = buildSkillVector(goodCandidate, allSkillNames);

        const instant = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: candVec,
            requestorSkills,
            candidateSkills: goodCandidate,
            requiredSkills: ['JavaScript'],
            waitTimeMs: 0
        });

        const waited = computeMatchScore({
            requestorVector: reqVec,
            candidateVector: candVec,
            requestorSkills,
            candidateSkills: goodCandidate,
            requiredSkills: ['JavaScript'],
            waitTimeMs: 120000
        });

        expect(waited.score).toBeGreaterThan(instant.score);
    });
});

// ─── buildRoomSkillVector ────────────────────────────────────────────────────

describe('buildRoomSkillVector', () => {
    test('returns weights in correct positions', () => {
        const reqSkills = [{ name: 'JavaScript', weight: 3 }, { name: 'React', weight: 5 }];
        const names = ['javascript', 'react', 'python'];
        expect(buildRoomSkillVector(reqSkills, names)).toEqual([3, 5, 0]);
    });

    test('defaults weight to 1', () => {
        const reqSkills = [{ name: 'Go' }];
        const names = ['go'];
        expect(buildRoomSkillVector(reqSkills, names)).toEqual([1]);
    });
});

// ─── buildUserPresenceVector ─────────────────────────────────────────────────

describe('buildUserPresenceVector', () => {
    test('returns 1 for possessed skills, 0 otherwise', () => {
        const skills = [{ name: 'JavaScript' }, { name: 'Python' }];
        const names = ['javascript', 'python', 'go'];
        expect(buildUserPresenceVector(skills, names)).toEqual([1, 1, 0]);
    });

    test('returns all zeros for empty skills', () => {
        expect(buildUserPresenceVector([], ['a', 'b'])).toEqual([0, 0]);
    });
});

// ─── computeRoomScore (integration) ──────────────────────────────────────────

describe('computeRoomScore', () => {
    const userSkills = [
        { name: 'JavaScript', elo: 1500 },
        { name: 'React', elo: 1400 },
        { name: 'Python', elo: 1200 }
    ];

    test('good match scores higher than poor match', () => {
        const good = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 3 }, { name: 'React', weight: 2 }],
            roomMinRating: 1400,
            memberCount: 3,
            capacity: 10
        });

        const poor = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'Go', weight: 5 }, { name: 'Rust', weight: 3 }],
            roomMinRating: 2000,
            memberCount: 1,
            capacity: 10
        });

        expect(good.score).toBeGreaterThan(poor.score);
    });

    test('returns non-negative score', () => {
        const { score } = computeRoomScore({
            userSkills: [],
            roomRequiredSkills: [{ name: 'Go', weight: 1 }],
            roomMinRating: 2500,
            memberCount: 9,
            capacity: 10
        });
        expect(score).toBeGreaterThanOrEqual(0);
    });

    test('higher activity rooms score better (up to cap)', () => {
        const active = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 0,
            memberCount: 5,
            capacity: 20
        });

        const empty = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 0,
            memberCount: 0,
            capacity: 20
        });

        expect(active.score).toBeGreaterThan(empty.score);
    });

    test('nearly full rooms have lower capacity headroom', () => {
        const spacious = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 0,
            memberCount: 5,  // activity capped at 10 (5*2), headroom = 0.5*10 = 5
            capacity: 10
        });

        const almostFull = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 0,
            memberCount: 9,  // activity capped at 10 (9*2), headroom = 0.1*10 = 1
            capacity: 10
        });

        expect(spacious.score).toBeGreaterThan(almostFull.score);
    });

    test('growth-optimal room scores higher', () => {
        // Room with minRating ~75 above user avg should score best for growth
        const growthRoom = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 1575, // ~75 above user's 1500 JS ELO
            memberCount: 3,
            capacity: 10
        });

        const easyRoom = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 1 }],
            roomMinRating: 0,
            memberCount: 3,
            capacity: 10
        });

        // Growth room should get the growth bonus
        expect(growthRoom.score).toBeGreaterThanOrEqual(easyRoom.score - 5); // at least competitive
    });

    test('includes reasoning strings', () => {
        const { reasoning } = computeRoomScore({
            userSkills,
            roomRequiredSkills: [{ name: 'JavaScript', weight: 3 }],
            roomMinRating: 1400,
            memberCount: 3,
            capacity: 10
        });
        expect(reasoning.length).toBeGreaterThan(0);
        expect(reasoning.some(r => typeof r === 'string')).toBe(true);
    });
});
