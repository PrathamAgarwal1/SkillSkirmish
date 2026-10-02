const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { runSkillDecay } = require('../workers/skillDecay');
const { getUsageStats, resetUsageStats } = require('../services/aiService');

// Admin routes are disabled unless ADMIN_KEY is set, and then require it in the x-admin-key header.
const requireAdminKey = (req, res, next) => {
    const expected = process.env.ADMIN_KEY;
    const provided = req.header('x-admin-key') || '';
    if (!expected) return res.status(404).json({ msg: 'Not found' });

    const a = Buffer.from(String(provided));
    const b = Buffer.from(String(expected));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ msg: 'Forbidden' });
    }
    next();
};

router.use(requireAdminKey);

// Manually trigger the decay process (runs in the background).
router.post('/run-skill-decay', (req, res) => {
    runSkillDecay().catch(err => console.error('[SkillDecay] Manual run failed:', err.message));
    res.status(202).send('Skill decay process initiated.');
});

// Platform-wide AI token usage — admin only, since it is shared across all users
router.get('/ai-usage', (req, res) => {
    res.json(getUsageStats());
});

router.post('/ai-usage/reset', (req, res) => {
    resetUsageStats();
    res.json({ msg: 'Usage stats reset successfully' });
});

// ── Question bank ──
const Question = require('../models/Question');
const bank = require('../questions/bank');

// Pool sizes per skill/type/status
router.get('/questions/stats', async (req, res) => {
    const rows = await Question.aggregate([
        { $group: { _id: { skill: { $arrayElemAt: ['$skills', 0] }, type: '$type', status: '$status' }, count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
        { $sort: { '_id.skill': 1, '_id.type': 1 } }
    ]);
    res.json({ pools: rows, pendingTopUps: [...bank.deficits.values()] });
});

// Questions waiting for a human look (reported or suspicious stats)
router.get('/questions/review', async (req, res) => {
    const status = ['review', 'pending', 'retired', 'active'].includes(req.query.status) ? req.query.status : 'review';
    res.json(await Question.find({ status }).sort({ updatedAt: -1 }).limit(100).lean());
});

// Fix / restore / retire a question
router.patch('/questions/:id', async (req, res) => {
    const allowed = ['status', 'text', 'code', 'options', 'answer', 'explanation', 'rating'];
    const update = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
    if (update.status && !['pending', 'active', 'review', 'retired'].includes(update.status)) return res.status(400).json({ msg: 'Bad status' });
    if (update.status === 'active') { update.reports = []; update.statusReason = ''; }
    const q = await Question.findByIdAndUpdate(req.params.id, update, { new: true }).catch(() => null);
    if (!q) return res.status(404).json({ msg: 'Question not found' });
    res.json(q);
});

// Run the AI top-up now instead of waiting for the timer
router.post('/questions/top-up', async (req, res) => {
    const { skill, type, rating } = req.body || {};
    if (skill) bank.noteDeficit(skill, type || 'mcq', Number(rating) || 1300);
    res.json({ added: await bank.processDeficits(5) });
});

module.exports = router;
