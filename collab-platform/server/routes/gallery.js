// routes/gallery.js — the public gallery of published apps: browse, like, and fork into your own room.
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Deployment = require('../models/Deployment');
const Project = require('../models/Project');
const Room = require('../models/Room');
const File = require('../models/File');
const User = require('../models/User');
const { appUrl } = require('../services/deployService');
const { isValidId, isRoomMember, idEquals } = require('../utils/access');
const { friendIdsOf } = require('../utils/friends');

const PAGE_SIZE = 24;
const MAX_FORK_BYTES = 40 * 1024 * 1024;
const MAX_FORK_FILES = 5000;
const SLUG_RE = /^[a-z0-9-]{1,63}$/;

// Browsing is public; when a valid token is sent we also report which apps you've liked
const optionalUser = (req) => {
    const token = req.header('x-auth-token');
    if (!token) return null;
    try { return jwt.verify(token, process.env.JWT_SECRET).user.id; } catch { return null; }
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
    popular: { views: -1, updatedAt: -1 },
    new: { 'gallery.listedAt': -1 },
    liked: { likeCount: -1, views: -1 }
};

// @route GET /api/gallery?sort=popular|new|liked&q=&page=
router.get('/', async (req, res) => {
    try {
        const userId = optionalUser(req);
        const sort = SORTS[req.query.sort] ? req.query.sort : 'popular';
        const page = Math.max(0, Math.min(100, parseInt(req.query.page, 10) || 0));
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';

        // scope=friends: apps your friends listed publicly or shared with friends
        const scope = req.query.scope === 'friends' && userId ? 'friends' : 'all';
        const friendIds = scope === 'friends' ? (await friendIdsOf(userId)).map(id => new mongoose.Types.ObjectId(id)) : [];
        const match = scope === 'friends'
            ? {
                status: 'live',
                $or: [
                    { 'gallery.listed': true, visibility: { $in: [null, 'public'] }, 'gallery.listedBy': { $in: friendIds } },
                    { visibility: 'friends', visibilityOwner: { $in: friendIds } }
                ]
            }
            : { 'gallery.listed': true, status: 'live', visibility: { $in: [null, 'public'] } };
        if (q) {
            const projects = await Project.find({ name: { $regex: escapeRegex(q), $options: 'i' } }).select('_id').limit(500).lean();
            match.$and = [{ $or: [
                { project: { $in: projects.map(p => p._id) } },
                { 'gallery.description': { $regex: escapeRegex(q), $options: 'i' } }
            ] }];
        }

        const docs = await Deployment.aggregate([
            { $match: match },
            { $addFields: { likeCount: { $size: { $ifNull: ['$likes', []] } } } },
            { $sort: SORTS[sort] },
            { $skip: page * PAGE_SIZE },
            { $limit: PAGE_SIZE + 1 },
            { $project: { versions: 0 } }
        ]);
        const hasMore = docs.length > PAGE_SIZE;
        const items = docs.slice(0, PAGE_SIZE);

        const [projects, authors] = await Promise.all([
            Project.find({ _id: { $in: items.map(d => d.project) } }).select('name projectType').lean(),
            User.find({ _id: { $in: items.map(d => d.gallery?.listedBy || d.visibilityOwner).filter(Boolean) } }).select('username profilePicture').lean()
        ]);
        const projectById = new Map(projects.map(p => [String(p._id), p]));
        const authorById = new Map(authors.map(u => [String(u._id), u]));

        res.json({
            items: items.map(d => {
                const project = projectById.get(String(d.project));
                const author = authorById.get(String(d.gallery?.listedBy || d.visibilityOwner));
                return {
                    slug: d.slug,
                    url: appUrl(d.slug),
                    name: project?.name || d.slug,
                    projectType: project?.projectType || '',
                    description: d.gallery?.description || '',
                    author: author ? { _id: author._id, username: author.username, profilePicture: author.profilePicture || '' } : null,
                    views: d.views || 0,
                    likes: d.likeCount,
                    liked: !!userId && (d.likes || []).some(id => idEquals(id, userId)),
                    forks: d.forks || 0,
                    forkable: !!d.gallery?.forkable && (d.visibility || 'public') === 'public',
                    visibility: d.visibility || 'public',
                    listedAt: d.gallery?.listedAt,
                    updatedAt: d.updatedAt
                };
            }),
            hasMore
        });
    } catch (err) {
        console.error('[gallery] list failed:', err.message);
        res.status(500).json({ msg: 'Could not load the gallery' });
    }
});

