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

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected...'))
    .catch(err => console.error('MongoDB Connection Error:', err.message));

// Socket.io Setup
const io = new Server(server, {
    cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

const userSocketMap = {};
app.set('socketio', io);
app.set('userSocketMap', userSocketMap);

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

    // --- WEB-RTC SIGNALING ---
    socket.on("callUser", (data) => {
        io.to(data.userToCall).emit("callUser", { signal: data.signalData, from: data.from, name: data.name });
    });

    socket.on("answerCall", (data) => {
        io.to(data.to).emit("callAccepted", { signal: data.signal, from: socket.id });
    });

    // --- TIMER SYNC ---
    socket.on('timerUpdate', ({ roomId, timer, isRunning, mode }) => {
        socket.to(roomId).emit('timerUpdate', { timer, isRunning, mode });
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

    socket.on('disconnect', () => {
        // Remove user from all rooms they were in
        for (const roomId in roomUsers) {
            const wasPresent = roomUsers[roomId].some(u => u.socketId === socket.id);
            if (wasPresent) {
                roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
                io.to(roomId).emit('roomUsers', roomUsers[roomId]);
            }
        }

        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) delete userSocketMap[userId];
    });
});

// --- API ROUTES ---
// All routes are now expected to be in the 'server/routes' folder
app.use('/api/auth', require('./routes/auth'));
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
app.use('/api/livekit', require('./routes/livekit'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));