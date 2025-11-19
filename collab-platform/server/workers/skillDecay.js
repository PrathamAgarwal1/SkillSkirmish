const User = require('../models/User');
const Notification = require('../models/Notification');

const DECAY_RATE_NORMAL = 2; // Points per week
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const runSkillDecay = async () => {
    console.log('Running weekly skill decay process...');
    const users = await User.find({});

    for (const user of users) {
        let wasModified = false;
        for (const skill of user.skills) {
            // Find the last time this skill was practiced
            const lastPracticed = user.assessmentHistory
                .filter(h => h.skill === skill.name)
                .sort((a, b) => b.answeredAt - a.answeredAt)[0];

            const lastPracticeTime = lastPracticed ? lastPracticed.answeredAt.getTime() : user.createdAt.getTime();
            const timeSincePractice = Date.now() - lastPracticeTime;

            // If the skill hasn't been practiced for over a week, apply decay
            if (timeSincePractice > ONE_WEEK_IN_MS) {
                const oldMastery = skill.mastery;
                const newMastery = Math.max(0, oldMastery - DECAY_RATE_NORMAL);

                if (newMastery !== oldMastery) {
                    skill.mastery = newMastery;
                    wasModified = true;

                    // Create a notification for the user
                    const notification = new Notification({
                        user: user._id,
                        message: `Your mastery in ${skill.name} has decreased from ${oldMastery}% to ${newMastery}% due to inactivity.`
                    });
                    await notification.save();
                    console.log(`Decaying ${user.username}'s ${skill.name} to ${newMastery}`);
                }
            }
        }
        if (wasModified) {
            await user.save();
        }
    }
    console.log('Skill decay process complete.');
};

module.exports = { runSkillDecay };