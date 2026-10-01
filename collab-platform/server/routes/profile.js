const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Room = require('../models/Room');
const Notification = require('../models/Notification');
const { isValidId } = require('../utils/access');

// Never expose credentials or internal identity-provider data
const PRIVATE_FIELDS = '-password -auth0Sub -assessmentHistory';
// What other users may see (no email)
const PUBLIC_FIELDS = `${PRIVATE_FIELDS} -email -assessmentCooldownExpires`;

const toPublicProfile = (userDoc) => {
    const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
    if (user.socialsPublic === false) {
        user.socialLinks = {};
    }
    return user;
};

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

// Only http(s) links are stored — blocks javascript:/data: URLs rendered as <a href>.
const cleanUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    const trimmed = value.trim().slice(0, 300);
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
        return '';
    }
};

// @route   GET api/profile/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(PRIVATE_FIELDS);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/profile/user/:user_id
// @desc    Get profile by user ID (email only included for your own profile)
// @access  Private
router.get('/user/:user_id', auth, async (req, res) => {
    try {
        if (!isValidId(req.params.user_id)) return res.status(404).json({ msg: 'Profile not found' });

        const isSelf = req.params.user_id === req.user.id;
        const user = await User.findById(req.params.user_id).select(isSelf ? PRIVATE_FIELDS : PUBLIC_FIELDS);
        if (!user) return res.status(404).json({ msg: 'Profile not found' });
        res.json(isSelf ? user : toPublicProfile(user));
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/profile/user/:user_id/summary
// @desc    What a profile shows besides the basics: battle record, published apps, friend count
// @access  Private
const BATTLE_KINDS = ['guessr', 'quiz', 'task', 'debug', 'css', 'algo'];
const modeStats = (battle = {}, kind) => {
    const m = battle.modes?.[kind] || {};
    const src = kind === 'algo' && !m.played && battle.played ? battle : m; // algo used to be the only mode
    return { rating: src.rating ?? 1200, played: src.played || 0, wins: src.wins || 0, losses: src.losses || 0, draws: src.draws || 0, bestStreak: src.bestStreak || 0 };
};
router.get('/user/:user_id/summary', auth, async (req, res) => {
    try {
        if (!isValidId(req.params.user_id)) return res.status(404).json({ msg: 'Profile not found' });
        const id = req.params.user_id;
        const Battle = require('../models/Battle');
        const Friendship = require('../models/Friendship');
        const Deployment = require('../models/Deployment');
        const Project = require('../models/Project');
        const { appUrl } = require('../services/deployService');

        const [user, recent, friends, apps] = await Promise.all([
            User.findById(id).select('battle createdAt').lean(),
            Battle.find({ 'players.user': id, mode: { $in: ['ranked', 'friend'] } }).sort({ endedAt: -1 }).limit(8).select('-players.code').lean(),
            Friendship.countDocuments({ users: id, status: 'accepted' }),
            Deployment.find({ 'gallery.listed': true, 'gallery.listedBy': id, status: 'live', visibility: { $in: [null, 'public'] } })
                .sort({ 'gallery.listedAt': -1 }).limit(6).select('slug project gallery views likes forks').lean()
        ]);
        if (!user) return res.status(404).json({ msg: 'Profile not found' });
        const projects = await Project.find({ _id: { $in: apps.map(a => a.project) } }).select('name projectType').lean();
        const projectById = new Map(projects.map(p => [String(p._id), p]));
        const battle = user.battle || {};

        res.json({
            memberSince: user.createdAt,
            friends,
            battles: {
                modes: Object.fromEntries(BATTLE_KINDS.map(k => [k, modeStats(battle, k)])),
                solved: (battle.solved || []).length,
                dailyStreak: battle.dailyStreak || 0,
                recent: recent.map(b => {
                    const me = b.players.find(p => String(p.user) === id);
                    const opponent = b.players.find(p => String(p.user) !== id);
                    return {
                        id: b._id,
                        kind: b.kind || 'algo',
                        problem: b.problem,
                        skill: b.skill,
                        result: b.result === 'win' ? (String(b.winner) === id ? 'won' : 'lost') : b.result,
                        opponent: opponent ? { userId: opponent.user, username: opponent.username } : null,
                        ratingChange: me && me.ratingAfter != null && me.ratingBefore != null ? me.ratingAfter - me.ratingBefore : null,
                        endedAt: b.endedAt
                    };
                })
            },
            apps: apps.map(a => {
                const project = projectById.get(String(a.project));
                return { slug: a.slug, url: appUrl(a.slug), name: project?.name || a.slug, projectType: project?.projectType || '', description: a.gallery?.description || '', views: a.views || 0, likes: (a.likes || []).length, forks: a.forks || 0 };
            })
        });
    } catch (err) {
        console.error('[profile] summary failed:', err.message);
        res.status(500).json({ msg: 'Could not load the profile' });
    }
});

// @route   GET api/profile
// @desc    Get all profiles (developer directory)
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const users = await User.find().select(`${PUBLIC_FIELDS} -skills.history`).limit(500);
        const profiles = users.map(u => {
            const user = toPublicProfile(u);
            return {
                user, // Nested under 'user' to match frontend expectations
                skills: user.skills,
                _id: user._id
            };
        });
        res.json(profiles);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/profile
// @desc    Update user profile
// @access  Private
router.put('/', auth, async (req, res) => {
    const {
        skills, socialLinks, socialsPublic,
        bio, location, company, website, username
    } = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Skills: the client may only choose WHICH skills it tracks. Ratings, mastery and history
        // are earned through assessments and are never taken from the request body.
        if (Array.isArray(skills)) {
            const requestedNames = [...new Set(
                skills
                    .map(s => (typeof s === 'string' ? s : s?.name))
                    .filter(n => typeof n === 'string' && n.trim())
                    .map(n => n.trim().slice(0, 50))
            )].slice(0, 50);

            const existingByName = new Map(user.skills.map(s => [s.name, s]));
            user.skills = requestedNames.map(name => existingByName.get(name) || {
                name, mastery: 0, elo: null, matchesPlayed: 0, isProvisional: true, history: [],
                lastPracticedAt: new Date()
            });
        }

        if (socialLinks && typeof socialLinks === 'object') {
            const current = user.socialLinks?.toObject ? user.socialLinks.toObject() : (user.socialLinks || {});
            for (const key of ['github', 'linkedin', 'portfolio', 'twitter', 'leetcode']) {
                if (socialLinks[key] !== undefined) current[key] = cleanUrl(socialLinks[key]);
            }
            user.socialLinks = current;
        }
        if (typeof socialsPublic === 'boolean') user.socialsPublic = socialsPublic;
        // typeof checks (not truthiness) so fields can be cleared with ''
        if (typeof bio === 'string') user.bio = bio.slice(0, 1000);
        if (typeof location === 'string') user.location = location.slice(0, 100);
        if (typeof company === 'string') user.company = company.slice(0, 100);
        if (typeof website === 'string') user.website = cleanUrl(website);

        let isNameChanged = false;
        const oldUsername = user.username;

        if (typeof username === 'string' && username.trim() && username.trim() !== user.username) {
            const newName = username.trim();
            if (!USERNAME_RE.test(newName)) {
                return res.status(400).json({ msg: 'Username must be 3-30 characters: letters, numbers, _ . -' });
            }
            const existingUser = await User.findOne({ username: newName, _id: { $ne: req.user.id } });
            if (existingUser) {
                return res.status(400).json({ msg: 'Username is already taken' });
            }
            user.username = newName;
            isNameChanged = true;
        }

        await user.save();

        if (isNameChanged) {
            // Notify everyone who shares a room with this user (as member or owner)
            const rooms = await Room.find({ $or: [{ members: req.user.id }, { owner: req.user.id }] }).select('owner members');
            const membersToNotify = new Set();
            rooms.forEach(room => {
                [room.owner, ...room.members].forEach(memberId => {
                    if (memberId && memberId.toString() !== req.user.id) {
                        membersToNotify.add(memberId.toString());
                    }
                });
            });

            const message = `${oldUsername} changed name to ${user.username}`;
            const notificationsToInsert = Array.from(membersToNotify).map(memberId => ({
                user: memberId,
                sender: req.user.id,
                message,
                type: 'info'
            }));

            if (notificationsToInsert.length > 0) {
                await Notification.insertMany(notificationsToInsert);

                const io = req.app.get('socketio');
                const userSocketMap = req.app.get('userSocketMap');
                if (io && userSocketMap) {
                    membersToNotify.forEach(memberId => {
                        const socketId = userSocketMap[memberId];
                        if (socketId) {
                            io.to(socketId).emit('new-notification', { message });
                        }
                    });
                }
            }
        }

        const updated = await User.findById(req.user.id).select(PRIVATE_FIELDS);
        return res.json(updated);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
