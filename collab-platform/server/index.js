require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require("socket.io");

// Import Models
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room');
const File = require('./models/File');
const Notification = require('./models/Notification');
const { resolveMentions } = require('./utils/mentions');

// Import mediasoup manager
const mediasoupManager = require('./mediasoup/mediasoupManager');

// Import collaboration manager
const collabManager = require('./services/collabManager');
const { getProjectAccess, isRoomMember, isValidId, idEquals } = require('./utils/access');

// Import skill decay worker
const { runSkillDecay } = require('./workers/skillDecay');

if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not set. Authentication will not work.');
}

const app = express();
const server = http.createServer(app);

// Behind Render/Railway/Vercel proxies: needed for correct client IPs (rate limiting)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Website origins allowed to call the API (includes CLIENT_URL) — see utils/origins.js
const allowedOrigins = require('./utils/origins').allowedOrigins();

const corsOptions = {
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
};

// Static sites deployed from the browser (/apps/<slug>/) and pages used by the in-browser runtime.
// Mounted before CORS: they are public pages, not API calls (module scripts send an Origin header).
const { appsRouter, refererFallback } = require('./sandbox/siteServer');
app.use(refererFallback);
app.use('/apps', appsRouter);
app.use('/runtime', require('./sandbox/runtimePages'));

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Basic health check endpoint
app.get('/', (req, res) => {
    res.status(200).send('SkillSkirmish API is online and running.');
});

// Health check for the client's "waking up" banner, uptime monitors and the keep-awake workflow
app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
        ok: true,
        db: mongoose.connection.readyState === 1,
        mode: require('./sandbox').getMode(),
        uptime: Math.round(process.uptime())
    });
});

const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error('CRITICAL WARNING: MONGO_URI environment variable is not set. MongoDB will not connect.');
} else {
    mongoose.connect(mongoURI)
        .then(() => console.log('MongoDB Connected...'))
        .catch(err => console.error('MongoDB Connection Error:', err.message));
}

// Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    maxHttpBufferSize: 5e6 // Yjs updates can be large, but not unbounded
});

// Previews (<token>.preview.<domain>) and deployed apps (<slug>.apps.<domain>) are routed before
// the API and Socket.IO see the request — see sandbox/hostRouter.js
require('./sandbox/hostRouter').install(server);

const userSocketMap = {};
app.set('socketio', io);
app.set('userSocketMap', userSocketMap);

// Track which mediasoup room each socket is in (for cleanup on disconnect)
const socketMediasoupRooms = {}; // { socketId: Set<callId> }
// Track which projects each socket joined (to rebroadcast presence on disconnect)
const socketProjects = {}; // { socketId: Set<projectId> }

const roomUsers = {}; // { roomId: [ { userId, username, socketId } ] }

const MAX_CHAT_LENGTH = 4000; // room for a code snippet
const msRoomKey = (callId) => `ms:${callId}`;

// Every socket must present the same JWT the REST API uses. The user id comes from the token,
// never from event payloads, so clients can't act as someone else.
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.user.id;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

// Socket.IO acks are optional on the client side — never call an undefined callback.
const ack = (callback) => (typeof callback === 'function' ? callback : () => {});

// Wraps async socket handlers so a thrown error (bad ObjectId, missing doc, ...) is logged
// instead of becoming an unhandled rejection that takes the whole server down.
const safe = (name, handler) => async (...args) => {
    try {
        await handler(...args);
    } catch (err) {
        console.error(`[socket:${name}]`, err.message);
        const maybeCallback = args[args.length - 1];
        if (typeof maybeCallback === 'function') maybeCallback({ error: 'Request failed' });
    }
};

const loadRoomIfMember = async (roomId, userId) => {
    if (!isValidId(String(roomId || ''))) return null;
    const room = await Room.findById(roomId);
    return room && isRoomMember(room, userId) ? room : null;
};

// Discord-style voice channels: presence + WebRTC signaling (voice/voiceManager.js)
const voice = require('./voice/voiceManager');
voice.init(io);
// Coding battles: matchmaking, live progress, judging (battles/battleManager.js)
const battles = require('./battles/battleManager');
battles.init(io);

