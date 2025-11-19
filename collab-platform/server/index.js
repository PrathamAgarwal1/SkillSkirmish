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

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('register-user', (userId) => {
        userSocketMap[userId] = socket.id;
    });
    socket.on('joinRoom', ({ roomId }) => {
        socket.join(roomId);
    });
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));