import React from 'react';
import { Buffer } from 'buffer';
import process from 'process';

// Polyfill Node.js globals for simple-peer
window.global = window;
window.process = process;
window.Buffer = Buffer;

import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './modern-dark.css';
import { AuthProvider } from './context/AuthContext.jsx';
import axios from 'axios'; // <-- IMPORT AXIOS

// --- Configure Monaco Editor to load from local bundle instead of CDN ---
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
loader.config({ monaco });
// ---

console.log("1. main.jsx is running");

// Sets the base URL for all future Axios requests and strips any accidental trailing slash
const rawServerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
axios.defaults.baseURL = rawServerUrl.replace(/\/+$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);