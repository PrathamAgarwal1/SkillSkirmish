// routes/friends.js — friend requests and friends lists.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Notification = require('../models/Notification');
const { pairKey } = require('../utils/friends');
const { isValidId } = require('../utils/access');

const PUBLIC_FIELDS = 'username profilePicture bio battle.rating';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const online = (req, userId) => !!req.app.get('userSocketMap')?.[String(userId)];

/** Live updates: refreshes the friends list of both people, plus an optional notification. */
async function notify(req, userId, { message, link, type = 'friend' } = {}) {
    const io = req.app.get('socketio');
    const socketId = req.app.get('userSocketMap')?.[String(userId)];
    if (message) {
        const n = await new Notification({ user: userId, sender: req.user.id, message, type, link }).save();
        if (socketId) io.to(socketId).emit('new-notification', n);
    }
    if (socketId) io.to(socketId).emit('friends:update');
}
const refreshMe = (req) => {
    const socketId = req.app.get('userSocketMap')?.[String(req.user.id)];
    if (socketId) req.app.get('socketio').to(socketId).emit('friends:update');
};

const shape = (req, u) => ({
    _id: u._id,
    username: u.username,
    profilePicture: u.profilePicture || '',
    bio: u.bio || '',
    rating: u.battle?.rating ?? 1200,
    online: online(req, u._id)
});

// @route GET /api/friends — friends, incoming and outgoing requests
router.get('/', auth, async (req, res) => {
    try {
        const rows = await Friendship.find({ users: req.user.id }).lean();
        const otherOf = (r) => String(r.users.find(u => String(u) !== req.user.id));
        const users = await User.find({ _id: { $in: rows.map(otherOf) } }).select(PUBLIC_FIELDS).lean();
        const byId = new Map(users.map(u => [String(u._id), u]));
        const out = { friends: [], incoming: [], outgoing: [] };
        for (const r of rows) {
            const u = byId.get(otherOf(r));
            if (!u) continue;
            const item = { ...shape(req, u), since: r.acceptedAt || r.updatedAt };
            if (r.status === 'accepted') out.friends.push(item);
            else if (String(r.requester) === req.user.id) out.outgoing.push(item);
            else out.incoming.push(item);
        }
        out.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
        res.json(out);
    } catch (err) {
        console.error('[friends] list failed:', err.message);
        res.status(500).json({ msg: 'Could not load your friends' });
    }
});

// @route GET /api/friends/search?q= — find people by username
router.get('/search', auth, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40) : '';
    if (q.length < 2) return res.json({ users: [] });
    const users = await User.find({ _id: { $ne: req.user.id }, username: { $regex: `^${escapeRegex(q)}`, $options: 'i' } })
        .select(PUBLIC_FIELDS).limit(10).lean();
    const rows = await Friendship.find({ key: { $in: users.map(u => pairKey(u._id, req.user.id)) } }).lean();
    const rel = new Map(rows.map(r => [r.key, r]));
    res.json({
        users: users.map(u => {
            const r = rel.get(pairKey(u._id, req.user.id));
            const status = !r ? 'none' : r.status === 'accepted' ? 'friends' : String(r.requester) === req.user.id ? 'outgoing' : 'incoming';
            return { ...shape(req, u), status };
        })
    });
});

// @route GET /api/friends/status/:userId — your relationship with someone (for their profile page)
router.get('/status/:userId', auth, async (req, res) => {
    if (!isValidId(req.params.userId)) return res.status(404).json({ msg: 'User not found' });
    if (req.params.userId === req.user.id) return res.json({ status: 'self' });
    const r = await Friendship.findOne({ key: pairKey(req.params.userId, req.user.id) }).lean();
    const status = !r ? 'none' : r.status === 'accepted' ? 'friends' : String(r.requester) === req.user.id ? 'outgoing' : 'incoming';
    res.json({ status });
});

// @route POST /api/friends/request { userId } — send a request (accepts theirs if they already asked)
router.post('/request', auth, async (req, res) => {
    try {
        const other = String(req.body.userId || '');
        if (!isValidId(other)) return res.status(400).json({ msg: 'Choose someone to add' });
        if (other === req.user.id) return res.status(400).json({ msg: "You can't add yourself" });
        const target = await User.findById(other).select('username');
        if (!target) return res.status(404).json({ msg: 'User not found' });
        const me = await User.findById(req.user.id).select('username');
        const key = pairKey(other, req.user.id);

        const existing = await Friendship.findOne({ key });
        if (existing?.status === 'accepted') return res.json({ status: 'friends' });
        if (existing && String(existing.requester) === req.user.id) return res.json({ status: 'outgoing' });
        if (existing) {
            // They already asked you: this accepts
            existing.status = 'accepted';
            existing.acceptedAt = new Date();
            await existing.save();
            await notify(req, other, { message: `${me.username} accepted your friend request`, link: `/profile/${req.user.id}` });
            refreshMe(req);
            return res.json({ status: 'friends' });
        }
        await Friendship.create({ key, users: [req.user.id, other], requester: req.user.id });
        await notify(req, other, { message: `${me.username} sent you a friend request`, link: '/friends' });
        refreshMe(req);
        res.status(201).json({ status: 'outgoing' });
    } catch (err) {
        if (err.code === 11000) return res.json({ status: 'outgoing' });
        console.error('[friends] request failed:', err.message);
        res.status(500).json({ msg: 'Could not send the request' });
    }
});

// @route POST /api/friends/:userId/accept
router.post('/:userId/accept', auth, async (req, res) => {
    if (!isValidId(req.params.userId)) return res.status(404).json({ msg: 'Request not found' });
    const r = await Friendship.findOne({ key: pairKey(req.params.userId, req.user.id), status: 'pending' });
    if (!r || String(r.requester) === req.user.id) return res.status(404).json({ msg: 'Request not found' });
    r.status = 'accepted';
    r.acceptedAt = new Date();
    await r.save();
    const me = await User.findById(req.user.id).select('username');
    await notify(req, req.params.userId, { message: `${me.username} accepted your friend request`, link: `/profile/${req.user.id}` });
    refreshMe(req);
    res.json({ status: 'friends' });
});

// @route POST /api/friends/:userId/decline — decline a request sent to you
router.post('/:userId/decline', auth, async (req, res) => {
    if (!isValidId(req.params.userId)) return res.status(404).json({ msg: 'Request not found' });
    await Friendship.deleteOne({ key: pairKey(req.params.userId, req.user.id), status: 'pending', requester: req.params.userId });
    await notify(req, req.params.userId);
    refreshMe(req);
    res.json({ status: 'none' });
});

// @route DELETE /api/friends/:userId — unfriend, or cancel a request you sent
router.delete('/:userId', auth, async (req, res) => {
    if (!isValidId(req.params.userId)) return res.status(404).json({ msg: 'Not found' });
    await Friendship.deleteOne({ key: pairKey(req.params.userId, req.user.id) });
    require('../sandbox/appAccess').forgetUsers([req.params.userId, req.user.id]);
    await notify(req, req.params.userId);
    refreshMe(req);
    res.json({ status: 'none' });
});

module.exports = router;
