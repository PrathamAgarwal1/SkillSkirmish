import { io } from 'socket.io-client';

// Use your server URL
const URL = 'http://localhost:5000';

export const socket = io(URL, {
    autoConnect: false // We will connect manually when the user is logged in
});