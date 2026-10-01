// routes/battles.js — battle modes and content, leaderboards, your record, the daily challenge.
// (Matches themselves run over Socket.IO: battles/battleManager.js)
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Battle = require('../models/Battle');
const DailyResult = require('../models/DailyResult');
const catalog = require('../battles/catalog');
const manager = require('../battles/battleManager');
const { isValidId } = require('../utils/access');

const modeStats = (battle = {}, kind) => {
    const m = battle.modes?.[kind] || {};
    // The algorithm mode used to be the only one, with its stats at the top level
    const legacy = kind === 'algo' && !m.played && battle.played ? battle : null;
    const src = legacy || m;
    return {
        rating: src.rating ?? 1200,
        played: src.played || 0,
        wins: src.wins || 0,
        losses: src.losses || 0,
        draws: src.draws || 0,
        streak: src.streak || 0,
        bestStreak: src.bestStreak || 0
    };
};

// @route GET /api/battles/catalog — modes, quiz skills, and practice lists (with what you've solved)
router.get('/catalog', auth, async (req, res) => {
    const me = await User.findById(req.user.id).select('battle.solved').lean();
    res.json(catalog.catalogSummary(new Set(me?.battle?.solved || [])));
});

// @route GET /api/battles/leaderboard?kind=guessr
router.get('/leaderboard', auth, async (req, res) => {
    const kind = catalog.KIND_IDS.includes(req.query.kind) ? req.query.kind : 'guessr';
    const path = `battle.modes.${kind}`;
    const query = kind === 'algo'
        ? { $or: [{ [`${path}.played`]: { $gt: 0 } }, { 'battle.played': { $gt: 0 } }] }
        : { [`${path}.played`]: { $gt: 0 } };
    const users = await User.find(query).select('username profilePicture battle').limit(500).lean();
    const players = users
        .map(u => ({ userId: u._id, username: u.username, profilePicture: u.profilePicture || '', ...modeStats(u.battle, kind) }))
        .filter(p => p.played > 0)
        .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
        .slice(0, 50)
        .map((p, i) => ({ rank: i + 1, ...p }));
    res.json({ kind, players, ...manager.stats() });
});

// @route GET /api/battles/me — per-mode ratings, recent battles, a battle you're still in, daily status
router.get('/me', auth, async (req, res) => {
    const [me, recent, daily] = await Promise.all([
        User.findById(req.user.id).select('username battle').lean(),
        Battle.find({ 'players.user': req.user.id }).sort({ endedAt: -1 }).limit(15).select('-players.code').lean(),
        DailyResult.findOne({ user: req.user.id, date: manager.today() }).lean()
    ]);
    const battle = me?.battle || {};
    const modes = Object.fromEntries(catalog.KIND_IDS.map(k => [k, modeStats(battle, k)]));
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streakAlive = battle.lastDaily === manager.today() || battle.lastDaily === yesterday;
    res.json({
        username: me?.username,
        modes,
        solvedCount: (battle.solved || []).length,
        daily: { played: !!daily, score: daily?.score ?? null, streak: streakAlive ? battle.dailyStreak || 0 : 0, date: manager.today() },
        active: manager.activeMatchFor(req.user.id),
        recent: recent.map(b => ({
            id: b._id,
            kind: b.kind || 'algo',
            problem: b.problem,
            skill: b.skill,
            difficulty: b.difficulty,
            mode: b.mode,
            result: b.result,
            reason: b.reason,
            won: b.winner ? String(b.winner) === req.user.id : null,
            endedAt: b.endedAt,
            players: b.players.map(p => ({ userId: p.user, username: p.username, passed: p.passed, total: p.total, score: p.score, ratingBefore: p.ratingBefore, ratingAfter: p.ratingAfter }))
        })),
        ...manager.stats()
    });
});

// @route GET /api/battles/daily — today's CodeGuessr daily leaderboard
router.get('/daily', auth, async (req, res) => {
    const date = manager.today();
    const [top, mine, players] = await Promise.all([
        DailyResult.find({ date }).sort({ score: -1, createdAt: 1 }).limit(20).lean(),
        DailyResult.findOne({ date, user: req.user.id }).lean(),
        DailyResult.countDocuments({ date })
    ]);
    const myRank = mine ? (await DailyResult.countDocuments({ date, score: { $gt: mine.score } })) + 1 : null;
    res.json({
        date,
        players,
        top: top.map((r, i) => ({ rank: i + 1, userId: r.user, username: r.username, score: r.score })),
        mine: mine ? { score: mine.score, rank: myRank, rounds: mine.rounds } : null
    });
});

// @route GET /api/battles/:id — a finished battle you played in, with both solutions
router.get('/:id', auth, async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ msg: 'Battle not found' });
    const b = await Battle.findById(req.params.id).lean();
    if (!b || !b.players.some(p => String(p.user) === req.user.id)) return res.status(404).json({ msg: 'Battle not found' });
    res.json(b);
});

module.exports = router;