io.on('connection', (socket) => {
    const userId = socket.userId;
    userSocketMap[userId] = socket.id;
    voice.register(socket, { safe, ack });
    battles.register(socket, { safe, ack });

    // Kept for older clients; identity is already known from the token.
    socket.on('register-user', () => {
        userSocketMap[userId] = socket.id;
    });

    // --- ROOM LOGIC ---
    socket.on('joinRoom', safe('joinRoom', async ({ roomId } = {}) => {
        const room = await loadRoomIfMember(roomId, userId);
        if (!room) return socket.emit('room-error', { roomId, msg: 'You are not a member of this room' });

        const user = await User.findById(userId).select('username');
        if (!user) return;

        socket.join(roomId);
        if (!roomUsers[roomId]) roomUsers[roomId] = [];

        // Is this the first connection for this user in this room? (multiple tabs are allowed)
        const isFirstJoin = !roomUsers[roomId].some(u => u.userId === userId);
        if (!roomUsers[roomId].some(u => u.socketId === socket.id)) {
            roomUsers[roomId].push({ userId, username: user.username, socketId: socket.id });
        }

        io.to(roomId).emit('roomUsers', roomUsers[roomId]);
        socket.emit('voice:state', await voice.roomState(String(roomId)));

        if (isFirstJoin) {
            socket.to(roomId).emit('message', {
                text: `${user.username} has joined the room.`,
                sender: { username: 'System' }
            });
        }
    }));

    socket.on('leaveRoom', ({ roomId } = {}) => {
        if (roomUsers[roomId]) {
            // Only this socket leaves — other tabs of the same user stay connected
            roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
            io.to(roomId).emit('roomUsers', roomUsers[roomId]);
        }
        socket.leave(roomId);
    });

    socket.on('getRoomUsers', ({ roomId } = {}) => {
        if (socket.rooms.has(roomId) && roomUsers[roomId]) {
            socket.emit('roomUsers', roomUsers[roomId]);
        }
    });

    // Manual "refresh" button in the room UI
    socket.on('room-update', () => {
        socket.emit('room-update');
    });

    // --- CHAT ---
    socket.on('chatMessage', safe('chatMessage', async ({ roomId, text, parentId } = {}) => {
        // Sender is always the authenticated user, and only sockets inside the room may post
        if (!socket.rooms.has(roomId)) return;
        const body = typeof text === 'string' ? text.trim().slice(0, MAX_CHAT_LENGTH) : '';
        if (!body) return;

        // Thread reply: the parent must be a top-level message of the same room
        let parent = null;
        if (parentId) {
            if (!isValidId(String(parentId))) return;
            parent = await Message.findOne({ _id: parentId, room: roomId, parent: null }).select('_id');
            if (!parent) return;
        }

        const room = await Room.findById(roomId).select('name owner members');
        if (!room) return;
        const members = await User.find({ _id: { $in: [room.owner, ...room.members] } }).select('username');
        const mentioned = resolveMentions(body, members, userId);
        const sender = members.find(m => idEquals(m._id, userId)) || await User.findById(userId).select('username');

        const message = await new Message({
            room: roomId, sender: userId, text: body, parent: parent?._id || null, mentions: mentioned.map(u => u._id)
        }).save();
        io.to(roomId).emit('message', { ...message.toObject(), sender: { _id: userId, username: sender?.username || 'Unknown' } });

        if (parent) {
            const updated = await Message.findByIdAndUpdate(parent._id, { $inc: { replyCount: 1 }, lastReplyAt: message.createdAt }, { new: true }).select('replyCount lastReplyAt');
            io.to(roomId).emit('message-thread', { parentId: String(parent._id), replyCount: updated?.replyCount || 0, lastReplyAt: updated?.lastReplyAt });
        }

        // @mentions: a notification (and a toast for anyone online)
        const snippet = body.replace(/```[\s\S]*?(```|$)/g, '[code]').replace(/\s+/g, ' ').slice(0, 80);
        for (const user of mentioned) {
            const notification = await new Notification({
                user: user._id,
                sender: userId,
                type: 'mention',
                relatedId: room._id,
                message: `${sender?.username || 'Someone'} mentioned you in ${room.name}: "${snippet}${body.length > 80 ? '…' : ''}"`
            }).save();
            const target = userSocketMap[String(user._id)];
            if (target) io.to(target).emit('new-notification', notification);
        }
    }));

    // --- PROFILE ALERTS ---
    socket.on('profileUpdated', safe('profileUpdated', async () => {
        // Username is read from the DB, not trusted from the payload
        const user = await User.findById(userId).select('username');
        if (!user) return;
        for (const roomId in roomUsers) {
            let updated = false;
            roomUsers[roomId] = roomUsers[roomId].map(u => {
                if (u.userId === userId) {
                    updated = true;
                    return { ...u, username: user.username };
                }
                return u;
            });
            if (updated) io.to(roomId).emit('roomUsers', roomUsers[roomId]);
        }
        io.emit('dashboard-update', { userId });
    }));

    // ========================================================
    // MEDIASOUP SIGNALING EVENTS (CALL_MODE=sfu)
    // (the mediasoup "roomId" is the voice channel id)
    // ========================================================

    const inMsRoom = (callId) => !!socketMediasoupRooms[socket.id]?.has(String(callId));

    // Join a mediasoup room (get router RTP capabilities)
    socket.on('ms-joinRoom', safe('ms-joinRoom', async ({ roomId: callId } = {}, callback) => {
        const reply = ack(callback);
        // Voice channel ids are random 16-char hex strings (see VoiceChannelSchema), not ObjectIds
        if (typeof callId !== 'string' || !/^[0-9a-f]{16}$/i.test(callId)) return reply({ error: 'Invalid call' });

        // Join the voice channel first (voice:join checks room membership and capacity)
        if (!voice.isInChannel(socket.id, callId)) return reply({ error: 'Join the voice channel first' });

        const router = await mediasoupManager.getOrCreateRouter(callId);

        if (!socketMediasoupRooms[socket.id]) socketMediasoupRooms[socket.id] = new Set();
        socketMediasoupRooms[socket.id].add(String(callId));
        // Join the broadcast channel so this peer hears about new/closed producers
        socket.join(msRoomKey(callId));

        reply({ rtpCapabilities: router.rtpCapabilities });
    }));

    // Create a WebRTC transport (send or recv)
    socket.on('ms-createTransport', safe('ms-createTransport', async ({ roomId, direction } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply({ error: 'Join the call first' });
        reply(await mediasoupManager.createWebRtcTransport(roomId, socket.id, direction));
    }));

    // Connect a transport with DTLS parameters
    socket.on('ms-connectTransport', safe('ms-connectTransport', async ({ roomId, transportId, dtlsParameters } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply({ error: 'Join the call first' });
        await mediasoupManager.connectTransport(roomId, socket.id, transportId, dtlsParameters);
        reply({ connected: true });
    }));

    // Produce (send a media track to the SFU)
    socket.on('ms-produce', safe('ms-produce', async ({ roomId, transportId, kind, rtpParameters, appData } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply({ error: 'Join the call first' });
        const { producerId } = await mediasoupManager.produce(roomId, socket.id, transportId, kind, rtpParameters, appData);

        // Notify all other peers in the call about the new producer
        socket.to(msRoomKey(roomId)).emit('ms-newProducer', { producerId, socketId: socket.id, kind, appData });
        reply({ producerId });
    }));

    // Consume (receive a media track from the SFU)
    socket.on('ms-consume', safe('ms-consume', async ({ roomId, producerId, rtpCapabilities } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply({ error: 'Join the call first' });
        reply(await mediasoupManager.consume(roomId, socket.id, producerId, rtpCapabilities));
    }));

    // Resume a paused consumer
    socket.on('ms-resumeConsumer', safe('ms-resumeConsumer', async ({ roomId, consumerId } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply({ error: 'Join the call first' });
        await mediasoupManager.resumeConsumer(roomId, socket.id, consumerId);
        reply({ resumed: true });
    }));

    // Close a producer (e.g. stop screen share)
    socket.on('ms-closeProducer', safe('ms-closeProducer', ({ roomId, producerId } = {}) => {
        if (!inMsRoom(roomId)) return;
        mediasoupManager.closeProducer(roomId, socket.id, producerId);
        socket.to(msRoomKey(roomId)).emit('ms-producerClosed', { producerId, socketId: socket.id });
    }));

    // Get all existing producers in a room (for a newly joined peer)
    socket.on('ms-getProducers', safe('ms-getProducers', ({ roomId } = {}, callback) => {
        const reply = ack(callback);
        if (!inMsRoom(roomId)) return reply([]);
        reply(mediasoupManager.getProducersInRoom(roomId, socket.id));
    }));

    const leaveMediasoupRoom = (callId) => {
        const closedProducerIds = mediasoupManager.cleanupPeer(callId, socket.id);
        for (const producerId of closedProducerIds) {
            socket.to(msRoomKey(callId)).emit('ms-producerClosed', { producerId, socketId: socket.id });
        }
        socket.leave(msRoomKey(callId));
        socketMediasoupRooms[socket.id]?.delete(String(callId));
    };

    // Leave a mediasoup room
    socket.on('ms-leaveRoom', safe('ms-leaveRoom', ({ roomId } = {}) => {
        if (inMsRoom(roomId)) leaveMediasoupRoom(roomId);
    }));

    // ========================================================
    // COLLABORATIVE EDITING EVENTS
    // ========================================================

    const projectRoomKey = (projectId) => `project:${projectId}`;
    const inProject = (projectId) => socket.rooms.has(projectRoomKey(projectId));

    // Join a project's collaborative session
    socket.on('collab:join-project', safe('collab:join-project', async ({ projectId } = {}, callback) => {
        const reply = ack(callback);
        const access = await getProjectAccess(String(projectId || ''), userId);
        if (!access) return reply({ error: 'Not a project member' });

        const user = await User.findById(userId).select('username');
        socket.join(projectRoomKey(projectId));
        if (!socketProjects[socket.id]) socketProjects[socket.id] = new Set();
        socketProjects[socket.id].add(String(projectId));

        collabManager.addUserToProject(projectId, socket.id, userId, user?.username || 'Unknown');
        io.to(projectRoomKey(projectId)).emit('collab:presence', collabManager.getProjectPresence(projectId));
        reply({ success: true });
    }));

    // Leave a project's collaborative session
    socket.on('collab:leave-project', safe('collab:leave-project', ({ projectId } = {}) => {
        socket.leave(projectRoomKey(projectId));
        socketProjects[socket.id]?.delete(String(projectId));
        collabManager.removeUserFromProject(projectId, socket.id);
        io.to(projectRoomKey(projectId)).emit('collab:presence', collabManager.getProjectPresence(projectId));
    }));

    // Open a file for collaborative editing
    socket.on('collab:open-file', safe('collab:open-file', async ({ projectId, fileId, fileName } = {}, callback) => {
        const reply = ack(callback);
        if (!inProject(projectId)) return reply({ error: 'Join the project first' });
        if (!isValidId(String(fileId || ''))) return reply({ error: 'Invalid file' });

        // The file must actually belong to the project the socket was authorized for
        const file = await File.findById(fileId);
        if (!file || !idEquals(file.project, projectId)) return reply({ error: 'File not found' });

        const docKey = `${projectId}:${fileId}`;
        await collabManager.getOrCreateDoc(projectId, fileId, file.content || '');
        collabManager.addUserToDoc(docKey, socket.id);
        socket.join(`collab:${docKey}`);
        collabManager.setUserActiveFile(projectId, socket.id, fileId, fileName || file.name);

        const fullState = collabManager.getFullState(docKey);
        io.to(projectRoomKey(projectId)).emit('collab:presence', collabManager.getProjectPresence(projectId));
        // Others in the file re-send their cursors so the newcomer sees them right away
        socket.to(`collab:${docKey}`).emit('collab:cursor-request', { fileId: String(fileId) });

        reply({
            state: fullState ? Array.from(fullState) : null,
            userCount: collabManager.getDocUserCount(docKey)
        });
    }));

    // Close a file (stop collaborating on it)
    socket.on('collab:close-file', safe('collab:close-file', async ({ projectId, fileId } = {}) => {
        const docKey = `${projectId}:${fileId}`;
        const fileRoom = `collab:${docKey}`;
        if (!socket.rooms.has(fileRoom)) return;

        socket.leave(fileRoom);
        const isEmpty = collabManager.removeUserFromDoc(docKey, socket.id);
        collabManager.setUserActiveFile(projectId, socket.id, null, null);

        // If no more users, persist and clean up
        if (isEmpty) await collabManager.removeDoc(docKey);

        io.to(projectRoomKey(projectId)).emit('collab:presence', collabManager.getProjectPresence(projectId));
    }));

    // Receive a Yjs binary update from a client and broadcast to others
    socket.on('collab:sync-update', safe('collab:sync-update', ({ projectId, fileId, update } = {}) => {
        const docKey = `${projectId}:${fileId}`;
        const fileRoom = `collab:${docKey}`;
        // Only sockets that opened this file (and so passed the access checks) may edit it
        if (!socket.rooms.has(fileRoom)) return;

        collabManager.applyClientUpdate(docKey, update);
        socket.to(fileRoom).emit('collab:sync-update', { update, senderId: socket.id });
    }));

    // Receive cursor position updates and broadcast to others
    socket.on('collab:cursor-update', ({ projectId, fileId, cursor } = {}) => {
        const fileRoom = `collab:${projectId}:${fileId}`;
        if (!socket.rooms.has(fileRoom) || !cursor || typeof cursor !== 'object') return;
        const num = (n) => (Number.isFinite(n) ? Math.max(1, Math.min(1e7, Math.floor(n))) : 1);
        const pos = (p) => (p && typeof p === 'object' ? { lineNumber: num(p.lineNumber), column: num(p.column) } : null);
        const sel = cursor.selection;
        socket.to(fileRoom).emit('collab:cursor-update', {
            socketId: socket.id,
            cursor: {
                position: pos(cursor.position),
                selection: sel && typeof sel === 'object' ? {
                    startLineNumber: num(sel.startLineNumber), startColumn: num(sel.startColumn),
                    endLineNumber: num(sel.endLineNumber), endColumn: num(sel.endColumn)
                } : null,
                username: typeof cursor.username === 'string' ? cursor.username.slice(0, 40) : ''
            }
        });
    });

    // Request current presence for a project
    socket.on('collab:get-presence', ({ projectId } = {}, callback) => {
        ack(callback)(inProject(projectId) ? collabManager.getProjectPresence(projectId) : []);
    });

    // ========================================================
    // DISCONNECT HANDLER
    // ========================================================

    socket.on('disconnect', async () => {
        // Remove user from all rooms they were in
        for (const roomId in roomUsers) {
            if (roomUsers[roomId].some(u => u.socketId === socket.id)) {
                roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
                io.to(roomId).emit('roomUsers', roomUsers[roomId]);
            }
            if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
        }

        // Cleanup mediasoup peers on disconnect
        for (const callId of socketMediasoupRooms[socket.id] || []) {
            try { leaveMediasoupRoom(callId); } catch (err) { console.error('[mediasoup] cleanup error:', err.message); }
        }
        delete socketMediasoupRooms[socket.id];

        // Cleanup collaborative editing, then refresh presence for the projects this socket was in
        try {
            await collabManager.cleanupSocket(socket.id);
            for (const projectId of socketProjects[socket.id] || []) {
                io.to(projectRoomKey(projectId)).emit('collab:presence', collabManager.getProjectPresence(projectId));
            }
        } catch (err) {
            console.error('[collab] disconnect cleanup error:', err.message);
        }
        delete socketProjects[socket.id];

        if (userSocketMap[userId] === socket.id) delete userSocketMap[userId];
    });
});

