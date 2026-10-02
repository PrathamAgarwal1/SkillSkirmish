import React from 'react';
import { Buffer } from 'buffer';
import process from 'process';

// Polyfill Node.js globals for simple-peer
window.global = window;
window.process = process;
window.Buffer = Buffer;

import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './palette.css';
import './index.css';
import './modern-dark.css';
import './ui.css';
import './themes.css';
import { applyStoredAppearance } from './appearance/context';

// Apply the saved look (Appearance page) before the first paint
applyStoredAppearance();
import { AuthProvider } from './context/AuthContext.jsx';
import axios from 'axios'; // <-- IMPORT AXIOS
import { installNetworkResilience } from './utils/serverStatus';

// --- Configure Monaco Editor to load from local bundle instead of CDN ---
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
// The editor's language services run in background workers (bundled by Vite)
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TsWorker();
    return new EditorWorker();
  }
};
loader.config({ monaco });
// ---

console.log("1. main.jsx is running");

// Sets the base URL for all future Axios requests and strips any accidental trailing slash
const rawServerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
axios.defaults.baseURL = rawServerUrl.replace(/\/+$/, '');

// Retry safe requests while the server wakes up, and show readable errors instead of "Network Error"
installNetworkResilience(axios);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);