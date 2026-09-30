<div align="center">
  <h1>⚔️ SkillSkirmish</h1>
  <p><strong>A Real-Time, Interactive Collaboration Platform Built for Developers</strong></p>
</div>

<br />

SkillSkirmish combines a powerful IDE, real-time video/audio communication, collaborative document editing, and a competitive matchmaking system into one cohesive workspace. Whether you're pair-programming, hosting a technical interview, or competing in algorithmic battles, SkillSkirmish has you covered.

## 🌟 Features

- **🚀 Real-Time Collaboration**: Edit code and documents simultaneously with your team using robust `Yjs` synchronization and WebSockets.
- **🎧 Discord-style Voice & Video**: Persistent voice channels in every room with live presence (who's talking, muted, deafened, on camera, LIVE screen sharing). Camera, screen share with audio, per-user volume, push-to-talk and noise suppression. You stay connected while you code in the IDE. Calls are peer-to-peer WebRTC (free to host), with an optional mediasoup server relay for big calls.
- **⚡ Sandboxed Code Execution**: Every run, terminal command and package install happens in a locked-down Docker container. Environments: Node.js 22, Python 3.12, and Machine Learning (Jupyter, pandas, scikit-learn, PyTorch, Kaggle CLI).
- **🌐 Live Browser Preview**: Web apps open in a built-in browser with back/forward, device sizes, and console output streamed into the IDE.
- **🚀 One-Click Deploy**: Publish any project to `https://<name>.apps.<your-domain>`, with versions, rollback, and encrypted environment variables.
- **🧩 Project Templates**: React, MERN, Next.js, Node API, Express + EJS, Vanilla Web, FastAPI, Python Script, Machine Learning (Jupyter + Streamlit) and Android (Expo / React Native).
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
Make sure you have [Node.js](https://nodejs.org/) 22+, [MongoDB](https://www.mongodb.com/) and [Docker](https://www.docker.com/) (for the code sandbox) installed on your machine. You will also need API keys for Google OAuth (Auth0) and Gemini/Groq for AI features.

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

Without Docker running, the server starts in **browser mode** and code runs in your browser instead (Chrome, Edge or Firefox).

With Docker, the first time a project runs its sandbox image is built (a few minutes; the ML image takes longest). To build them ahead of time run `npm run sandbox:build` in `/server`. Previews open at `http://<id>.preview.localhost:5000` and deployed apps at `http://<name>.apps.localhost:5000`. `*.localhost` works in browsers with no DNS setup.

Run the server tests with `npm test` in `/server`.

## 🌍 Deploying
- **Free:** Vercel (client) + Render (API) + MongoDB Atlas. Code runs in each user's browser: WebContainers for JavaScript, Pyodide for Python and notebooks, stlite for Streamlit. `render.yaml` sets up the API in one click.
- **Full:** a VPS with Docker for server-side sandboxes, PyTorch/JupyterLab, and hosting of server apps.

[DEPLOYMENT.md](DEPLOYMENT.md) has step-by-step guides for both and what each one supports.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the MIT License.
