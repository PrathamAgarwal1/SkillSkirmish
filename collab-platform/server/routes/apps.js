// routes/apps.js — access passes for private and friends-only apps (see sandbox/appAccess.js).
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Deployment = require('../models/Deployment');
const User = require('../models/User');
const { canView, issuePass, PARAM } = require('../sandbox/appAccess');
const { appUrl } = require('../services/deployService');

// @route POST /api/apps/:slug/access — a link that opens the app as you (if you're allowed to)
router.post('/:slug/access', auth, async (req, res) => {
    try {
        const slug = String(req.params.slug || '');
        if (!/^[a-z0-9-]{1,63}$/.test(slug)) return res.status(404).json({ msg: 'App not found' });
        const dep = await Deployment.findOne({ slug }).select('slug project visibility visibilityOwner status').lean();
        if (!dep) return res.status(404).json({ msg: 'App not found' });
        const url = appUrl(slug);
        const visibility = dep.visibility || 'public';
        if (visibility === 'public') return res.json({ url, visibility });
        if (!(await canView(dep, req.user.id))) {
            const owner = dep.visibilityOwner ? await User.findById(dep.visibilityOwner).select('username').lean() : null;
            return res.status(403).json({
                msg: visibility === 'friends' ? `Only ${owner?.username || 'the owner'}'s friends can open this app.` : 'This app is private to its project team.',
                visibility,
                owner: owner ? { _id: owner._id, username: owner.username } : null
            });
        }
        res.json({ url: `${url}${url.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(issuePass(slug, req.user.id))}`, visibility, live: dep.status === 'live' });
    } catch (err) {
        console.error('[apps] access failed:', err.message);
        res.status(500).json({ msg: 'Could not open the app' });
    }
});

module.exports = router;
