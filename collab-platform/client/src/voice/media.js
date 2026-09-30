// voice/media.js — voice & video settings (saved per browser) and capturing mic / camera / screen.

const KEY = 'ss-voice-settings';

export const DEFAULT_SETTINGS = {
    micId: '',
    cameraId: '',
    speakerId: '',
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    pushToTalk: false,
    pttKey: 'Backquote', // KeyboardEvent.code
    joinWithCamera: false,
    sounds: true,
    volumes: {}          // userId -> 0..2
};

export function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings) {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

export const micConstraints = (s) => ({
    deviceId: s.micId ? { ideal: s.micId } : undefined,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    channelCount: 1
});

export const cameraConstraints = (s) => ({
    deviceId: s.cameraId ? { ideal: s.cameraId } : undefined,
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 }
});

/** Returns the mic track, or null (with the reason) when there's no mic or permission was denied. */
export async function getMic(settings) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(settings) });
        return { track: stream.getAudioTracks()[0] };
    } catch (err) {
        return { track: null, error: describeError(err, 'microphone') };
    }
}

export async function getCamera(settings) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(settings) });
    const track = stream.getVideoTracks()[0];
    track.contentHint = 'motion';
    return track;
}

/** Screen share: video + (tab/system) audio when the browser offers it. */
export async function getScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude'
    });
    const video = stream.getVideoTracks()[0];
    video.contentHint = 'detail'; // favor sharp text over frame rate
    return { video, audio: stream.getAudioTracks()[0] || null };
}

export async function listDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const pick = (kind) => devices.filter(d => d.kind === kind).map((d, i) => ({ id: d.deviceId, label: d.label || `${kind} ${i + 1}` }));
        return { mics: pick('audioinput'), cameras: pick('videoinput'), speakers: pick('audiooutput') };
    } catch {
        return { mics: [], cameras: [], speakers: [] };
    }
}

export function describeError(err, what) {
    if (!err) return null;
    if (err.name === 'NotAllowedError') return `Permission to use your ${what} was blocked. Allow it in the address bar to use it.`;
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return `No ${what} found.`;
    if (err.name === 'NotReadableError') return `Your ${what} is being used by another app.`;
    return err.message || `Couldn't access your ${what}.`;
}

/** "Backquote" -> "`", "KeyV" -> "V" for display */
export const keyLabel = (code) => ({ Backquote: '`', Space: 'Space', CapsLock: 'Caps Lock' }[code] || code.replace(/^Key|^Digit/, ''));
