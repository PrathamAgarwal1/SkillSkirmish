// routes/dashboard.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Room = require('../models/Room');
const AssessmentSession = require('../models/AssessmentSession');
const Notification = require('../models/Notification');
const { getUsageStats } = require('../services/aiService');

/* ---------------------------------------------------------
   SERVER-SIDE CACHE for platform metrics (60s TTL)
--------------------------------------------------------- */
let platformCache = { data: null, expiry: 0 };
const PLATFORM_CACHE_TTL = 60 * 1000; // 60 seconds

/* ---------------------------------------------------------
   GET /api/dashboard/stats
   User-specific stats in a single batched call
--------------------------------------------------------- */
router.get('/stats', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Run all queries in parallel
        const [user, roomsOwned, roomsMember, assessments] = await Promise.all([
            User.findById(userId).select('skills username profilePicture createdAt'),
            Room.countDocuments({ owner: userId }),
            Room.countDocuments({ members: userId }),
            AssessmentSession.find({ user: userId, completed: true })
                .select('finalResult skill createdAt')
                .sort({ createdAt: -1 })
                .limit(50)
                .lean()
        ]);

        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Compute assessment stats
        const totalAssessments = assessments.length;
        const avgAccuracy = totalAssessments > 0
            ? Math.round(assessments.reduce((sum, a) => sum + (a.finalResult?.accuracy || 0), 0) / totalAssessments)
            : 0;
        const totalCorrect = assessments.reduce((sum, a) => sum + (a.finalResult?.correct || 0), 0);
        const totalAttempted = assessments.reduce((sum, a) => sum + (a.finalResult?.attempted || 0), 0);

        // Top skill by ELO
        const topSkill = user.skills?.length > 0
            ? user.skills.reduce((best, s) => (s.elo || 0) > (best.elo || 0) ? s : best, user.skills[0])
            : null;

        // Streak: consecutive days with assessments (simplified)
        const uniqueDays = new Set(assessments.map(a =>
            new Date(a.createdAt).toISOString().split('T')[0]
        ));

        res.json({
            username: user.username,
            profilePicture: user.profilePicture,
            memberSince: user.createdAt,
            roomsOwned,
            roomsMember,
            totalRooms: roomsOwned + roomsMember,
            skillCount: user.skills?.length || 0,
            topSkill: topSkill ? { name: topSkill.name, elo: topSkill.elo, mastery: topSkill.mastery } : null,
            assessment: {
                total: totalAssessments,
                avgAccuracy,
                totalCorrect,
                totalAttempted,
                activeDays: uniqueDays.size
            }
        });
    } catch (err) {
        console.error('Dashboard stats error:', err.message);
        res.status(500).json({ msg: 'Failed to load dashboard stats' });
    }
});

/* ---------------------------------------------------------
   GET /api/dashboard/activity
   Recent activity feed for the user
--------------------------------------------------------- */
router.get('/activity', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);

        // Fetch recent data in parallel
        const [recentAssessments, recentNotifications, recentRooms] = await Promise.all([
            AssessmentSession.find({ user: userId, completed: true })
                .select('skill finalResult createdAt assessmentMode')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            Notification.find({ user: userId })
                .select('message type createdAt relatedId')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            Room.find({ members: userId })
                .select('name createdAt owner')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean()
        ]);

        // Merge into unified activity feed
        const activities = [];

        recentAssessments.forEach(a => {
            activities.push({
                type: 'assessment',
                icon: '⚔️',
                title: `Completed ${a.skill} assessment`,
                detail: a.finalResult
                    ? `Score: ${a.finalResult.correct}/${a.finalResult.attempted} (${a.finalResult.accuracy}%)`
                    : 'In progress',
                ratingChange: a.finalResult?.ratingChange || null,
                timestamp: a.createdAt
            });
        });

        recentNotifications.forEach(n => {
            activities.push({
                type: 'notification',
                icon: n.type === 'invite' ? '📨' : n.type === 'join_request' ? '🔑' : '🔔',
                title: n.message,
                detail: null,
                timestamp: n.createdAt
            });
        });

        recentRooms.forEach(r => {
            activities.push({
                type: 'room_join',
                icon: '📁',
                title: `Joined room "${r.name}"`,
                detail: r.owner?.toString() === userId ? 'Owner' : 'Member',
                timestamp: r.createdAt
            });
        });

        // Sort by timestamp descending and limit
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(activities.slice(0, limit));
    } catch (err) {
        console.error('Dashboard activity error:', err.message);
        res.status(500).json({ msg: 'Failed to load activity feed' });
    }
});

/* ---------------------------------------------------------
   GET /api/dashboard/analytics
   Skill analytics data for charts
--------------------------------------------------------- */
router.get('/analytics', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select('skills').lean();

        if (!user) return res.status(404).json({ msg: 'User not found' });

        const skills = (user.skills || []).map(s => ({
            name: s.name,
            elo: s.elo || 0,
            mastery: s.mastery || 0,
            matchesPlayed: s.matchesPlayed || 0,
            isProvisional: s.isProvisional,
            // Last 30 ELO history entries for sparkline
            history: (s.history || []).slice(-30).map(h => ({
                date: h.date,
                elo: h.newElo,
                change: h.eloChange
            }))
        }));

        // Sort by ELO descending
        skills.sort((a, b) => b.elo - a.elo);

        res.json({
            skills,
            summary: {
                totalSkills: skills.length,
                avgElo: skills.length > 0
                    ? Math.round(skills.reduce((s, sk) => s + sk.elo, 0) / skills.length)
                    : 0,
                avgMastery: skills.length > 0
                    ? Math.round(skills.reduce((s, sk) => s + sk.mastery, 0) / skills.length)
                    : 0,
                totalMatches: skills.reduce((s, sk) => s + sk.matchesPlayed, 0)
            }
        });
    } catch (err) {
        console.error('Dashboard analytics error:', err.message);
        res.status(500).json({ msg: 'Failed to load analytics' });
    }
});

/* ---------------------------------------------------------
   GET /api/dashboard/platform
   Platform-wide metrics (cached 60s)
--------------------------------------------------------- */
router.get('/platform', auth, async (req, res) => {
    try {
        // Serve from cache if fresh
        if (platformCache.data && Date.now() < platformCache.expiry) {
            return res.json(platformCache.data);
        }

        const [totalUsers, totalRooms, discoverableRooms, topSkillsAgg] = await Promise.all([
            User.countDocuments(),
            Room.countDocuments(),
            Room.countDocuments({ isDiscoverable: true }),
            User.aggregate([
                { $unwind: '$skills' },
                { $group: { _id: '$skills.name', count: { $sum: 1 }, avgElo: { $avg: '$skills.elo' } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        const data = {
            totalUsers,
            totalRooms,
            discoverableRooms,
            topSkills: topSkillsAgg.map(s => ({
                name: s._id,
                userCount: s.count,
                avgElo: Math.round(s.avgElo || 0)
            }))
        };

        // Cache it
        platformCache = { data, expiry: Date.now() + PLATFORM_CACHE_TTL };

        res.json(data);
    } catch (err) {
        console.error('Dashboard platform error:', err.message);
        res.status(500).json({ msg: 'Failed to load platform metrics' });
    }
});

/* ---------------------------------------------------------
   GET /api/dashboard/ai-usage
   Proxy to AI service usage stats
--------------------------------------------------------- */
router.get('/ai-usage', auth, (req, res) => {
    try {
        res.json(getUsageStats());
    } catch (err) {
        console.error('Dashboard AI usage error:', err.message);
        res.status(500).json({ msg: 'Failed to load AI usage' });
    }
});

module.exports = router;
