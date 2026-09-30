const User = require('../models/User');
const Notification = require('../models/Notification');

const DECAY_RATE_NORMAL = 2; // Mastery points per week of inactivity
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When was this skill last practiced? Prefers the explicit timestamp, then the
 * newest rating-history entry, then the account creation date.
 */
const getLastPracticeTime = (skill, user) => {
    if (skill.lastPracticedAt) return new Date(skill.lastPracticedAt).getTime();
    const history = skill.history || [];
    if (history.length > 0) {
        return Math.max(...history.map(h => new Date(h.date).getTime() || 0));
    }
    return user.createdAt ? user.createdAt.getTime() : Date.now();
};

/**
 * Pure decay decision for one skill (exported for tests).
 * Returns the new mastery, or null when nothing should change.
 */
const computeDecay = (skill, lastPracticeTime, now = Date.now()) => {
    if (!skill.mastery || skill.mastery <= 0) return null;
    if (now - lastPracticeTime <= ONE_WEEK_IN_MS) return null;

    // The worker runs daily; only decay once per week per skill
    const lastDecay = skill.lastDecayAt ? new Date(skill.lastDecayAt).getTime() : 0;
    if (now - lastDecay < ONE_WEEK_IN_MS) return null;

    return Math.max(0, skill.mastery - DECAY_RATE_NORMAL);
};

const runSkillDecay = async () => {
    console.log('[SkillDecay] Running skill decay check...');
    const now = Date.now();
    let decayed = 0;

    // Stream users instead of loading the whole collection into memory
    const cursor = User.find({ 'skills.mastery': { $gt: 0 } }).cursor();

    for await (const user of cursor) {
        let wasModified = false;
        const notifications = [];

        for (const skill of user.skills) {
            const newMastery = computeDecay(skill, getLastPracticeTime(skill, user), now);
            if (newMastery === null) continue;

            notifications.push({
                user: user._id,
                message: `Your mastery in ${skill.name} has decreased from ${skill.mastery}% to ${newMastery}% due to inactivity. Take an assessment to keep it fresh!`
            });
            skill.mastery = newMastery;
            skill.lastDecayAt = new Date(now);
            wasModified = true;
            decayed++;
        }

        if (wasModified) {
            await user.save();
            await Notification.insertMany(notifications);
        }
    }
    console.log(`[SkillDecay] Complete — ${decayed} skill(s) decayed.`);
};

module.exports = { runSkillDecay, computeDecay, getLastPracticeTime, ONE_WEEK_IN_MS, DECAY_RATE_NORMAL };
