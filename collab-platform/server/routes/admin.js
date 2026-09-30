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

module.exports = router;
