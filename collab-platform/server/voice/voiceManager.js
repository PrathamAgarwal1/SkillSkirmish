// voice/voiceManager.js — Discord-style voice channels: live presence + WebRTC signaling.
//
// Each room has persistent voice channels (stored on the Room). Who is in which channel, and whether
// they're muted/deafened/on camera/sharing their screen, lives in memory and is pushed to everyone in
// the room, so the sidebar shows it live — and it disappears the moment a tab closes.
//
// Media flows peer-to-peer between browsers (CALL_MODE=mesh, default: works on any host, even free
// ones) or through the mediasoup SFU (CALL_MODE=sfu: needs open UDP ports, scales to bigger calls).
// This module only relays small signaling messages (SDP offers/answers, ICE candidates).
const crypto = require('crypto');
const Room = require('../models/Room');
const User = require('../models/User');
const { isRoomMember, isValidId } = require('../utils/access');
const { getIceServers } = require('./iceServers');

const MODE = (process.env.CALL_MODE || 'mesh').toLowerCase() === 'sfu' ? 'sfu' : 'mesh';
// Peer-to-peer sends every stream to every peer, so keep mesh channels small
const MAX_USERS = parseInt(process.env.VOICE_MAX_USERS, 10) || (MODE === 'sfu' ? 25 : 10);
const MAX_CHANNELS = 12;
const DEFAULT_CHANNELS = ['General', 'Pair Programming'];

let io = null;
const channels = new Map();      // channelId -> { roomId, members: Map<socketId, member> }
const socketChannel = new Map(); // socketId -> channelId
const roomChannelCache = new Map(); // roomId -> [{ id, name, userLimit, createdBy }]

const newChannelId = () => crypto.randomBytes(8).toString('hex');
const channelRoom = (channelId) => `vc:${channelId}`;

const loading = new Map(); // roomId -> in-flight load (concurrent callers share it)

/** Channel definitions for a room (creates the defaults for rooms that have none). */
async function loadChannels(roomId) {
    roomId = String(roomId);
    if (roomChannelCache.has(roomId)) return roomChannelCache.get(roomId);
    if (loading.has(roomId)) return loading.get(roomId);
    const load = (async () => {
        let room = await Room.findById(roomId).select('voiceChannels owner');
        if (!room) return [];
        if (!room.voiceChannels?.length) {
            // Only set the defaults if nobody else did in the meantime (keeps channel ids stable)
            const defaults = DEFAULT_CHANNELS.map(name => ({ _id: newChannelId(), name, createdBy: room.owner }));
            await Room.updateOne(
                { _id: roomId, $or: [{ voiceChannels: { $exists: false } }, { voiceChannels: { $size: 0 } }] },
                { $set: { voiceChannels: defaults } }
            );
            room = await Room.findById(roomId).select('voiceChannels owner');
        }
        const list = room.voiceChannels.map(c => ({ id: c._id, name: c.name, userLimit: c.userLimit || 0, createdBy: c.createdBy ? String(c.createdBy) : null }));
        roomChannelCache.set(roomId, list);
        return list;
    })();
    loading.set(roomId, load);
    try {
        return await load;
    } finally {
        loading.delete(roomId);
    }
}

const invalidateRoom = (roomId) => roomChannelCache.delete(String(roomId));

const publicMember = (m) => ({
    socketId: m.socketId, userId: m.userId, username: m.username,
    muted: m.muted, deafened: m.deafened, video: m.video, screen: m.screen, joinedAt: m.joinedAt
});

const membersOf = (channelId) => [...(channels.get(channelId)?.members.values() || [])].map(publicMember)
    .sort((a, b) => a.joinedAt - b.joinedAt);

/** Everything the room sidebar needs: channels + who's in them. */
async function roomState(roomId) {
    const defs = await loadChannels(roomId);
    return {
        roomId,
        mode: MODE,
        maxUsers: MAX_USERS,
        channels: defs.map(c => ({ ...c, members: membersOf(c.id) }))
    };
}

async function broadcastRoom(roomId) {
    if (!io) return;
    io.to(String(roomId)).emit('voice:state', await roomState(String(roomId)));
}

function broadcastChannel(channelId) {
    if (!io) return;
    io.to(channelRoom(channelId)).emit('voice:members', { channelId, members: membersOf(channelId) });
}

/** Removes a socket from its voice channel (leave, disconnect, switching channels). */
function leaveChannel(socket, { notify = true } = {}) {
    const channelId = socketChannel.get(socket.id);
    if (!channelId) return null;
    socketChannel.delete(socket.id);
    const channel = channels.get(channelId);
    socket.leave(channelRoom(channelId));
    if (!channel) return null;
    channel.members.delete(socket.id);
    if (notify) {
        socket.to(channelRoom(channelId)).emit('voice:peer-left', { channelId, socketId: socket.id });
        broadcastChannel(channelId);
        broadcastRoom(channel.roomId).catch(() => {});
    }
    if (channel.members.size === 0) channels.delete(channelId);
    return channel.roomId;
}

const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);

function init(socketServer) {
    io = socketServer;
}

