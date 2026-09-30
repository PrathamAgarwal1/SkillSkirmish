// voice/MeshTransport.js — peer-to-peer WebRTC calls (every participant connects to every other).
//
// Works on any host (the server only relays small signaling messages), so it's the default and runs
// on free hosting. Uses the "perfect negotiation" pattern so either side can add a camera or screen
// share at any time without offer collisions. Senders are created once per kind and later switched
// with replaceTrack (instant, no renegotiation) when the camera/screen is turned off and on again.

const KINDS = ['mic', 'camera', 'screen', 'screenAudio'];

// Video quality by call size (per outgoing camera stream)
const cameraEncoding = (peerCount) => (peerCount <= 1 ? { maxBitrate: 1_500_000, scaleResolutionDownBy: 1 }
    : peerCount <= 3 ? { maxBitrate: 800_000, scaleResolutionDownBy: 1.5 }
        : peerCount <= 5 ? { maxBitrate: 450_000, scaleResolutionDownBy: 2 }
            : { maxBitrate: 250_000, scaleResolutionDownBy: 3 });
const SCREEN_ENCODING = { maxBitrate: 2_500_000 };

export default class MeshTransport {
    /**
     * @param {object} o
     * @param {import('socket.io-client').Socket} o.socket
     * @param {string} o.selfId              this connection's socket id
     * @param {RTCIceServer[]} o.iceServers
     * @param {(peerId, kind, track|null) => void} o.onTrack   remote media changed
     * @param {(peerId, info) => void} o.onPeerInfo          { state, rtt, relayed }
     */
    constructor({ socket, selfId, iceServers, onTrack, onPeerInfo }) {
        this.socket = socket;
        this.selfId = selfId;
        this.iceServers = iceServers;
        this.onTrack = onTrack;
        this.onPeerInfo = onPeerInfo;
        this.peers = new Map();          // peerId -> peer state
        this.local = {};                 // kind -> track | null
        // One MediaStream id per kind tells the other side what each incoming track is
        this.streams = { mic: new MediaStream(), camera: new MediaStream(), screen: new MediaStream() };
        this.kindByStream = null;
        this.closed = false;
        this.handleSignal = this.handleSignal.bind(this);
        socket.on('voice:signal', this.handleSignal);
        this.statsTimer = setInterval(() => this.collectStats(), 3000);
        if (import.meta.env.DEV) window.__ssMesh = this; // for debugging calls in the dev console
    }

    streamFor(kind) {
        return kind === 'screenAudio' ? this.streams.screen : this.streams[kind];
    }

    send(to, data) {
        this.socket.emit('voice:signal', { to, data });
    }

