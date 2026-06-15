<div align="center">
  <h1>⚔️ SkillSkirmish</h1>
  <p><strong>A Real-Time, Interactive Collaboration Platform Built for Developers</strong></p>
</div>

<br />

SkillSkirmish combines a powerful IDE, real-time video/audio communication, collaborative document editing, and a competitive matchmaking system into one cohesive workspace. Whether you're pair-programming, hosting a technical interview, or competing in algorithmic battles, SkillSkirmish has you covered.

## 🌟 Features

- **🚀 Real-Time Collaboration**: Edit code and documents simultaneously with your team using robust `Yjs` synchronization and WebSockets.
- **🎥 Integrated Video Conferencing**: Seamless, low-latency video and audio calls powered by `Mediasoup` (WebRTC) directly within your workspace. No external tools needed.
- **⚡ Live Code Execution**: Write, compile, and execute your code instantly within the built-in browser IDE.
- **🏆 Matchmaking & Competitive Coding**: Challenge peers, improve your algorithmic skills, and dynamically adjust your rating based on performance.
- **📁 Project & Room Management**: Organize your codebases into distinct projects and invite friends to collaborative real-time rooms.
- **🔐 Secure Authentication**: Quick and secure onboarding with Google OAuth 2.0 (via Auth0).

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React.js (Vite)
- **Styling**: Tailwind CSS
- **Real-time**: Socket.io-client, Yjs

### Backend
- **Server**: Node.js & Express
- **Database**: MongoDB (Mongoose)
- **WebRTC / Video**: Mediasoup
- **WebSockets**: Socket.io

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [MongoDB](https://www.mongodb.com/) installed on your machine. You will also need API keys for Google OAuth (Auth0) and Gemini/Groq for AI features.

### 1. Clone the repository
```bash
git clone https://github.com/PrathamAgarwal1/SkillSkirmish.git
cd collab-platform
```

### 2. Install dependencies
Open two terminals, one for the frontend and one for the backend.

**Backend (`/server`):**
```bash
cd server
npm install
```

**Frontend (`/client`):**
```bash
cd client
npm install
```

### 3. Environment Variables
Create a `.env` file in the `server` directory and add your keys:
```env
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
AUTH0_DOMAIN=your_auth0_domain
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_CLIENT_SECRET=your_auth0_secret
AUTH0_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

### 4. Run the Development Servers
Start both the backend and frontend servers:

**Backend:**
```bash
# In the /server directory
npm start
```

**Frontend:**
```bash
# In the /client directory
npm run dev
```

Your application should now be running! The frontend will be available at `http://localhost:5173` and the API at `http://localhost:5000`.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the MIT License.
