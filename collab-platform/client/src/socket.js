import { io } from 'socket.io-client';

// Use your server URL
const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// The server authenticates sockets with the same JWT as the REST API.
// `auth` is a function so every (re)connect picks up the current token.
// App.jsx connects once the user is logged in.
export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: (cb) => cb({ token: localStorage.getItem('token') }),
});