    /**
     * Connect to someone in the channel. The newcomer is the initiator (it offers to everyone already
     * there); the others create their side lazily when that offer arrives. Only one side offering
     * first avoids offer collisions on join, which can lose ICE candidates.
     */
    addPeer(peerId, { initiator = true } = {}) {
        if (this.closed || this.peers.has(peerId) || peerId === this.selfId) return this.peers.get(peerId);
        const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
        const peer = {
            id: peerId, pc, senders: {}, makingOffer: false, ignoreOffer: false,
            polite: this.selfId < peerId, // deterministic: exactly one side of each pair is polite
            streamKinds: {}, pendingTracks: [], restartTimer: null,
            initiator, tracksAttached: false
        };
        this.peers.set(peerId, peer);

        // Tell the peer which stream carries what before any media arrives (signaling is ordered)
        this.send(peerId, { streams: Object.fromEntries(Object.entries(this.streams).map(([k, s]) => [s.id, k])) });

        pc.onnegotiationneeded = async () => {
            if (!peer.tracksAttached) return; // the answering side waits for the first offer
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                this.send(peerId, { description: pc.localDescription });
            } catch (err) {
                console.warn('[voice] negotiation failed', err);
            } finally {
                peer.makingOffer = false;
            }
        };
        pc.onicecandidate = ({ candidate }) => candidate && this.send(peerId, { candidate });
        pc.ontrack = ({ track, streams }) => this.routeTrack(peer, track, streams[0]);
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            this.onPeerInfo(peerId, { state });
            clearTimeout(peer.restartTimer);
            // Network blip: try an ICE restart (the polite side waits a bit to avoid both restarting)
            if (state === 'failed') pc.restartIce();
            if (state === 'disconnected') peer.restartTimer = setTimeout(() => pc.connectionState === 'disconnected' && pc.restartIce(), 4000);
        };

        if (initiator) this.attachAll(peer);
        // Watchdog: if the connection hasn't come up, restart ICE (new candidates on both sides)
        let attempts = 0;
        const watchdog = () => {
            if (this.closed || this.peers.get(peerId) !== peer || pc.connectionState === 'connected') return;
            if (attempts++ < 3) {
                if (peer.initiator && pc.signalingState === 'stable') pc.restartIce();
                peer.watchdog = setTimeout(watchdog, 10000);
            }
        };
        peer.watchdog = setTimeout(watchdog, 10000);
        return peer;
    }

    attachAll(peer) {
        peer.tracksAttached = true;
        for (const kind of KINDS) if (this.local[kind]) this.attachSender(peer, kind, this.local[kind]);
        this.applyQuality();
    }

    routeTrack(peer, track, stream) {
        const kindOfStream = stream && peer.streamKinds[stream.id];
        if (!kindOfStream) {
            peer.pendingTracks.push({ track, stream }); // stream map not here yet
            return;
        }
        const kind = kindOfStream === 'screen' && track.kind === 'audio' ? 'screenAudio' : kindOfStream;
        this.onTrack(peer.id, kind, track);
        track.addEventListener('ended', () => this.onTrack(peer.id, kind, null));
    }

    attachSender(peer, kind, track) {
        if (!peer.tracksAttached) return; // attached when the first offer arrives
        if (peer.senders[kind]) {
            peer.senders[kind].replaceTrack(track).catch(() => {});
            return;
        }
        if (!track) return;
        peer.senders[kind] = peer.pc.addTrack(track, this.streamFor(kind)); // triggers negotiation
        if (kind === 'screen') this.setEncoding(peer.senders[kind], SCREEN_ENCODING);
    }

    async setEncoding(sender, encoding) {
        try {
            const params = sender.getParameters();
            if (!params.encodings?.length) params.encodings = [{}];
            Object.assign(params.encodings[0], encoding);
            await sender.setParameters(params);
        } catch { /* not negotiated yet: applied again on the next quality update */ }
    }

    applyQuality() {
        const encoding = cameraEncoding(this.peers.size);
        for (const peer of this.peers.values()) {
            if (peer.senders.camera) this.setEncoding(peer.senders.camera, encoding);
        }
    }

    handleSignal({ from, data }) {
        if (this.closed || !data) return;
        const peer = this.peers.get(from) || this.addPeer(from, { initiator: false });
        if (!peer) return;
        // Apply messages strictly in order: an ICE candidate or a new offer must not run while an
        // earlier description is still being applied
        peer.queue = (peer.queue || Promise.resolve()).then(() => this.applySignal(peer, from, data));
    }

    async applySignal(peer, from, data) {
        if (this.closed || this.peers.get(from) !== peer) return;
        const { pc } = peer;
        try {
            if (data.streams) {
                peer.streamKinds = data.streams;
                const pending = peer.pendingTracks;
                peer.pendingTracks = [];
                pending.forEach(({ track, stream }) => this.routeTrack(peer, track, stream));
            } else if (data.description) {
                const { description } = data;
                const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
                peer.ignoreOffer = !peer.polite && collision;
                if (peer.ignoreOffer) return;
                // Answering side: add our tracks now so they ride on the offer's m-lines
                if (description.type === 'offer' && !peer.tracksAttached) this.attachAll(peer);
                await pc.setRemoteDescription(description);
                if (description.type === 'offer') {
                    await pc.setLocalDescription();
                    this.send(from, { description: pc.localDescription });
                }
                this.applyQuality();
            } else if (data.candidate) {
                try {
                    await pc.addIceCandidate(data.candidate);
                } catch (err) {
                    if (!peer.ignoreOffer) throw err;
                }
            }
        } catch (err) {
            console.warn('[voice] signaling error with', from, err);
        }
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        clearTimeout(peer.restartTimer);
        clearTimeout(peer.watchdog);
        peer.pc.close();
        this.peers.delete(peerId);
        for (const kind of KINDS) this.onTrack(peerId, kind, null);
        this.applyQuality();
    }

    /** Sets (or clears with null) one of our outgoing tracks for every peer. */
    setTrack(kind, track) {
        if (track && track.readyState !== 'live') track = null;
        this.local[kind] = track;
        for (const peer of this.peers.values()) this.attachSender(peer, kind, track);
        if (kind === 'camera') this.applyQuality();
    }

    async collectStats() {
        for (const peer of this.peers.values()) {
            try {
                const stats = await peer.pc.getStats();
                let pair = null;
                const byId = new Map();
                stats.forEach(r => {
                    byId.set(r.id, r);
                    if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
                });
                if (!pair) continue;
                const local = byId.get(pair.localCandidateId);
                this.onPeerInfo(peer.id, {
                    state: peer.pc.connectionState,
                    rtt: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
                    relayed: local?.candidateType === 'relay'
                });
            } catch { /* closed */ }
        }
    }

    close() {
        this.closed = true;
        clearInterval(this.statsTimer);
        this.socket.off('voice:signal', this.handleSignal);
        for (const peerId of [...this.peers.keys()]) this.removePeer(peerId);
    }
}
