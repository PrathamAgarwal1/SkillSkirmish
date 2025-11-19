const express = require('express');
const router = express.Router();
const { runSkillDecay } = require('../workers/skillDecay');

// A simple endpoint to manually trigger the decay process.
// In production, this would be a secured admin-only route.
router.post('/run-skill-decay', async (req, res) => {
    // We run this in the background and respond immediately
    runSkillDecay(); 
    res.status(202).send('Skill decay process initiated.');
});

module.exports = router;