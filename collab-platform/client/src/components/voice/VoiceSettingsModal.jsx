import React, { useEffect, useRef, useState } from 'react';
import { useVoice } from '../../voice/voiceContext';
import * as audio from '../../voice/audio';
import { listDevices, micConstraints, cameraConstraints, keyLabel } from '../../voice/media';
import VideoView from './VideoView';
import './voice.css';

const Toggle = ({ label, hint, value, onChange }) => (
    <div className="vc-toggle">
        <div>{label}{hint && <small>{hint}</small>}</div>
        <button className={`vc-switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value} aria-label={label} />
    </div>
);

/** Live input level: the call's mic when connected, otherwise a temporary test stream. */
function MicMeter({ settings, inCall }) {
    const [level, setLevel] = useState(0);
    useEffect(() => {
        let stream = null;
        let analyser = null;
        let data = null;
        let stopped = false;
        let timer;
        (async () => {
            if (!inCall) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(settings) });
                    if (stopped) return stream.getTracks().forEach(t => t.stop());
                    const ctx = audio.context();
                    analyser = ctx.createAnalyser();
                    analyser.fftSize = 512;
                    data = new Float32Array(analyser.fftSize);
                    ctx.createMediaStreamSource(stream).connect(analyser);
                } catch { /* no mic */ }
            }
            timer = setInterval(() => {
                if (inCall) return setLevel(audio.localLevel());
                if (!analyser) return;
                analyser.getFloatTimeDomainData(data);
                let sum = 0;
                for (const v of data) sum += v * v;
                setLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
            }, 60);
        })();
        return () => {
            stopped = true;
            clearInterval(timer);
            stream?.getTracks().forEach(t => t.stop());
        };
    }, [inCall, settings]);
    return <div className="vc-meter"><div style={{ width: `${Math.round(level * 100)}%` }} /></div>;
}

function CameraPreview({ settings, cameraTrack }) {
    const [stream, setStream] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (cameraTrack) { setStream(new MediaStream([cameraTrack])); return undefined; }
        let own = null;
        let cancelled = false;
        navigator.mediaDevices.getUserMedia({ video: cameraConstraints(settings) })
            .then(s => { if (cancelled) s.getTracks().forEach(t => t.stop()); else { own = s; setStream(s); } })
            .catch(() => setError('No camera available'));
        return () => { cancelled = true; own?.getTracks().forEach(t => t.stop()); };
    }, [settings.cameraId, cameraTrack]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div style={{ aspectRatio: '16 / 9', background: 'var(--gh-000000)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gh-949ba4)' }}>
            {stream ? <VideoView stream={stream} mirror style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (error || 'Starting camera…')}
        </div>
    );
}

const VoiceSettingsModal = () => {
    const voice = useVoice();
    const [tab, setTab] = useState('voice');
    const [devices, setDevices] = useState({ mics: [], cameras: [], speakers: [] });
    const [capturingKey, setCapturingKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const s = voice.settings;
    const set = (patch) => voice.updateSettings(patch);
    const closeRef = useRef(voice.closeSettings);
    closeRef.current = voice.closeSettings;

    useEffect(() => {
        listDevices().then(setDevices);
        navigator.mediaDevices?.addEventListener?.('devicechange', () => listDevices().then(setDevices));
        const esc = (e) => e.key === 'Escape' && !capturingKey && closeRef.current();
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [capturingKey]);

    useEffect(() => {
        if (!capturingKey) return undefined;
        const capture = (e) => {
            e.preventDefault();
            if (e.code !== 'Escape') set({ pttKey: e.code });
            setCapturingKey(false);
        };
        window.addEventListener('keydown', capture, { once: true, capture: true });
        return () => window.removeEventListener('keydown', capture, { capture: true });
    }, [capturingKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const testSpeaker = async () => {
        setTesting(true);
        await audio.setOutputDevice(s.speakerId);
        audio.sounds.join();
        setTimeout(() => setTesting(false), 600);
    };

    const select = (label, value, options, onChange, empty = 'Default') => (
        <div className="vc-field">
            <label>{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="">{empty}</option>
                {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
        </div>
    );

    return (
        <div className="vc-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && voice.closeSettings()}>
            <div className="vc-modal" role="dialog" aria-label="Voice and video settings">
                <div className="vc-modal-head">
                    <h3>Voice & Video</h3>
                    <button className="vc-btn small" onClick={voice.closeSettings}>✕</button>
                </div>
                <div className="vc-tabs">
                    {[['voice', 'Voice'], ['video', 'Video'], ['keys', 'Keybinds']].map(([id, label]) => (
                        <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
                    ))}
                </div>

                {tab === 'voice' && (
                    <div className="vc-modal-body">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {select('Input device', s.micId, devices.mics, (v) => set({ micId: v }))}
                            {audio.outputSelectionSupported()
                                ? select('Output device', s.speakerId, devices.speakers, (v) => set({ speakerId: v }))
                                : <div className="vc-field"><label>Output device</label><div style={{ fontSize: 13, color: 'var(--vc-muted)', paddingTop: 8 }}>Uses your system default in this browser</div></div>}
                        </div>
                        <div className="vc-field">
                            <label>Mic test</label>
                            <MicMeter settings={s} inCall={!!voice.micTrack} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--vc-muted)' }}>
                                <span>Talk: the bar should move.</span>
                                <button className="vc-keycap" onClick={testSpeaker} disabled={testing}>{testing ? '♪' : 'Test speakers'}</button>
                            </div>
                        </div>
                        <Toggle label="Noise suppression" hint="Filters out keyboard clicks, fans and background noise" value={s.noiseSuppression} onChange={(v) => set({ noiseSuppression: v })} />
                        <Toggle label="Echo cancellation" hint="Needed if you don't use headphones" value={s.echoCancellation} onChange={(v) => set({ echoCancellation: v })} />
                        <Toggle label="Automatic gain control" hint="Keeps your volume steady" value={s.autoGainControl} onChange={(v) => set({ autoGainControl: v })} />
                        <div className="vc-field">
                            <label>Input mode</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className={`vc-join ${s.pushToTalk ? '' : 'selected'}`} style={{ flex: 1, background: s.pushToTalk ? 'var(--gh-4e5058)' : undefined }} onClick={() => set({ pushToTalk: false })}>Voice activity</button>
                                <button className="vc-join" style={{ flex: 1, background: s.pushToTalk ? undefined : 'var(--gh-4e5058)' }} onClick={() => set({ pushToTalk: true })}>Push to talk</button>
                            </div>
                            {s.pushToTalk && (
                                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                                    Hold
                                    <button className="vc-keycap" onClick={() => setCapturingKey(true)}>{capturingKey ? 'Press a key…' : keyLabel(s.pttKey)}</button>
                                    to talk (works while this tab is focused)
                                </div>
                            )}
                        </div>
                        <Toggle label="Sounds" hint="Join, leave, mute and deafen sounds" value={s.sounds} onChange={(v) => set({ sounds: v })} />
                    </div>
                )}

                {tab === 'video' && (
                    <div className="vc-modal-body">
                        {select('Camera', s.cameraId, devices.cameras, (v) => set({ cameraId: v }))}
                        <CameraPreview settings={s} cameraTrack={voice.cameraTrack} />
                        <Toggle label="Turn on camera when joining" value={s.joinWithCamera} onChange={(v) => set({ joinWithCamera: v })} />
                    </div>
                )}

                {tab === 'keys' && (
                    <div className="vc-modal-body" style={{ fontSize: 14 }}>
                        {[['Toggle mute', 'Alt + Shift + M'], ['Toggle deafen', 'Alt + Shift + D'], ['Push to talk', s.pushToTalk ? keyLabel(s.pttKey) : 'Off (turn on in Voice)'],
                            ['Change someone\'s volume', 'Right-click them'], ['Focus a video / screen', 'Click it']].map(([a, k]) => (
                            <div key={a} className="vc-toggle"><span>{a}</span><span className="vc-keycap" style={{ cursor: 'default' }}>{k}</span></div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VoiceSettingsModal;
