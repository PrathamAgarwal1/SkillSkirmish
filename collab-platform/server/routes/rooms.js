const express = require('express');
const router = express.Router();
const fs = require('fs');
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const File = require('../models/File');
const { ROOM_WEIGHTS, computeRoomScore } = require('../utils/matchmaking');
const { isValidId, idEquals, isRoomMember, getProjectDir } = require('../utils/access');
const { stopAllForProject } = require('../utils/projectRunner');
const { destroyDeployment } = require('../services/deployService');
const voice = require('../voice/voiceManager');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MESSAGE_HISTORY_LIMIT = 200;

// Rejects malformed :id params before they reach Mongoose (avoids CastError 500s).
router.param('id', (req, res, next, id) => {
    if (!isValidId(id)) return res.status(404).json({ msg: 'Room not found' });
    next();
});

const emitToUser = (req, userId, event, payload) => {
    const io = req.app.get('socketio');
    const userSocketMap = req.app.get('userSocketMap');
    const socketId = userSocketMap && userSocketMap[userId.toString()];
    if (io && socketId) io.to(socketId).emit(event, payload);
};

const isFull = (room) => (room.members || []).length + 1 >= (room.capacity || 10);

/**
 * Shared invite logic for both invite endpoints. Only the room owner may invite,
 * and duplicate pending invites are not re-sent.
 */
const sendRoomInvite = async (req, res, roomId, targetUserId, message) => {
    if (!isValidId(String(targetUserId || ''))) return res.status(400).json({ msg: 'Valid user ID required' });

    const [room, sender, target] = await Promise.all([
        Room.findById(roomId),
        User.findById(req.user.id).select('username'),
        User.findById(targetUserId).select('_id')
    ]);

    if (!room) return res.status(404).json({ msg: 'Room not found' });
    if (!sender) return res.status(404).json({ msg: 'Sender not found' });
    if (!target) return res.status(404).json({ msg: 'User not found' });
    if (!idEquals(room.owner, req.user.id)) {
        return res.status(403).json({ msg: 'Only room owner can send invites' });
    }
    if (isRoomMember(room, targetUserId)) return res.status(400).json({ msg: 'User is already a member' });

    const existing = await Notification.findOne({ user: targetUserId, type: 'invite', relatedId: room._id });
    if (existing) return res.json({ msg: 'Invitation already pending' });

    let notifMsg = `${sender.username} invited you to join room: ${room.name}`;
    if (message) notifMsg += `\nReason: ${String(message).slice(0, 500)}`;

    const newNotif = await new Notification({
        user: targetUserId,
        sender: req.user.id,
        type: 'invite',
        message: notifMsg,
        relatedId: room._id
    }).save();

    emitToUser(req, targetUserId, 'new-notification', newNotif);
    return res.json({ msg: 'Invitation sent' });
};

