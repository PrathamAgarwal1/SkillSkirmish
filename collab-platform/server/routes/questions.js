// routes/questions.js — players can flag a question as wrong or unclear (3 reports → it's pulled for review).
const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const bank = require('../questions/bank');

const router = express.Router();

router.post('/:id/report', auth, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'Invalid question' });
    try {
        const q = await bank.report(req.params.id, req.user.id, req.body?.reason);
        if (!q) return res.status(404).json({ msg: 'Question not found' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[questions] report failed:', err.message);
        res.status(500).json({ msg: 'Could not report the question' });
    }
});

module.exports = router;
