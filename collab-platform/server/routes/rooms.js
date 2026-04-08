const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const User = require('../models/User');
const Message = require('../models/Message'); // Import Message Model
const { ROOM_WEIGHTS, computeRoomScore } = require('../utils/matchmaking');

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
        const { q } = req.query;
        const query = q ? { name: { $regex: q, $options: 'i' } } : {};
        query.isPrivate = false;
        const rooms = await Room.find(query).populate('owner', 'username');
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
        const availableRooms = rooms.filter(r => (r.members || []).length < (r.capacity || 10));

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
        res.status(500).json({ msg: 'Server Error', reason: err.message });
    }
});

// --- VIDEO CALL ROUTES (Multiple Concurrent Calls) - MUST BE BEFORE /:id ---

// @route   GET api/rooms/:id/video-calls
router.get('/:id/video-calls', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).populate('activeCalls.startedBy', 'username').populate('activeCalls.participants.userId', 'username');
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const activeCalls = room.activeCalls || [];
        const calls = activeCalls.map(call => ({
            callId: call._id,
            callName: call.callName || 'Call',
            startedBy: call.startedBy ? { _id: call.startedBy._id, username: call.startedBy.username } : null,
            startedAt: call.startedAt,
            maxSlots: call.maxSlots,
            participantCount: (call.participants || []).length,
            participants: (call.participants || []).map(p => ({
                userId: p.userId._id,
                username: p.userId.username,
                joinedAt: p.joinedAt
            }))
        }));

        res.json({
            activeCalls: calls,
            maxConcurrentCalls: room.maxConcurrentCalls || 3,
            canStartNewCall: calls.length < (room.maxConcurrentCalls || 3)
        });
    } catch (err) {
        console.error('Error fetching calls:', err);
        res.status(500).json({ msg: err.message || 'Failed to fetch calls' });
    }
});

// @route   POST api/rooms/:id/video-calls/start
router.post('/:id/video-calls/start', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).populate('members', 'username');
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const isMember = room.members.some(m => m._id.toString() === req.user.id) || room.owner.toString() === req.user.id;
        if (!isMember) return res.status(403).json({ msg: 'Access Denied' });

        // Initialize activeCalls if it doesn't exist
        if (!room.activeCalls) {
            room.activeCalls = [];
        }

        // Check if user is already in a call
        const userInCall = room.activeCalls.some(call =>
            call.participants.some(p => p.userId.toString() === req.user.id)
        );
        if (userInCall) {
            return res.status(400).json({ msg: 'You must leave your current call before starting a new one' });
        }

        // Check if max concurrent calls reached
        if (room.activeCalls.length >= (room.maxConcurrentCalls || 3)) {
            return res.status(400).json({ msg: `Maximum ${room.maxConcurrentCalls || 3} concurrent calls already active` });
        }

        // Create new call with optional name and max slots
        const { callName, maxSlots } = req.body;
        const newCall = {
            callName: callName || 'Call',
            startedBy: req.user.id,
            startedAt: new Date(),
            maxSlots: maxSlots || 10,
            participants: [{ userId: req.user.id }]
        };

        room.activeCalls.push(newCall);
        await room.save();

        // Re-fetch room with populated fields
        const populatedRoom = await Room.findById(req.params.id)
            .populate('activeCalls.startedBy', 'username')
            .populate('activeCalls.participants.userId', 'username');

        const call = populatedRoom.activeCalls[populatedRoom.activeCalls.length - 1];

        res.json({
            msg: 'Video call started',
            callId: call._id,
            callName: call.callName || 'Call',
            maxSlots: call.maxSlots,
            startedBy: { _id: call.startedBy._id, username: call.startedBy.username },
            participants: call.participants.map(p => ({
                userId: p.userId._id,
                username: p.userId.username,
                joinedAt: p.joinedAt
            }))
        });
    } catch (err) {
        console.error('Error starting video call:', err);
        res.status(500).json({ msg: err.message || 'Failed to start call' });
    }
});