const loadListed = async (slug) => {
    if (!SLUG_RE.test(String(slug))) return null;
    return Deployment.findOne({ slug, 'gallery.listed': true, status: 'live', visibility: { $in: [null, 'public'] } });
};

// @route POST /api/gallery/:slug/like — toggles your like
router.post('/:slug/like', auth, async (req, res) => {
    try {
        const dep = await loadListed(req.params.slug);
        if (!dep) return res.status(404).json({ msg: 'App not found' });
        const liked = dep.likes.some(id => idEquals(id, req.user.id));
        const updated = await Deployment.findByIdAndUpdate(
            dep._id,
            liked ? { $pull: { likes: req.user.id } } : { $addToSet: { likes: req.user.id } },
            { new: true }
        ).select('likes');
        res.json({ liked: !liked, likes: updated.likes.length });
    } catch (err) {
        console.error('[gallery] like failed:', err.message);
        res.status(500).json({ msg: 'Could not update your like' });
    }
});

// @route POST /api/gallery/:slug/fork — copies the app's source into a new project in one of your rooms
router.post('/:slug/fork', auth, async (req, res) => {
    try {
        const dep = await loadListed(req.params.slug);
        if (!dep) return res.status(404).json({ msg: 'App not found' });
        if (!dep.gallery.forkable) return res.status(403).json({ msg: "The author hasn't allowed forking this app" });

        const roomId = String(req.body.roomId || '');
        if (!isValidId(roomId)) return res.status(400).json({ msg: 'Pick a room to fork into' });
        const room = await Room.findById(roomId);
        if (!room || !isRoomMember(room, req.user.id)) return res.status(403).json({ msg: "You're not a member of that room" });

        const source = await Project.findById(dep.project);
        if (!source) return res.status(404).json({ msg: 'The original project no longer exists' });

        const files = await File.find({ project: source._id }).select('name path content isFolder').lean();
        const bytes = files.reduce((n, f) => n + (f.content || '').length, 0);
        if (files.length > MAX_FORK_FILES || bytes > MAX_FORK_BYTES) {
            return res.status(413).json({ msg: 'This project is too large to fork' });
        }

        const author = dep.gallery.listedBy ? await User.findById(dep.gallery.listedBy).select('username') : null;
        const project = await new Project({
            name: `${source.name} (fork)`.slice(0, 80),
            description: `Forked from "${source.name}"${author ? ` by ${author.username}` : ''}. ${source.description || ''}`.trim().slice(0, 500),
            projectType: source.projectType,
            room: room._id,
            members: [...new Set([req.user.id, room.owner.toString()])],
            forkedFrom: { project: source._id, slug: dep.slug }
            // Environment variables (secrets) are deliberately not copied
        }).save();

        try {
            if (files.length) {
                await File.insertMany(files.map(f => ({
                    name: f.name, path: f.path, content: f.content || '', isFolder: !!f.isFolder, project: project._id
                })), { ordered: false });
            }
        } catch (err) {
            await File.deleteMany({ project: project._id });
            await project.deleteOne();
            throw err;
        }

        await Deployment.updateOne({ _id: dep._id }, { $inc: { forks: 1 } });
        req.app.get('socketio')?.to(room._id.toString()).emit('room-update');
        res.status(201).json({ project: { _id: project._id, name: project.name, room: project.room } });
    } catch (err) {
        console.error('[gallery] fork failed:', err.message);
        res.status(500).json({ msg: 'Could not fork this app' });
    }
});

module.exports = router;
