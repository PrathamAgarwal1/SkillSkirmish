require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Import Models
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room');
const Notification = require('./models/Notification');

// Import mediasoup manager
const mediasoupManager = require('./mediasoup/mediasoupManager');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'http://localhost:5173',
    'https://PrathamAgarwal1.github.io',
    'https://prathamagarwal1.github.io',
    process.env.CLIENT_URL
];

const corsOptions = {
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        console.log('Incoming Origin:', origin); // --- DEBUG LOG ---

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

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
        methods: ["GET", "POST"]
    }
});

const userSocketMap = {};
app.set('socketio', io);
app.set('userSocketMap', userSocketMap);

// Track which mediasoup room each socket is in (for cleanup on disconnect)
const socketMediasoupRooms = {}; // { socketId: Set<roomId> }

const roomUsers = {}; // { roomId: [ { userId, username, socketId } ] }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register-user', (userId) => {
        userSocketMap[userId] = socket.id;
    });

    // --- ROOM LOGIC ---
    socket.on('joinRoom', async ({ roomId, user }) => {
        socket.join(roomId);

        // Add to roomUsers list
        if (!roomUsers[roomId]) roomUsers[roomId] = [];
        // Allow multiple tabs for same user (for testing)
        // Only check if THIS socket is already added (which it shouldn't be on join)
        if (!roomUsers[roomId].some(u => u.socketId === socket.id)) {
            roomUsers[roomId].push({ userId: user._id, username: user.username, socketId: socket.id });
        }

        // Broadcast updated user list to room
        io.to(roomId).emit('roomUsers', roomUsers[roomId]);

        // Broadcast entry message
        socket.to(roomId).emit('message', {
            text: `${user.username} has joined the room.`,
            sender: { username: 'System' }
        });
    });

    socket.on('leaveRoom', ({ roomId, userId }) => {
        if (roomUsers[roomId]) {
            roomUsers[roomId] = roomUsers[roomId].filter(u => u.userId !== userId);
            io.to(roomId).emit('roomUsers', roomUsers[roomId]);
        }
        socket.leave(roomId);
    });

    socket.on('getRoomUsers', ({ roomId }) => {
        if (roomUsers[roomId]) {
            socket.emit('roomUsers', roomUsers[roomId]);
        }
    });

    // --- WEB-RTC SIGNALING ---
    socket.on("callUser", (data) => {
        io.to(data.userToCall).emit("callUser", { signal: data.signalData, from: data.from, name: data.name });
    });

    socket.on("answerCall", (data) => {
        io.to(data.to).emit("callAccepted", { signal: data.signal, from: socket.id });
    });

    // --- VIDEO CALL SYNC (Multiple Calls) ---
    socket.on('videoCallStarted', async ({ roomId, callId }) => {
        const room = await Room.findById(roomId).populate('activeCalls.participants.userId', 'username');
        const activeCalls = room.activeCalls.map(c => ({
            callId: c._id,
            startedBy: c.startedBy,
            participants: c.participants.map(p => ({ userId: p.userId._id, username: p.userId.username })),
            participantCount: c.participants.length
        }));
        socket.to(roomId).emit('multipleCallsUpdate', { activeCalls, canStartNewCall: activeCalls.length < 3 });
    });

    socket.on('videoCallJoin', async ({ roomId, callId, userId }) => {
        const room = await Room.findById(roomId).populate('activeCalls.participants.userId', 'username');
        const activeCalls = room.activeCalls.map(c => ({
            callId: c._id,
            startedBy: c.startedBy,
            participants: c.participants.map(p => ({ userId: p.userId._id, username: p.userId.username })),
            participantCount: c.participants.length
        }));
        socket.to(roomId).emit('multipleCallsUpdate', { activeCalls, canStartNewCall: activeCalls.length < 3 });
    });

    socket.on('videoCallLeave', async ({ roomId, callId, userId }) => {
        const room = await Room.findById(roomId).populate('activeCalls.participants.userId', 'username');
        const activeCalls = room.activeCalls.map(c => ({
            callId: c._id,
            startedBy: c.startedBy,
            participants: c.participants.map(p => ({ userId: p.userId._id, username: p.userId.username })),
            participantCount: c.participants.length
        }));
        socket.to(roomId).emit('multipleCallsUpdate', { activeCalls, canStartNewCall: activeCalls.length < 3 });
    });

    // --- CHAT ---
    socket.on('chatMessage', async ({ roomId, senderId, text }) => {
        try {
            const message = new Message({ room: roomId, sender: senderId, text });
            await message.save();
            const sender = await User.findById(senderId).select('username');
            io.to(roomId).emit('message', { ...message.toObject(), sender: { _id: sender._id, username: sender.username } });
        } catch (error) {
            console.error('Error handling chat message:', error);
        }
    });

    // ========================================================
    // MEDIASOUP SIGNALING EVENTS
    // ========================================================

    // Join a mediasoup room (get router RTP capabilities)
    socket.on('ms-joinRoom', async ({ roomId }, callback) => {
        try {
            const router = await mediasoupManager.getOrCreateRouter(roomId);

            // Track this socket's mediasoup rooms
            if (!socketMediasoupRooms[socket.id]) socketMediasoupRooms[socket.id] = new Set();
            socketMediasoupRooms[socket.id].add(roomId);

            callback({ rtpCapabilities: router.rtpCapabilities });
        } catch (error) {
            console.error('[mediasoup] ms-joinRoom error:', error);
            callback({ error: error.message });
        }
    });

    // Create a WebRTC transport (send or recv)
    socket.on('ms-createTransport', async ({ roomId, direction }, callback) => {
        try {
            const transportParams = await mediasoupManager.createWebRtcTransport(roomId, socket.id, direction);
            callback(transportParams);
        } catch (error) {
            console.error('[mediasoup] ms-createTransport error:', error);
            callback({ error: error.message });
        }
    });

    // Connect a transport with DTLS parameters
    socket.on('ms-connectTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
        try {
            await mediasoupManager.connectTransport(roomId, socket.id, transportId, dtlsParameters);
            callback({ connected: true });
        } catch (error) {
            console.error('[mediasoup] ms-connectTransport error:', error);
            callback({ error: error.message });
        }
    });

    // Produce (send a media track to the SFU)
    socket.on('ms-produce', async ({ roomId, transportId, kind, rtpParameters, appData }, callback) => {
        try {
            const { producerId } = await mediasoupManager.produce(roomId, socket.id, transportId, kind, rtpParameters, appData);

            // Notify all other peers in the room about the new producer
            socket.to(roomId).emit('ms-newProducer', {
                producerId,
                socketId: socket.id,
                kind,
                appData,
            });

            callback({ producerId });
        } catch (error) {
            console.error('[mediasoup] ms-produce error:', error);
            callback({ error: error.message });
        }
    });

    // Consume (receive a media track from the SFU)
    socket.on('ms-consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
        try {
            const consumerParams = await mediasoupManager.consume(roomId, socket.id, producerId, rtpCapabilities);
            callback(consumerParams);
        } catch (error) {
            console.error('[mediasoup] ms-consume error:', error);
            callback({ error: error.message });
        }
    });

    // Resume a paused consumer
    socket.on('ms-resumeConsumer', async ({ roomId, consumerId }, callback) => {
        try {
            await mediasoupManager.resumeConsumer(roomId, socket.id, consumerId);
            callback({ resumed: true });
        } catch (error) {
            console.error('[mediasoup] ms-resumeConsumer error:', error);
            callback({ error: error.message });
        }
    });

    // Close a producer (e.g. stop screen share)
    socket.on('ms-closeProducer', ({ roomId, producerId }) => {
        try {
            mediasoupManager.closeProducer(roomId, socket.id, producerId);

            // Notify other peers that this producer is gone
            socket.to(roomId).emit('ms-producerClosed', { producerId, socketId: socket.id });
        } catch (error) {
            console.error('[mediasoup] ms-closeProducer error:', error);
        }
    });

    // Get all existing producers in a room (for a newly joined peer)
    socket.on('ms-getProducers', ({ roomId }, callback) => {
        try {
            const producers = mediasoupManager.getProducersInRoom(roomId, socket.id);
            callback(producers);
        } catch (error) {
            console.error('[mediasoup] ms-getProducers error:', error);
            callback([]);
        }
    });

    // Leave a mediasoup room
    socket.on('ms-leaveRoom', ({ roomId }) => {
        try {
            const closedProducerIds = mediasoupManager.cleanupPeer(roomId, socket.id);

            // Remove tracking
            if (socketMediasoupRooms[socket.id]) {
                socketMediasoupRooms[socket.id].delete(roomId);
            }

            // Notify other peers about closed producers
            for (const producerId of closedProducerIds) {
                socket.to(roomId).emit('ms-producerClosed', { producerId, socketId: socket.id });
            }
        } catch (error) {
            console.error('[mediasoup] ms-leaveRoom error:', error);
        }
    });

    // ========================================================
    // DISCONNECT HANDLER
    // ========================================================

    socket.on('disconnect', () => {
        // Remove user from all rooms they were in
        for (const roomId in roomUsers) {
            const wasPresent = roomUsers[roomId].some(u => u.socketId === socket.id);
            if (wasPresent) {
                roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
                io.to(roomId).emit('roomUsers', roomUsers[roomId]);
            }
        }

        // Cleanup mediasoup peers on disconnect
        const msRooms = socketMediasoupRooms[socket.id];
        if (msRooms) {
            for (const roomId of msRooms) {
                const closedProducerIds = mediasoupManager.cleanupPeer(roomId, socket.id);
                for (const producerId of closedProducerIds) {
                    socket.to(roomId).emit('ms-producerClosed', { producerId, socketId: socket.id });
                }
            }
            delete socketMediasoupRooms[socket.id];
        }

        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) delete userSocketMap[userId];
    });
});

// --- API ROUTES ---
// All routes are now expected to be in the 'server/routes' folder
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/google', require('./routes/googleAuth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/files', require('./routes/files'));
app.use('/api/execute', require('./routes/execute'));

// NEW AI Routes (Updated to look in the main routes folder)
app.use('/api/matchmaking', require('./routes/matchmaking'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/ai', require('./routes/ai'));

// Initialize mediasoup worker, then start HTTP server
const PORT = process.env.PORT || 5000;
(async () => {
    try {
        await mediasoupManager.createWorker();
        console.log('[mediasoup] Worker ready');
    } catch (err) {
        console.error('[mediasoup] Failed to create worker:', err);
    }
    server.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
})();