// @route   POST api/rooms/:id/video-calls/:callId/join
router.post('/:id/video-calls/:callId/join', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).populate('members', 'username');
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const isMember = room.members.some(m => m._id.toString() === req.user.id) || room.owner.toString() === req.user.id;
        if (!isMember) return res.status(403).json({ msg: 'Access Denied' });

        const call = room.activeCalls.id(req.params.callId);
        if (!call) return res.status(404).json({ msg: 'Call not found' });

        if (call.participants.length >= call.maxSlots) {
            return res.status(400).json({ msg: 'Call is full' });
        }

        // Check if user already in this call
        const alreadyInCall = call.participants.some(p => p.userId.toString() === req.user.id);
        if (alreadyInCall) {
            return res.json({ msg: 'Already in call' });
        }

        // Check if user is already in a different call (excluding the current one)
        const userInOtherCall = room.activeCalls.some(activeCall =>
            activeCall._id.toString() !== req.params.callId &&
            activeCall.participants.some(p => p.userId.toString() === req.user.id)
        );

        if (userInOtherCall) {
            // Try to clean up the stale entry first
            for (const otherCall of room.activeCalls) {
                if (otherCall._id.toString() !== req.params.callId) {
                    otherCall.participants = otherCall.participants.filter(p => p.userId.toString() !== req.user.id);
                }
            }
            await room.save();

            // Continue with join - don't reject
        }

        call.participants.push({ userId: req.user.id });
        await room.save();

        // Re-fetch room with populated fields
        const populatedRoom = await Room.findById(req.params.id)
            .populate('activeCalls.participants.userId', 'username');
        const updatedCall = populatedRoom.activeCalls.id(req.params.callId);

        res.json({
            msg: 'Joined video call',
            callId: call._id,
            participants: updatedCall.participants.map(p => ({
                userId: p.userId._id,
                username: p.userId.username,
                joinedAt: p.joinedAt
            }))
        });
    } catch (err) {
        console.error('Error joining call:', err);
        res.status(500).json({ msg: err.message || 'Failed to join call' });
    }
});

// @route   POST api/rooms/:id/video-calls/:callId/leave
router.post('/:id/video-calls/:callId/leave', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const call = room.activeCalls.id(req.params.callId);
        if (!call) return res.status(404).json({ msg: 'Call not found' });

        // Remove user from participants - ensure they're really removed
        const initialLength = call.participants.length;
        call.participants = call.participants.filter(p => p.userId.toString() !== req.user.id);

        // Log if user wasn't in the call to begin with
        if (call.participants.length === initialLength) {
            console.warn(`User ${req.user.id} was not in call ${req.params.callId}`);
        }

        // Call persists even if empty — only manual delete removes it
        await room.save();

        // Re-fetch room with populated fields to ensure fresh data
        const populatedRoom = await Room.findById(req.params.id)
            .populate('activeCalls.participants.userId', 'username');

        res.json({
            msg: 'Left video call',
            activeCalls: populatedRoom.activeCalls.map(c => ({
                callId: c._id,
                callName: c.callName || 'Call',
                maxSlots: c.maxSlots,
                participantCount: c.participants.length,
                participants: c.participants.map(p => ({
                    userId: p.userId._id,
                    username: p.userId.username
                }))
            }))
        });
    } catch (err) {
        console.error('Error leaving call:', err);
        res.status(500).json({ msg: err.message || 'Failed to leave call' });
    }
});

// @route   DELETE api/rooms/:id/video-calls/:callId
router.delete('/:id/video-calls/:callId', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        const call = room.activeCalls.id(req.params.callId);
        if (!call) return res.status(404).json({ msg: 'Call not found' });

        // Only creator or room owner can delete
        const isOwner = room.owner.toString() === req.user.id;
        const isCreator = call.startedBy?.toString() === req.user.id;
        if (!isOwner && !isCreator) {
            return res.status(403).json({ msg: 'Only the call creator or room owner can delete a call' });
        }

        room.activeCalls.pull(req.params.callId);
        await room.save();

        res.json({ msg: 'Call deleted', callId: req.params.callId });
    } catch (err) {
        console.error('Error deleting call:', err);
        res.status(500).json({ msg: err.message || 'Failed to delete call' });
    }
});

