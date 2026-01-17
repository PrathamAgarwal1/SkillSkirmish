# Deployment Guide

## 1. Frontend (Netlify)
This project is configured to be deployed on Netlify.

### Steps:
1.  **Connect to Repository**: Go to Netlify and "Import from Git".
2.  **Build Settings**:
    *   **Base directory**: `client`
    *   **Build command**: `npm run build`
    *   **Publish directory**: `dist`
3.  **Environment Variables** (Netlify Site Settings > Build & deploy > Environment):
    *   `VITE_SERVER_URL`: The URL of your deployed backend (e.g., `https://my-backend.onrender.com`).
    *   `VITE_LIVEKIT_URL`: Your LiveKit WebSocket URL (wss://...).
    *   *Note*: If you haven't deployed the backend yet, you can leave `VITE_SERVER_URL` blank for now, but the app won't connect.

## 2. Backend (Render / Railway / Heroku)
Since your backend uses WebSockets (`socket.io`), you need a hosting provider that supports persistent connections (not serverless functions). **Render** is a good free option.

### Steps (Render Example):
1.  **Create New Web Service** on Render.
2.  **Connect Repository**.
3.  **Settings**:
    *   **Root Directory**: `server`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node index.js`
4.  **Environment Variables**:
    *   `MONGO_URI`: Your MongoDB connection string.
    *   `LIVEKIT_API_KEY`: API Key from LiveKit dashboard.
    *   `LIVEKIT_API_SECRET`: Secret Key from LiveKit dashboard.

## 3. Connecting Them
Once the Backend is deployed, copy its URL (e.g., `https://codecollab-server.onrender.com`) and update the `VITE_SERVER_URL` in your Netlify settings. Redeploy the Frontend.
