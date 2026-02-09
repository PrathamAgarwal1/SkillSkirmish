require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

// Models
const Message = require("./models/Message");
const User = require("./models/User");
const Room = require("./models/Room");
const Notification = require("./models/Notification");

const app = express();
const server = http.createServer(app);

/* =======================
   CORS CONFIG (CRITICAL)
======================= */
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://prathamagrawal1.github.io"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

/* =======================
   DATABASE
======================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err.message));

/* =======================
   SOCKET.IO
======================= */
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://prathamagrawal1.github.io"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const userSocketMap = {};
const roomUsers = {};

app.set("socketio", io);
app.set("userSocketMap", userSocketMap);

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("register-user", userId => {
    userSocketMap[userId] = socket.id;
  });

  socket.on("joinRoom", ({ roomId, user }) => {
    socket.join(roomId);

    if (!roomUsers[roomId]) roomUsers[roomId] = [];

    if (!roomUsers[roomId].some(u => u.socketId === socket.id)) {
      roomUsers[roomId].push({
        userId: user._id,
        username: user.username,
        socketId: socket.id
      });
    }

    io.to(roomId).emit("roomUsers", roomUsers[roomId]);

    socket.to(roomId).emit("message", {
      text: `${user.username} has joined the room.`,
      sender: { username: "System" }
    });
  });

  socket.on("leaveRoom", ({ roomId, userId }) => {
    if (roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(
        u => u.userId !== userId
      );
      io.to(roomId).emit("roomUsers", roomUsers[roomId]);
    }
    socket.leave(roomId);
  });

  socket.on("callUser", data => {
    io.to(data.userToCall).emit("callUser", {
      signal: data.signalData,
      from: data.from,
      name: data.name
    });
  });

  socket.on("answerCall", data => {
    io.to(data.to).emit("callAccepted", {
      signal: data.signal,
      from: socket.id
    });
  });

  socket.on("timerUpdate", ({ roomId, timer, isRunning, mode }) => {
    socket.to(roomId).emit("timerUpdate", {
      timer,
      isRunning,
      mode
    });
  });

  socket.on("chatMessage", async ({ roomId, senderId, text }) => {
    try {
      const message = new Message({
        room: roomId,
        sender: senderId,
        text
      });
      await message.save();

      const sender = await User.findById(senderId).select("username");

      io.to(roomId).emit("message", {
        ...message.toObject(),
        sender: { _id: sender._id, username: sender.username }
      });
    } catch (err) {
      console.error("Chat error:", err);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in roomUsers) {
      roomUsers[roomId] = roomUsers[roomId].filter(
        u => u.socketId !== socket.id
      );
      io.to(roomId).emit("roomUsers", roomUsers[roomId]);
    }

    const userId = Object.keys(userSocketMap).find(
      key => userSocketMap[key] === socket.id
    );
    if (userId) delete userSocketMap[userId];
  });
});

/* =======================
   ROUTES
======================= */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/files", require("./routes/files"));
app.use("/api/execute", require("./routes/execute"));
app.use("/api/matchmaking", require("./routes/matchmaking"));
app.use("/api/assessment", require("./routes/assessment"));
app.use("/api/livekit", require("./routes/livekit"));

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