// @route   GET api/rooms/:id/messages
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const messages = await Message.find({ room: req.params.id })
            .populate('sender', 'username')
            .sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        console.error("Chat Load Error:", err.message);
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

        const isOwner = room.owner._id.toString() === req.user.id;
        const isMember = room.members.some(m => m._id.toString() === req.user.id);

        if (!isOwner && !isMember) {
            return res.status(403).json({ msg: 'Access Denied' });
        }

        res.json(room);
    } catch (err) {
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Room not found' });
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms
router.post('/', auth, async (req, res) => {
    try {
        const {
            name, description, isPrivate, language,
            requiredSkills, minRating, capacity,
            projectDescription, isDiscoverable, tags
        } = req.body;

        const newRoom = new Room({
            name,
            description,
            owner: req.user.id,
            members: [],
            ...(isPrivate !== undefined && { isPrivate }),
            ...(language && { language }),
            ...(requiredSkills && { requiredSkills }),
            ...(minRating !== undefined && { minRating }),
            ...(capacity !== undefined && { capacity }),
            ...(projectDescription && { projectDescription }),
            ...(isDiscoverable !== undefined && { isDiscoverable }),
            ...(tags && { tags })
        });
        const room = await newRoom.save();
        res.json(room);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/accept-invite
router.post('/:id/accept-invite', auth, async (req, res) => {
    try {
        const { notificationId } = req.body;
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });

        if (room.members.includes(req.user.id) || room.owner.toString() === req.user.id) {
            return res.json({ msg: 'Already a member', roomId: room._id });
        }

        room.members.push(req.user.id);
        await room.save();
        
        // Delete the notification so it doesn't persist
        if (notificationId) {
            const Notification = require('../models/Notification');
            await Notification.findByIdAndDelete(notificationId);
        }

        res.json({ msg: 'Joined successfully', roomId: room._id });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/request-join
router.post('/:id/request-join', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!room.owner) return res.status(400).json({ msg: 'Room has no owner' });

        if (room.members.includes(req.user.id) || room.owner.toString() === req.user.id) {
            return res.status(400).json({ msg: 'Already a member' });
        }

        // Check availability of Notification model (Lazy load if needed or ensure import)
        const Notification = require('../models/Notification');

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

        // Log for debugging
        console.log('DEBUG: room.owner =', room.owner);
        console.log('DEBUG: req.user.id =', req.user.id);
        console.log('DEBUG: req.user.username =', req.user.username);

        // Create Notification for Owner
        const newNotif = new Notification({
            user: room.owner,
            sender: req.user.id,
            type: 'join_request',
            message: `${req.user.username || 'A user'} wants to join ${room.name}`,
            relatedId: room._id
        });
        console.log('DEBUG: newNotif before save =', newNotif);
        await newNotif.save();

        // **SOCKET EMIT TO OWNER VIA IO**
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        if (io && userSocketMap) {
            const recipientSocketId = userSocketMap[room.owner.toString()];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new-notification', newNotif);
            }
        }

        res.json({ msg: 'Join request sent to owner' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/rooms/:id/approve-join
router.post('/:id/approve-join', auth, async (req, res) => {
    try {
        const { userId, notificationId } = req.body; // User to approve
        let room = await Room.findById(req.params.id).populate('members', 'username');

        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) return res.status(401).json({ msg: 'Not Authorized' });

        if (!room.members.find(m => m._id.toString() === userId)) {
            room.members.push(userId);
            await room.save();
            // Reload to get populated members
            room = await Room.findById(req.params.id).populate('members', 'username');
        }

        // Delete the notification
        const Notification = require('../models/Notification');
        if (notificationId) {
            await Notification.findByIdAndDelete(notificationId);
        }

        // Notify the user they were accepted
        const newNotif = new Notification({
            user: userId,
            sender: req.user.id,
            type: 'info',
            message: `Your request to join ${room.name} was approved!`,
            relatedId: room._id
        });
        await newNotif.save();

        // Emit socket event to notify all users in room about updated members
        const io = req.app.get('socketio');
        if (io) {
            io.to(req.params.id).emit('room-members-updated', {
                members: room.members.map(m => ({ _id: m._id, username: m.username }))
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
        const { userId } = req.body;
        const room = await Room.findById(req.params.id);
        const sender = await User.findById(req.user.id);

        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!sender) return res.status(404).json({ msg: 'Sender not found' });
        if (!userId) return res.status(400).json({ msg: 'User ID required' });

        // Check authorization - must be room owner
        if (room.owner.toString() !== req.user.id.toString()) {
            return res.status(401).json({ msg: 'Only room owner can send invites' });
        }

        const { message } = req.body;
        let notifMsg = `${sender.username} invited you to join room: ${room.name}`;
        if (message) notifMsg += `\nReason: ${message}`;

        // Create invitation notification
        const Notification = require('../models/Notification');
        const newNotif = new Notification({
            user: userId,
            sender: req.user.id,
            type: 'invite',
            message: notifMsg,
            relatedId: room._id
        });
        await newNotif.save();

        // Emit socket event to notify user
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        if (io && userSocketMap) {
            const recipientSocketId = userSocketMap[userId.toString()];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new-notification', newNotif);
            }
        }

        res.json({ msg: 'Invitation sent' });

    } catch (err) {
        console.error('Send invite error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @route   DELETE api/rooms/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) return res.status(401).json({ msg: 'User not authorized' });
        await room.deleteOne();
        res.json({ msg: 'Room removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;