/** Per-connection handlers. `helpers` = { safe, ack } from index.js. */
function register(socket, { safe, ack }) {
    const userId = socket.userId;

    socket.on('voice:get-state', safe('voice:get-state', async ({ roomId } = {}, callback) => {
        const reply = ack(callback);
        if (!isValidId(String(roomId || ''))) return reply({ error: 'Invalid room' });
        const room = await Room.findById(roomId).select('owner members');
        if (!room || !isRoomMember(room, userId)) return reply({ error: 'Not a member of this room' });
        reply(await roomState(String(roomId)));
    }));

    socket.on('voice:join', safe('voice:join', async ({ roomId, channelId, state = {} } = {}, callback) => {
        const reply = ack(callback);
        if (!isValidId(String(roomId || ''))) return reply({ error: 'Invalid room' });
        const room = await Room.findById(roomId).select('owner members');
        if (!room || !isRoomMember(room, userId)) return reply({ error: 'You are not a member of this room' });
        const defs = await loadChannels(String(roomId));
        const def = defs.find(c => c.id === channelId);
        if (!def) return reply({ error: 'That voice channel no longer exists' });

        const existing = channels.get(channelId);
        const limit = Math.min(def.userLimit || MAX_USERS, MAX_USERS);
        const alreadyHere = socketChannel.get(socket.id) === channelId;
        if (!alreadyHere && existing && existing.members.size >= limit) return reply({ error: `${def.name} is full (${limit} people)` });

        // One voice channel per connection, like Discord
        const previousRoom = leaveChannel(socket);
        if (previousRoom && previousRoom !== String(roomId)) broadcastRoom(previousRoom).catch(() => {});

        const user = await User.findById(userId).select('username');
        const member = {
            socketId: socket.id, userId: String(userId), username: user?.username || 'Unknown',
            muted: bool(state.muted), deafened: bool(state.deafened), video: bool(state.video), screen: bool(state.screen),
            joinedAt: Date.now()
        };
        if (!channels.has(channelId)) channels.set(channelId, { roomId: String(roomId), members: new Map() });
        const channel = channels.get(channelId);
        const peers = membersOf(channelId); // everyone already here: the newcomer connects to them
        channel.members.set(socket.id, member);
        socketChannel.set(socket.id, channelId);
        socket.join(channelRoom(channelId));

        socket.to(channelRoom(channelId)).emit('voice:peer-joined', { channelId, member: publicMember(member) });
        broadcastChannel(channelId);
        broadcastRoom(String(roomId)).catch(() => {});

        reply({
            ok: true,
            mode: MODE,
            selfId: socket.id,
            channel: { id: def.id, name: def.name, roomId: String(roomId) },
            peers,
            iceServers: MODE === 'mesh' ? await getIceServers(userId) : []
        });
    }));

    socket.on('voice:leave', () => leaveChannel(socket));

    // Relay WebRTC signaling (offer/answer/ICE) — only between members of the same channel
    socket.on('voice:signal', ({ to, data } = {}) => {
        const channelId = socketChannel.get(socket.id);
        if (!channelId || typeof to !== 'string' || socketChannel.get(to) !== channelId) return;
        if (JSON.stringify(data || {}).length > 100000) return;
        io.to(to).emit('voice:signal', { from: socket.id, data });
    });

    socket.on('voice:update', (state = {}) => {
        const channelId = socketChannel.get(socket.id);
        const member = channelId && channels.get(channelId)?.members.get(socket.id);
        if (!member) return;
        for (const key of ['muted', 'deafened', 'video', 'screen']) member[key] = bool(state[key], member[key]);
        broadcastChannel(channelId);
        broadcastRoom(channels.get(channelId).roomId).catch(() => {});
    });

    // Speaking indicator for people who aren't in the channel (sidebar green rings)
    socket.on('voice:speaking', ({ speaking } = {}) => {
        const channelId = socketChannel.get(socket.id);
        const channel = channelId && channels.get(channelId);
        if (!channel) return;
        io.to(channel.roomId).except(channelRoom(channelId)).emit('voice:speaking', { channelId, socketId: socket.id, speaking: !!speaking });
    });

    socket.on('disconnect', () => leaveChannel(socket));
}

/** Is this socket in this voice channel? (SFU signaling uses the channel id as its room) */
const isInChannel = (socketId, channelId) => socketChannel.get(socketId) === channelId;

/** A channel was deleted: kick everyone out of it. */
function closeChannel(channelId) {
    const channel = channels.get(channelId);
    if (!channel || !io) return;
    io.to(channelRoom(channelId)).emit('voice:kicked', { channelId, reason: 'This voice channel was deleted' });
    for (const socketId of channel.members.keys()) {
        socketChannel.delete(socketId);
        io.sockets.sockets.get(socketId)?.leave(channelRoom(channelId));
    }
    channels.delete(channelId);
}

module.exports = {
    init, register, roomState, broadcastRoom, invalidateRoom, closeChannel, isInChannel, loadChannels, newChannelId,
    MODE, MAX_USERS, MAX_CHANNELS
};
