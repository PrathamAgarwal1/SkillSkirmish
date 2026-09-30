// sandbox/runtimePages.js — helper pages for the in-browser runtime (browser mode).
//
// /runtime/stlite.html runs a Streamlit app entirely in the browser with stlite (Streamlit on
// Pyodide). The IDE embeds it in the preview window and sends the project files by postMessage.
// It is served from the API origin, not the IDE's, so the app's code can't touch the IDE's session.
const express = require('express');
const { BRIDGE_SCRIPT } = require('./hostRouter');

const STLITE_VERSION = '1.9.2';
const STLITE = `https://cdn.jsdelivr.net/npm/@stlite/browser@${STLITE_VERSION}/build`;

const stlitePage = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Streamlit</title>
${BRIDGE_SCRIPT}
<link rel="stylesheet" href="${STLITE}/stlite.css">
<style>#ss-wait{font-family:ui-monospace,monospace;color:#888;text-align:center;margin-top:30vh}</style>
</head><body>
<div id="ss-wait">Waiting for the app files…</div><div id="root"></div>
<script type="module">
import { mount } from "${STLITE}/stlite.js";
let app = null;
addEventListener("message", (e) => {
  const msg = e.data && e.data.__ssStlite;
  if (!msg || e.source !== window.parent) return;
  document.getElementById("ss-wait").remove?.();
  if (app) { app.unmount(); app = null; }
  app = mount({ entrypoint: msg.entry, files: msg.files, requirements: msg.requirements || [] }, document.getElementById("root"));
});
window.parent.postMessage({ __ss: 1, kind: "stlite-ready" }, "*");
</script>
</body></html>`;

const router = express.Router();

router.get('/stlite.html', (req, res) => {
    res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        // Embeddable from the cross-origin-isolated IDE page
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    res.send(stlitePage);
});

module.exports = router;
module.exports.STLITE_VERSION = STLITE_VERSION;
