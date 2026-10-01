// routes/battles.js — battle problems, leaderboard, your record and past battles.
// (Matches themselves run over Socket.IO: battles/battleManager.js)
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Battle = require('../models/Battle');
const { PROBLEMS, DURATION_MIN } = require('../battles/problems');
const { publicProblem } = require('../battles/judge');
const manager = require('../battles/battleManager');
const { isValidId } = require('../utils/access');

// @route GET /api/battles/problems — the problem list (for practice), with what you've solved
router.get('/problems', auth, async (req, res) => {
    const me = await User.findById(req.user.id).select('battle.solved').lean();
    const solved = new Set(me?.battle?.solved || []);
    res.json({
        problems: PROBLEMS.map(p => ({ id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags, solved: solved.has(p.id) })),
        durations: DURATION_MIN
    });
});

// @route GET /api/battles/problems/:id — one problem's statement (practice preview)
router.get('/problems/:id', auth, (req, res) => {
    const p = PROBLEMS.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ msg: 'Problem not found' });
    res.json(publicProblem(p));
});

// @route GET /api/battles/leaderboard
router.get('/leaderboard', auth, async (req, res) => {
    const top = await User.find({ 'battle.played': { $gt: 0 } })
        .select('username profilePicture battle.rating battle.played battle.wins battle.losses battle.draws battle.bestStreak')
        .sort({ 'battle.rating': -1, 'battle.wins': -1 })
        .limit(50)
        .lean();
    res.json({
        players: top.map((u, i) => ({ rank: i + 1, userId: u._id, username: u.username, profilePicture: u.profilePicture || '', ...u.battle })),
        ...manager.stats()
    });
});

// @route GET /api/battles/me — rating, record, recent battles, and a battle you're still in
router.get('/me', auth, async (req, res) => {
    const [me, recent] = await Promise.all([
        User.findById(req.user.id).select('username battle').lean(),
        Battle.find({ 'players.user': req.user.id }).sort({ endedAt: -1 }).limit(15).select('-players.code').lean()
    ]);
    const battle = { rating: 1200, played: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, solved: [], ...(me?.battle || {}) };
    const rank = battle.played ? (await User.countDocuments({ 'battle.played': { $gt: 0 }, 'battle.rating': { $gt: battle.rating } })) + 1 : null;
    res.json({
        username: me?.username,
        battle: { ...battle, solvedCount: battle.solved.length, solved: undefined },
        rank,
        active: manager.activeMatchFor(req.user.id),
        recent: recent.map(b => ({
            id: b._id,
            problem: b.problem,
            difficulty: b.difficulty,
            mode: b.mode,
            result: b.result,
            reason: b.reason,
            won: b.winner ? String(b.winner) === req.user.id : null,
            endedAt: b.endedAt,
            players: b.players.map(p => ({ userId: p.user, username: p.username, passed: p.passed, total: p.total, ratingBefore: p.ratingBefore, ratingAfter: p.ratingAfter, language: p.language }))
        })),
        ...manager.stats()
    });
});

// @route GET /api/battles/:id — a finished battle you played in, with both solutions
router.get('/:id', auth, async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ msg: 'Battle not found' });
    const b = await Battle.findById(req.params.id).lean();
    if (!b || !b.players.some(p => String(p.user) === req.user.id)) return res.status(404).json({ msg: 'Battle not found' });
    const p = PROBLEMS.find(x => x.id === b.problem);
    res.json({ ...b, problem: p ? publicProblem(p) : { id: b.problem, title: b.problem } });
});

module.exports = router;
