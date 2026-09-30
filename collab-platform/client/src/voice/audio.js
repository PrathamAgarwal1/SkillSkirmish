// voice/audio.js — plays call audio through Web Audio: per-user volume (0–200%), deafen, output
// device selection, speaking detection (the green ring) and Discord-like UI sounds.

let ctx = null;
let master = null;
const sources = new Map();   // key -> { el, source, gain, analyser, data }
let localMeter = null;       // { source, analyser, data }
let loop = null;
let speakingState = new Map(); // key -> { speaking, lastLoud }
let onSpeaking = () => {};

const SPEAKING_THRESHOLD = 0.018; // RMS of the signal (roughly -35 dBFS)
const HOLD_MS = 280;

export const context = () => {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
};

const rms = (analyser, data) => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
};

const makeAnalyser = (source) => {
    const analyser = context().createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return { analyser, data: new Float32Array(analyser.fftSize) };
};

function tick() {
    const now = performance.now();
    const check = (key, level) => {
        const s = speakingState.get(key) || { speaking: false, lastLoud: 0 };
        if (level > SPEAKING_THRESHOLD) s.lastLoud = now;
        const speaking = now - s.lastLoud < HOLD_MS;
        if (speaking !== s.speaking) {
            s.speaking = speaking;
            onSpeaking(key, speaking);
        }
        speakingState.set(key, s);
    };
    for (const [key, s] of sources) {
        if (!key.endsWith(':screen')) check(key, rms(s.analyser, s.data));
    }
    if (localMeter) check('self', localMeter.enabled() ? rms(localMeter.analyser, localMeter.data) : 0);
}

/** fn(key, speaking) — key is a peer socket id or 'self'. */
export const setSpeakingListener = (fn) => {
    onSpeaking = fn;
    if (!loop) loop = setInterval(tick, 60);
};

/** Plays a remote audio track. key = peer id (or `${peerId}:screen` for screen-share audio). */
export function attachRemote(key, track, volume = 1) {
    detachRemote(key);
    const stream = new MediaStream([track]);
    // Chrome only feeds remote WebRTC audio into Web Audio if it's also attached to a media element
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    const source = context().createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    sources.set(key, { el, source, gain, ...makeAnalyser(source) });
}

export function detachRemote(key) {
    const s = sources.get(key);
    if (!s) return;
    try { s.source.disconnect(); s.gain.disconnect(); } catch { /* already gone */ }
    s.el.srcObject = null;
    sources.delete(key);
    if (speakingState.get(key)?.speaking) onSpeaking(key, false);
    speakingState.delete(key);
}

export function setVolume(key, volume) {
    for (const k of [key, `${key}:screen`]) {
        const s = sources.get(k);
        if (s) s.gain.gain.setTargetAtTime(volume, context().currentTime, 0.02);
    }
}

export const setDeafened = (deafened) => {
    context();
    master.gain.setTargetAtTime(deafened ? 0 : 1, ctx.currentTime, 0.02);
};

/** Measures the local microphone for the speaking ring. enabled() says whether it's live (not muted). */
export function attachLocal(track, enabled) {
    if (localMeter) try { localMeter.source.disconnect(); } catch { /* ignore */ }
    localMeter = null;
    if (!track) return;
    const source = context().createMediaStreamSource(new MediaStream([track]));
    localMeter = { source, enabled, ...makeAnalyser(source) };
}

/** Current mic level 0..1 (for the settings meter). */
export const localLevel = () => (localMeter ? Math.min(1, rms(localMeter.analyser, localMeter.data) * 6) : 0);

export async function setOutputDevice(deviceId) {
    const c = context();
    if (typeof c.setSinkId === 'function') {
        try { await c.setSinkId(deviceId || ''); return true; } catch { return false; }
    }
    return false;
}

export const outputSelectionSupported = () => typeof (window.AudioContext?.prototype || {}).setSinkId === 'function';

export function reset() {
    for (const key of [...sources.keys()]) detachRemote(key);
    attachLocal(null);
    speakingState = new Map();
    if (master) master.gain.value = 1;
}

// ── UI sounds (synthesized, no audio files) ─────────────────
function tones(notes, { type = 'sine', gain = 0.08 } = {}) {
    const c = context();
    let t = c.currentTime + 0.01;
    for (const [freq, dur] of notes) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(c.destination); // not through master: you still hear them when deafened
        osc.start(t);
        osc.stop(t + dur + 0.02);
        t += dur * 0.75;
    }
}

export const sounds = {
    join: () => tones([[587, 0.12], [880, 0.18]]),
    leave: () => tones([[880, 0.12], [523, 0.2]]),
    peerJoin: () => tones([[659, 0.1], [988, 0.14]], { gain: 0.05 }),
    peerLeave: () => tones([[784, 0.1], [494, 0.16]], { gain: 0.05 }),
    mute: () => tones([[440, 0.08]], { type: 'triangle', gain: 0.06 }),
    unmute: () => tones([[660, 0.08]], { type: 'triangle', gain: 0.06 }),
    deafen: () => tones([[392, 0.1], [294, 0.12]], { type: 'triangle', gain: 0.06 }),
    undeafen: () => tones([[294, 0.1], [392, 0.12]], { type: 'triangle', gain: 0.06 }),
    screen: () => tones([[523, 0.08], [659, 0.08], [784, 0.12]], { gain: 0.05 })
};