// @route   GET api/rooms/myrooms
router.get('/myrooms', auth, async (req, res) => {
    try {
        const rooms = await Room.find({
            $or: [
                { owner: req.user.id },
                { members: req.user.id }
            ]
        }).populate('owner', 'username').sort({ updatedAt: -1 });
        res.json(rooms);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/search
router.get('/search', auth, async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
        // Escape user input so it is matched literally (an unescaped regex allows ReDoS and odd matches)
        const query = q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {};
        query.isPrivate = false;
        const rooms = await Room.find(query)
            .select('name description owner members capacity tags isPrivate createdAt')
            .populate('owner', 'username')
            .limit(50);
        res.json(rooms);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/recommend
// Personalized room recommendations based on user skills, rating, and growth potential.
router.get('/recommend', auth, async (req, res) => {
    try {
        // 1. Fetch the authenticated user's skills
        const user = await User.findById(req.user.id).select('skills');
        const userSkills = user ? user.skills : [];

        // 2. Query only discoverable rooms the user hasn't joined, with capacity remaining
        const rooms = await Room.find({
            isDiscoverable: true,
            owner: { $ne: req.user.id },
            members: { $ne: req.user.id },
            'requiredSkills.0': { $exists: true } // must have at least one required skill
        })
            .select('name description requiredSkills minRating capacity members tags projectDescription owner')
            .populate('owner', 'username')
            .lean();

        // 3. Filter rooms that are already full
        const availableRooms = rooms.filter(r => !isFull(r));

        // 4. Score each room
        const scoredRooms = availableRooms.map(room => {
            const memberCount = (room.members || []).length;
            const { score, reasoning } = computeRoomScore({
                userSkills,
                roomRequiredSkills: room.requiredSkills || [],
                roomMinRating: room.minRating || 0,
                memberCount,
                capacity: room.capacity || 10
            });

            return {
                roomId: room._id.toString(),
                name: room.name,
                description: room.projectDescription || room.description || '',
                owner: room.owner ? { _id: room.owner._id, username: room.owner.username } : null,
                matchScore: score,
                reason: reasoning.length > 0 ? reasoning.join(' + ') : 'Discoverable Room',
                requiredSkills: (room.requiredSkills || []).map(s => ({ name: s.name, weight: s.weight })),
                memberCount,
                capacity: room.capacity || 10,
                tags: room.tags || []
            };
        });

        // 5. Sort by score descending
        scoredRooms.sort((a, b) => b.matchScore - a.matchScore);

        // 6. Apply minimum threshold but guarantee at least 3 results
        let filtered = scoredRooms.filter(r => r.matchScore >= ROOM_WEIGHTS.MIN_ROOM_SCORE);
        if (filtered.length < 3) {
            filtered = scoredRooms.slice(0, Math.max(3, filtered.length));
        }

        // 7. Return top 10
        res.json({ recommendations: filtered.slice(0, 10) });

    } catch (err) {
        console.error('Room Recommendation Error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// --- VIDEO CALL ROUTES (Multiple Concurrent Calls) - MUST BE BEFORE /:id ---

// ─── Voice channels (Discord-style; live presence is in voice/voiceManager.js) ───

const cleanChannelName = (name) => (typeof name === 'string' ? name.replace(/s+/g, ' ').trim().slice(0, 40) : '');
const cleanLimit = (v) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));

// @route   GET api/rooms/:id/voice
// @desc    Voice channels and who is in them
router.get('/:id/voice', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).select('owner members');
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!isRoomMember(room, req.user.id)) return res.status(403).json({ msg: 'Not a member of this room' });
        res.json(await voice.roomState(req.params.id));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   POST api/rooms/:id/voice-channels
// @desc    Create a voice channel (any member)
router.post('/:id/voice-channels', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!isRoomMember(room, req.user.id)) return res.status(403).json({ msg: 'Not a member of this room' });
        const name = cleanChannelName(req.body.name);
        if (!name) return res.status(400).json({ msg: 'Give the channel a name' });
        await voice.loadChannels(req.params.id); // creates the defaults first for older rooms
        const fresh = await Room.findById(req.params.id);
        if (fresh.voiceChannels.length >= voice.MAX_CHANNELS) return res.status(400).json({ msg: `A room can have up to ${voice.MAX_CHANNELS} voice channels` });
        fresh.voiceChannels.push({ _id: voice.newChannelId(), name, userLimit: cleanLimit(req.body.userLimit), createdBy: req.user.id });
        await fresh.save();
        voice.invalidateRoom(req.params.id);
        await voice.broadcastRoom(req.params.id);
        res.status(201).json(await voice.roomState(req.params.id));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

const canManageChannel = (room, channel, userId) => idEquals(room.owner, userId) || (channel.createdBy && idEquals(channel.createdBy, userId));

// @route   PATCH api/rooms/:id/voice-channels/:channelId
// @desc    Rename a channel / change its user limit (room owner or channel creator)
router.patch('/:id/voice-channels/:channelId', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        const channel = room?.voiceChannels.id(req.params.channelId);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });
        if (!canManageChannel(room, channel, req.user.id)) return res.status(403).json({ msg: 'Only the room owner or the channel creator can change it' });
        if (req.body.name !== undefined) {
            const name = cleanChannelName(req.body.name);
            if (!name) return res.status(400).json({ msg: 'Give the channel a name' });
            channel.name = name;
        }
        if (req.body.userLimit !== undefined) channel.userLimit = cleanLimit(req.body.userLimit);
        await room.save();
        voice.invalidateRoom(req.params.id);
        await voice.broadcastRoom(req.params.id);
        res.json(await voice.roomState(req.params.id));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE api/rooms/:id/voice-channels/:channelId
// @desc    Delete a channel (room owner or channel creator); everyone in it is disconnected
router.delete('/:id/voice-channels/:channelId', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        const channel = room?.voiceChannels.id(req.params.channelId);
        if (!channel) return res.status(404).json({ msg: 'Channel not found' });
        if (!canManageChannel(room, channel, req.user.id)) return res.status(403).json({ msg: 'Only the room owner or the channel creator can delete it' });
        if (room.voiceChannels.length <= 1) return res.status(400).json({ msg: 'A room needs at least one voice channel' });
        room.voiceChannels.pull(req.params.channelId);
        await room.save();
        voice.closeChannel(req.params.channelId);
        voice.invalidateRoom(req.params.id);
        await voice.broadcastRoom(req.params.id);
        res.json(await voice.roomState(req.params.id));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   GET api/rooms/:id/messages
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).select('owner members');
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!isRoomMember(room, req.user.id)) return res.status(403).json({ msg: 'Access Denied' });

        // Newest N messages, returned oldest-first for display
        const messages = await Message.find({ room: req.params.id })
            .populate('sender', 'username')
            .sort({ createdAt: -1 })
            .limit(MESSAGE_HISTORY_LIMIT);
        res.json(messages.reverse());
    } catch (err) {
        console.error('Chat Load Error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/rooms/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id)
            .populate('owner', 'username')
            .populate('members', 'username');

        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!isRoomMember(room, req.user.id)) return res.status(403).json({ msg: 'Access Denied' });

        res.json(room);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Whitelisted, type-checked room settings shared by create and update.
const pickRoomFields = (body) => {
    const fields = {};
    if (typeof body.name === 'string') fields.name = body.name.trim().slice(0, 80);
    if (typeof body.description === 'string') fields.description = body.description.slice(0, 1000);
    if (typeof body.isPrivate === 'boolean') fields.isPrivate = body.isPrivate;
    if (typeof body.language === 'string') fields.language = body.language.slice(0, 40);
    if (Array.isArray(body.requiredSkills)) {
        fields.requiredSkills = body.requiredSkills
            .filter(s => s && typeof s.name === 'string' && s.name.trim())
            .slice(0, 20)
            .map(s => ({ name: s.name.trim().slice(0, 50), weight: Math.min(Math.max(Number(s.weight) || 1, 0), 5) }));
    }
    if (body.minRating !== undefined && Number.isFinite(Number(body.minRating))) fields.minRating = Math.max(0, Number(body.minRating));
    if (body.capacity !== undefined && Number.isFinite(Number(body.capacity))) fields.capacity = Math.min(Math.max(Math.round(Number(body.capacity)), 2), 100);
    if (typeof body.projectDescription === 'string') fields.projectDescription = body.projectDescription.slice(0, 2000);
    if (typeof body.isDiscoverable === 'boolean') fields.isDiscoverable = body.isDiscoverable;
    if (Array.isArray(body.tags)) fields.tags = body.tags.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
    return fields;
};

// @route   POST api/rooms
router.post('/', auth, async (req, res) => {
    try {
        const fields = pickRoomFields(req.body);
        if (!fields.name) return res.status(400).json({ msg: 'Room name is required' });

        const room = await new Room({ ...fields, owner: req.user.id, members: [] }).save();
        res.json(room);
    } catch (err) {
        console.error('Create room error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/rooms/:id
// Owner-only room settings update (used by the Edit Room modal).
router.put('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!idEquals(room.owner, req.user.id)) return res.status(403).json({ msg: 'Only the room owner can edit this room' });

        const fields = pickRoomFields(req.body);
        if (fields.name === '') return res.status(400).json({ msg: 'Room name cannot be empty' });
        Object.assign(room, fields);
        await room.save();

        const populated = await Room.findById(room._id)
            .populate('owner', 'username')
            .populate('members', 'username');

        const io = req.app.get('socketio');
        if (io) io.to(req.params.id).emit('room-update');

        res.json(populated);
    } catch (err) {
        console.error('Update room error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/accept-invite
router.post('/:id/accept-invite', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        if (isRoomMember(room, req.user.id)) {
            return res.json({ msg: 'Already a member', roomId: room._id });
        }

        // Joining requires an invite that was actually sent to this user for this room
        const invite = await Notification.findOne({ user: req.user.id, type: 'invite', relatedId: room._id });
        if (!invite) return res.status(403).json({ msg: 'No pending invitation for this room' });

        if (isFull(room)) return res.status(400).json({ msg: 'This room is full' });

        await Room.updateOne({ _id: room._id }, { $addToSet: { members: req.user.id } });

        // Clear every pending invite for this room so it doesn't persist
        await Notification.deleteMany({ user: req.user.id, type: 'invite', relatedId: room._id });

        const io = req.app.get('socketio');
        if (io) io.to(req.params.id).emit('room-update');

        res.json({ msg: 'Joined successfully', roomId: room._id });
    } catch (err) {
        console.error('Accept invite error:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/request-join
router.post('/:id/request-join', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!room.owner) return res.status(400).json({ msg: 'Room has no owner' });

        if (isRoomMember(room, req.user.id)) {
            return res.status(400).json({ msg: 'Already a member' });
        }
        if (isFull(room)) return res.status(400).json({ msg: 'This room is full' });

        // Check if request already pending
        const existingReq = await Notification.findOne({
            user: room.owner,
            type: 'join_request',
            relatedId: room._id,
            sender: req.user.id
        });

        if (existingReq) {
            return res.status(400).json({ msg: 'Request already sent' });
        }

        // The JWT only carries the user id, so look the name up for the message
        const requester = await User.findById(req.user.id).select('username');

        const newNotif = await new Notification({
            user: room.owner,
            sender: req.user.id,
            type: 'join_request',
            message: `${requester?.username || 'A user'} wants to join ${room.name}`,
            relatedId: room._id
        }).save();

        emitToUser(req, room.owner, 'new-notification', newNotif);

        res.json({ msg: 'Join request sent to owner' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/approve-join
router.post('/:id/approve-join', auth, async (req, res) => {
    try {
        const { userId } = req.body; // User to approve
        if (!isValidId(String(userId || ''))) return res.status(400).json({ msg: 'Valid user ID required' });

        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!idEquals(room.owner, req.user.id)) return res.status(403).json({ msg: 'Not Authorized' });

        // Only users who actually asked to join can be approved
        const request = await Notification.findOne({
            user: req.user.id, type: 'join_request', relatedId: room._id, sender: userId
        });
        if (!request && !isRoomMember(room, userId)) {
            return res.status(400).json({ msg: 'This user has no pending join request' });
        }

        if (!isRoomMember(room, userId)) {
            if (isFull(room)) return res.status(400).json({ msg: 'This room is full' });
            await Room.updateOne({ _id: room._id }, { $addToSet: { members: userId } });
        }

        await Notification.deleteMany({ user: req.user.id, type: 'join_request', relatedId: room._id, sender: userId });

        // Notify the user they were accepted
        const newNotif = await new Notification({
            user: userId,
            sender: req.user.id,
            type: 'info',
            message: `Your request to join ${room.name} was approved!`,
            relatedId: room._id
        }).save();
        emitToUser(req, userId, 'new-notification', newNotif);

        // Tell everyone in the room about the updated member list
        const updated = await Room.findById(req.params.id).populate('members', 'username');
        const io = req.app.get('socketio');
        if (io) {
            io.to(req.params.id).emit('room-members-updated', {
                members: updated.members.filter(Boolean).map(m => ({ _id: m._id, username: m.username }))
            });
        }

        res.json({ msg: 'User approved', roomId: room._id });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/send-invite
router.post('/:id/send-invite', auth, async (req, res) => {
    try {
        return await sendRoomInvite(req, res, req.params.id, req.body.userId, req.body.message);
    } catch (err) {
        console.error('Send invite error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   DELETE api/rooms/:id
// Deletes the room and everything that belongs to it (projects, files, chat, notifications).
router.delete('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!idEquals(room.owner, req.user.id)) return res.status(403).json({ msg: 'User not authorized' });

        const projects = await Project.find({ room: room._id }).select('_id');
        const projectIds = projects.map(p => p._id);

        for (const projectId of projectIds) {
            await stopAllForProject(projectId);
            await destroyDeployment(projectId);
            fs.rm(getProjectDir(projectId), { recursive: true, force: true }, () => {});
        }

        await Promise.all([
            File.deleteMany({ project: { $in: projectIds } }),
            Project.deleteMany({ room: room._id }),
            Message.deleteMany({ room: room._id }),
            Notification.deleteMany({ relatedId: room._id })
        ]);
        await room.deleteOne();

        const io = req.app.get('socketio');
        if (io) io.to(req.params.id).emit('room-deleted', { roomId: req.params.id });

        res.json({ msg: 'Room removed' });
    } catch (err) {
        console.error('Delete room error:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
module.exports.sendRoomInvite = sendRoomInvite;
