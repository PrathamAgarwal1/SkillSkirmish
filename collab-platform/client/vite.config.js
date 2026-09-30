import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The Content-Security-Policy in index.html has to allow the API server and the sandbox
// preview subdomains (<token>.preview.<domain>), which depend on where the server is hosted.
// They are derived from VITE_SERVER_URL at build time; VITE_EXTRA_ORIGINS can add more
// (space-separated, e.g. a separate preview domain).
function cspOrigins(env) {
  const frame = [];
  const connect = ['https://*.up.railway.app', 'wss://*.up.railway.app',
    'wss://codecolab-h50tpbmj.livekit.cloud', 'https://codecolab-h50tpbmj.livekit.cloud', 'https://cdn.jsdelivr.net'];
  if (env.VITE_SERVER_URL) {
    try {
      const u = new URL(env.VITE_SERVER_URL);
      const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
      connect.push(u.origin, `${ws}//${u.host}`);
      // previews and deployed apps live on subdomains of the server host
      frame.push(u.origin, `${u.protocol}//*.preview.${u.host}`, `${u.protocol}//*.apps.${u.host}`);
    } catch { /* invalid URL: fall back to the defaults */ }
  }
  const extra = (env.VITE_EXTRA_ORIGINS || '').split(/\s+/).filter(Boolean);
  return { frame: [...frame, ...extra].join(' '), connect: [...connect, ...extra].join(' ') };
}

// The in-browser runtime (WebContainers, Python input()) needs a cross-origin isolated page.
// "credentialless" still lets the app load fonts, avatars and CDN scripts without CORP headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless'
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const csp = cspOrigins(env);
  return {
    plugins: [
      react(),
      {
        name: 'ss-csp',
        transformIndexHtml: (html) => html
          .replace('%SS_FRAME_SRC%', csp.frame)
          .replace('%SS_CONNECT_SRC%', csp.connect)
      }
    ],
    base: '/',
    server: { headers: isolationHeaders },
    preview: { headers: isolationHeaders },
    worker: { format: 'es' },
    // Replace Node's `global` with the standard `globalThis` for browser builds
    define: {
      global: 'globalThis'
    }
  }
})
