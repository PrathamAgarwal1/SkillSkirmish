import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import { VoiceContext } from './voiceContext';
import * as audio from './audio';
import { loadSettings, saveSettings, getMic, getCamera, getScreen, describeError } from './media';
import MeshTransport from './MeshTransport';
import SfuTransport from './SfuTransport';

const debug = (...args) => { if (import.meta.env.DEV) (window.__ssVoiceLog = window.__ssVoiceLog || []).push(args.join(' ')); };
const emitAck = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

/**
 * Owns the voice/video call for the whole app (mounted above the router), so you stay in the call
 * while moving between the room, the IDE and other pages — like Discord.
 */
export default function VoiceProvider({ children }) {
    const { user } = useContext(AuthContext);
    const [status, setStatus] = useState('idle');   // idle | connecting | connected | reconnecting
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);     // non-fatal message (e.g. mic blocked)
    const [channel, setChannel] = useState(null);   // { id, name, roomId }
    const [mode, setMode] = useState('mesh');
    const [selfId, setSelfId] = useState(null);
    const [members, setMembers] = useState([]);     // everyone in the channel (incl. you), from the server
    const [remote, setRemote] = useState({});       // peerId -> { camera: MediaStream, screen: MediaStream }
    const [peerInfo, setPeerInfo] = useState({});   // peerId -> { state, rtt, relayed }
    const [speaking, setSpeaking] = useState({});   // peerId | 'self' -> bool
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [micTrack, setMicTrack] = useState(null);
    const [cameraTrack, setCameraTrack] = useState(null);
    const [screenTrack, setScreenTrack] = useState(null);
    const [pttDown, setPttDown] = useState(false);
    const [settings, setSettings] = useState(loadSettings);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const transport = useRef(null);
    const tracks = useRef({ mic: null, camera: null, screen: null, screenAudio: null });
    const channelRef = useRef(null);
    const membersRef = useRef([]);
    const settingsRef = useRef(settings);
    const liveRef = useRef({ muted: false, deafened: false, ptt: false });
    const joining = useRef(false);

    useEffect(() => { settingsRef.current = settings; }, [settings]);
    useEffect(() => { membersRef.current = members; }, [members]);

    const play = useCallback((name) => settingsRef.current.sounds && audio.sounds[name]?.(), []);

    // ── Mic gating: muted / deafened / push-to-talk ─────────
    const micLive = useCallback(() => {
        const { muted: m, deafened: d, ptt } = liveRef.current;
        return !m && !d && (!settingsRef.current.pushToTalk || ptt);
    }, []);

    useEffect(() => {
        liveRef.current = { muted, deafened, ptt: pttDown };
        if (tracks.current.mic) tracks.current.mic.enabled = micLive();
        audio.setDeafened(deafened);
    }, [muted, deafened, pttDown, settings.pushToTalk, micLive]);

    // Tell the channel (and room sidebar) our state
    useEffect(() => {
        if (status !== 'connected') return;
        socket.emit('voice:update', { muted: muted || deafened || !micTrack, deafened, video: !!cameraTrack, screen: !!screenTrack });
    }, [status, muted, deafened, micTrack, cameraTrack, screenTrack]);

    // ── Remote media ────────────────────────────────────────
    const volumeFor = useCallback((peerId) => {
        const member = membersRef.current.find(m => m.socketId === peerId);
        return member ? (settingsRef.current.volumes[member.userId] ?? 1) : 1;
    }, []);

    const onTrack = useCallback((peerId, kind, track) => {
        if (kind === 'mic') {
            if (track) audio.attachRemote(peerId, track, volumeFor(peerId)); else audio.detachRemote(peerId);
        } else if (kind === 'screenAudio') {
            if (track) audio.attachRemote(`${peerId}:screen`, track, volumeFor(peerId)); else audio.detachRemote(`${peerId}:screen`);
        } else {
            setRemote(prev => ({ ...prev, [peerId]: { ...prev[peerId], [kind]: track ? new MediaStream([track]) : null } }));
        }
    }, [volumeFor]);

    const onPeerInfo = useCallback((peerId, info) => setPeerInfo(prev => ({ ...prev, [peerId]: { ...prev[peerId], ...info } })), []);

    useEffect(() => {
        audio.setSpeakingListener((key, on) => {
            setSpeaking(prev => ({ ...prev, [key]: on }));
            if (key === 'self' && channelRef.current) socket.emit('voice:speaking', { speaking: on });
        });
    }, []);

    // ── Connect / disconnect ────────────────────────────────
    const startTransport = useCallback(async (res) => {
        transport.current?.close();
        setRemote({});
        setPeerInfo({});
        const t = res.mode === 'sfu'
            ? new SfuTransport({ socket, channelId: res.channel.id, onTrack, onPeerInfo })
            : new MeshTransport({ socket, selfId: res.selfId, iceServers: res.iceServers, onTrack, onPeerInfo });
        transport.current = t;
        for (const [kind, track] of Object.entries(tracks.current)) if (track) t.setTrack(kind, track);
        if (res.mode === 'sfu') await t.start();
        else res.peers.forEach(p => t.addPeer(p.socketId));
    }, [onTrack, onPeerInfo]);

    const stopTracks = () => {
        for (const kind of Object.keys(tracks.current)) {
            tracks.current[kind]?.stop();
            tracks.current[kind] = null;
        }
        setMicTrack(null);
        setCameraTrack(null);
        setScreenTrack(null);
    };

    const leave = useCallback(({ silent = false } = {}) => {
        if (!channelRef.current) return;
        transport.current?.close();
        transport.current = null;
        socket.emit('voice:leave');
        stopTracks();
        audio.reset();
        channelRef.current = null;
        setChannel(null);
        setMembers([]);
        setRemote({});
        setPeerInfo({});
        setSpeaking({});
        setStatus('idle');
        setPttDown(false);
        if (!silent) play('leave');
    }, [play]);

    /** Join a voice channel. meta.roomName is shown in the voice panel. */
    const join = useCallback(async (roomId, channelId, meta = {}) => {
        if (joining.current || channelRef.current?.id === channelId) return;
        joining.current = true;
        audio.context(); // must start inside the click that joined (browser autoplay rules)
        setError(null);
        setNotice(null);
        try {
            if (channelRef.current) leave({ silent: true });
            setStatus('connecting');

            if (!tracks.current.mic) {
                const { track, error: micError } = await getMic(settingsRef.current);
                if (micError) setNotice(`${micError} You can still listen.`);
                tracks.current.mic = track;
                setMicTrack(track);
                if (track) {
                    track.enabled = micLive();
                    audio.attachLocal(track, micLive);
                }
            }

            const res = await emitAck('voice:join', {
                roomId, channelId,
                state: { muted: liveRef.current.muted || !tracks.current.mic, deafened: liveRef.current.deafened, video: false, screen: false }
            });
            if (!res || res.error) throw new Error(res?.error || 'Could not join the voice channel');

            channelRef.current = { ...res.channel, roomName: meta.roomName || '' };
            setChannel(channelRef.current);
            setMode(res.mode);
            setSelfId(res.selfId);
            await startTransport(res);
            setStatus('connected');
            play('join');
            if (settingsRef.current.joinWithCamera) toggleCameraRef.current?.();
        } catch (err) {
            setError(err.message);
            transport.current?.close();
            transport.current = null;
            if (!channelRef.current) {
                stopTracks();
                audio.reset();
                setStatus('idle');
            }
        } finally {
            joining.current = false;
        }
    }, [leave, micLive, play, startTransport]);

    // Socket events for the channel we're in
    useEffect(() => {
        if (!channel) return undefined;
        const onMembers = ({ channelId, members: list }) => channelId === channel.id && setMembers(list);
        const onJoined = ({ channelId }) => {
            if (channelId !== channel.id) return;
            // Mesh: the newcomer calls us; SFU: the server tells us about their streams
            play('peerJoin');
        };
        const onLeft = ({ channelId, socketId }) => {
            if (channelId !== channel.id) return;
            transport.current?.removePeer(socketId);
            setRemote(prev => { const next = { ...prev }; delete next[socketId]; return next; });
            play('peerLeave');
        };
        const onKicked = ({ channelId, reason }) => {
            if (channelId !== channel.id) return;
            leave();
            setNotice(reason);
        };
        const onDisconnect = () => setStatus('reconnecting');
        // After a reconnect the server has forgotten us (new socket id): join again with the same media
        const onReconnect = async () => {
            const current = channelRef.current;
            if (!current) return;
            const res = await emitAck('voice:join', {
                roomId: current.roomId, channelId: current.id,
                state: { muted: liveRef.current.muted, deafened: liveRef.current.deafened, video: !!tracks.current.camera, screen: !!tracks.current.screen }
            });
            if (!res || res.error) { leave(); setNotice(res?.error || 'Lost the voice connection'); return; }
            setSelfId(res.selfId);
            await startTransport(res);
            setStatus('connected');
        };
        socket.on('voice:members', onMembers);
        socket.on('voice:peer-joined', onJoined);
        socket.on('voice:peer-left', onLeft);
        socket.on('voice:kicked', onKicked);
        socket.on('disconnect', onDisconnect);
        socket.on('connect', onReconnect);
        return () => {
            socket.off('voice:members', onMembers);
            socket.off('voice:peer-joined', onJoined);
            socket.off('voice:peer-left', onLeft);
            socket.off('voice:kicked', onKicked);
            socket.off('disconnect', onDisconnect);
            socket.off('connect', onReconnect);
        };
    }, [channel, leave, play, startTransport]);

    // Logging out ends the call
    useEffect(() => { if (!user) leave({ silent: true }); }, [user, leave]);

    // ── Controls ────────────────────────────────────────────
    const toggleMute = useCallback(() => {
        if (deafened) { // like Discord: unmuting while deafened undeafens too
            setDeafened(false);
            setMuted(false);
            play('undeafen');
            return;
        }
        setMuted(m => { play(m ? 'unmute' : 'mute'); return !m; });
    }, [deafened, play]);

    const toggleDeafen = useCallback(() => {
        setDeafened(d => { play(d ? 'undeafen' : 'deafen'); return !d; });
    }, [play]);

    const cameraOff = useCallback(() => {
        tracks.current.camera?.stop(); // turns the camera light off
        tracks.current.camera = null;
        transport.current?.setTrack('camera', null);
        setCameraTrack(null);
    }, []);

    // Starts the camera; if it drops unexpectedly (unplugged, taken by another app) try to get it back
    const startCamera = useCallback(async (retriesLeft = 2) => {
        try {
            const track = await getCamera(settingsRef.current);
            if (!channelRef.current) { track.stop(); return; }
            tracks.current.camera = track;
            transport.current?.setTrack('camera', track); // replaceTrack: no renegotiation on restarts
            setCameraTrack(track);
            track.addEventListener('ended', () => {
                if (tracks.current.camera !== track) return; // we stopped it ourselves
                debug('camera track ended unexpectedly, retries left', retriesLeft);
                if (retriesLeft > 0) startCamera(retriesLeft - 1);
                else { cameraOff(); setNotice('Your camera disconnected.'); }
            });
        } catch (err) {
            cameraOff();
            setNotice(describeError(err, 'camera'));
        }
    }, [cameraOff]);

    const toggleCamera = useCallback(() => (tracks.current.camera ? cameraOff() : startCamera()), [cameraOff, startCamera]);
    const toggleCameraRef = useRef(toggleCamera);
    toggleCameraRef.current = toggleCamera;

    const stopScreen = useCallback(() => {
        for (const kind of ['screen', 'screenAudio']) {
            tracks.current[kind]?.stop();
            tracks.current[kind] = null;
            transport.current?.setTrack(kind, null);
        }
        setScreenTrack(null);
    }, []);

    const toggleScreen = useCallback(async () => {
        if (tracks.current.screen) return stopScreen();
        try {
            const { video, audio: screenAudio } = await getScreen();
            if (!channelRef.current) { video.stop(); screenAudio?.stop(); return; }
            tracks.current.screen = video;
            tracks.current.screenAudio = screenAudio;
            transport.current?.setTrack('screen', video);
            if (screenAudio) transport.current?.setTrack('screenAudio', screenAudio);
            setScreenTrack(video);
            play('screen');
            video.addEventListener('ended', () => { if (tracks.current.screen === video) stopScreen(); }); // browser's "Stop sharing"
        } catch (err) {
            if (err.name !== 'NotAllowedError') setNotice(describeError(err, 'screen'));
        }
    }, [play, stopScreen]);

    const setUserVolume = useCallback((userId, volume) => {
        setSettings(prev => {
            const next = { ...prev, volumes: { ...prev.volumes, [userId]: volume } };
            saveSettings(next);
            return next;
        });
        membersRef.current.filter(m => m.userId === userId).forEach(m => audio.setVolume(m.socketId, volume));
    }, []);

    const updateSettings = useCallback(async (patch) => {
        const prev = settingsRef.current;
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        setSettings(next);
        saveSettings(next);
        if (!channelRef.current) return;
        const micChanged = ['micId', 'noiseSuppression', 'echoCancellation', 'autoGainControl'].some(k => k in patch && patch[k] !== prev[k]);
        if (micChanged) {
            const { track } = await getMic(next);
            if (track) {
                tracks.current.mic?.stop();
                tracks.current.mic = track;
                track.enabled = micLive();
                transport.current?.setTrack('mic', track);
                audio.attachLocal(track, micLive);
                setMicTrack(track);
            }
        }
        if ('cameraId' in patch && patch.cameraId !== prev.cameraId && tracks.current.camera) {
            const track = await getCamera(next).catch(() => null);
            if (track) {
                tracks.current.camera.stop();
                tracks.current.camera = track;
                transport.current?.setTrack('camera', track);
                setCameraTrack(track);
            }
        }
        if ('speakerId' in patch) await audio.setOutputDevice(patch.speakerId);
    }, [micLive]);

    useEffect(() => { if (settings.speakerId) audio.setOutputDevice(settings.speakerId); }, [settings.speakerId]);

    // ── Keyboard: push-to-talk + shortcuts ──────────────────
    useEffect(() => {
        if (!channel) return undefined;
        const down = (e) => {
            if (settingsRef.current.pushToTalk && e.code === settingsRef.current.pttKey && !e.repeat) setPttDown(true);
            if (e.altKey && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
            if (e.altKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); toggleDeafen(); }
        };
        const up = (e) => { if (e.code === settingsRef.current.pttKey) setPttDown(false); };
        const blur = () => setPttDown(false);
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, [channel, toggleMute, toggleDeafen]);

    // Closing the tab leaves cleanly
    useEffect(() => {
        const bye = () => channelRef.current && socket.emit('voice:leave');
        window.addEventListener('pagehide', bye);
        return () => window.removeEventListener('pagehide', bye);
    }, []);

    const ping = useMemo(() => {
        const rtts = Object.values(peerInfo).map(p => p.rtt).filter(v => v != null);
        return rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null;
    }, [peerInfo]);

    const value = useMemo(() => ({
        status, error, notice, clearNotice: () => setNotice(null), clearError: () => setError(null),
        channel, mode, selfId, members, remote, peerInfo, speaking, ping,
        muted: muted || !micTrack, deafened, hasMic: !!micTrack, pushToTalk: settings.pushToTalk, pttDown,
        cameraTrack, screenTrack, settings, micTrack,
        settingsOpen, openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false),
        join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, setUserVolume, updateSettings
    }), [status, error, notice, channel, mode, selfId, members, remote, peerInfo, speaking, ping, muted, micTrack, deafened,
        settings, settingsOpen, pttDown, cameraTrack, screenTrack, join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, setUserVolume, updateSettings]);

    return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