// --- API ROUTES ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/google', require('./routes/googleAuth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/files', require('./routes/files'));
app.use('/api/execute', require('./routes/execute'));

app.use('/api/deployments', require('./routes/deployments'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/battles', require('./routes/battles'));
// git clone/pull/push from the browser IDE (browser mode) — see routes/gitProxy.js
app.use('/api/git-proxy', require('./routes/gitProxy'));

app.use('/api/matchmaking', require('./routes/matchmaking'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/dashboard', require('./routes/dashboard'));

// JSON 404 for unknown API routes (instead of Express's HTML page)
app.use('/api', (req, res) => res.status(404).json({ msg: 'Not found' }));

// Last-resort error handler: malformed JSON, CORS rejections, multer limits, ...
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('[express] Unhandled error:', err);
    res.status(status).json({ msg: status >= 500 ? 'Server Error' : err.message });
});

// A stray rejection should be logged, not crash every connected user's session
process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled promise rejection:', reason);
});

// Initialize mediasoup worker, then start HTTP server
const PORT = process.env.PORT || 5000;
(async () => {
    // Sandbox: check Docker and clear workspaces left over from a previous run
    const sandbox = require('./sandbox');
    const { driver } = sandbox;
    if (sandbox.getMode() === 'browser') {
        console.log("[sandbox] Browser mode: code runs in each user's browser; deploys are stored in MongoDB");
    } else {
        const sandboxReady = await driver.isAvailable().catch((err) => {
            console.error('[sandbox]', err.message);
            return false;
        });
        if (sandboxReady) {
            await driver.cleanupStaleWorkspaces();
            console.log(`[sandbox] ${driver.name} driver ready${driver.isolated ? '' : ' (UNSANDBOXED)'}`);
        } else {
            sandbox.useBrowserMode();
            console.warn("[sandbox] Docker is not reachable, so switched to browser mode (code runs in users' browsers). Start Docker and restart to run code on the server.");
        }
    }

    try {
        await mediasoupManager.createWorker();
        console.log('[mediasoup] Worker ready');
    } catch (err) {
        console.error('[mediasoup] Failed to create worker:', err);
    }
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server started on port ${PORT}`);

        // Skill decay check: once after 30s (wait for DB), then daily.
        // The worker itself only decays a skill once per week of inactivity.
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        const runDecay = () => runSkillDecay().catch(e => console.error('[SkillDecay] Run failed:', e.message));
        setTimeout(runDecay, 30000);
        setInterval(runDecay, TWENTY_FOUR_HOURS);
        console.log('[SkillDecay] Scheduled: checks every 24 hours');
    });
})();
