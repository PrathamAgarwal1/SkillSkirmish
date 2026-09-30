// voice/SfuTransport.js — calls through the server's mediasoup SFU (CALL_MODE=sfu).
//
// Each participant uploads its streams once and the server forwards them, so calls scale past the
// ~8 people peer-to-peer handles well. Needs a server with open UDP ports (a VPS), not free hosting.
// Same interface as MeshTransport: setTrack / addPeer / removePeer / close + onTrack / onPeerInfo.
import { Device } from 'mediasoup-client';

const request = (socket, event, payload) => new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => (res && res.error ? reject(new Error(res.error)) : resolve(res)));
});

export default class SfuTransport {
    constructor({ socket, channelId, onTrack, onPeerInfo }) {
        this.socket = socket;
        this.channelId = channelId;
        this.onTrack = onTrack;
        this.onPeerInfo = onPeerInfo;
        this.producers = {};        // kind -> producer
        this.consumers = new Map(); // producerId -> { consumer, peerId, kind }
        this.local = {};
        this.closed = false;
        this.onNewProducer = ({ producerId, socketId, appData }) => this.consume(producerId, socketId, appData);
        this.onProducerClosed = ({ producerId }) => {
            const c = this.consumers.get(producerId);
            if (!c) return;
            c.consumer.close();
            this.consumers.delete(producerId);
            this.onTrack(c.peerId, c.kind, null);
        };
    }

    async start() {
        const roomId = this.channelId;
        const { rtpCapabilities } = await request(this.socket, 'ms-joinRoom', { roomId });
        this.device = new Device();
        await this.device.load({ routerRtpCapabilities: rtpCapabilities });

        const makeTransport = async (direction) => {
            const params = await request(this.socket, 'ms-createTransport', { roomId, direction });
            const transport = direction === 'send' ? this.device.createSendTransport(params) : this.device.createRecvTransport(params);
            transport.on('connect', ({ dtlsParameters }, ok, fail) =>
                request(this.socket, 'ms-connectTransport', { roomId, transportId: transport.id, dtlsParameters }).then(() => ok(), fail));
            transport.on('connectionstatechange', (state) => this.onPeerInfo('sfu', { state }));
            return transport;
        };
        this.sendTransport = await makeTransport('send');
        this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, ok, fail) =>
            request(this.socket, 'ms-produce', { roomId, transportId: this.sendTransport.id, kind, rtpParameters, appData })
                .then(({ producerId }) => ok({ id: producerId }), fail));
        this.recvTransport = await makeTransport('recv');

        this.socket.on('ms-newProducer', this.onNewProducer);
        this.socket.on('ms-producerClosed', this.onProducerClosed);
        for (const [kind, track] of Object.entries(this.local)) if (track && track.readyState === 'live') await this.produce(kind, track);
        this.statsTimer = setInterval(() => this.collectStats(), 3000);
        const existing = await request(this.socket, 'ms-getProducers', { roomId });
        for (const p of existing || []) await this.consume(p.producerId, p.socketId, p.appData);
    }

    async consume(producerId, peerId, appData = {}) {
        if (this.closed || !this.recvTransport || this.consumers.has(producerId)) return;
        try {
            const params = await request(this.socket, 'ms-consume', { roomId: this.channelId, producerId, rtpCapabilities: this.device.rtpCapabilities });
            const consumer = await this.recvTransport.consume({ id: params.consumerId, producerId: params.producerId, kind: params.kind, rtpParameters: params.rtpParameters });
            const kind = appData.mediaType || (params.kind === 'audio' ? 'mic' : 'camera');
            this.consumers.set(producerId, { consumer, peerId, kind });
            await request(this.socket, 'ms-resumeConsumer', { roomId: this.channelId, consumerId: consumer.id });
            this.onTrack(peerId, kind, consumer.track);
        } catch (err) {
            console.warn('[voice] consume failed', err);
        }
    }

    async produce(kind, track) {
        const encodings = kind === 'camera'
            ? [{ maxBitrate: 150_000, scaleResolutionDownBy: 4 }, { maxBitrate: 500_000, scaleResolutionDownBy: 2 }, { maxBitrate: 1_200_000 }]
            : undefined;
        this.producers[kind] = await this.sendTransport.produce({
            track, encodings, appData: { mediaType: kind },
            codecOptions: kind === 'mic' ? { opusDtx: true, opusFec: true } : undefined
        });
    }

    async setTrack(kind, track) {
        if (track && track.readyState !== 'live') track = null;
        this.local[kind] = track;
        if (!this.sendTransport) return; // produced in start()
        try {
            const producer = this.producers[kind];
            if (producer) {
                await producer.replaceTrack({ track });
                if (track) producer.resume(); else producer.pause();
            } else if (track) {
                await this.produce(kind, track);
            }
        } catch (err) {
            console.warn('[voice] could not send', kind, err);
        }
    }

    async collectStats() {
        try {
            const stats = await this.sendTransport.getStats();
            stats.forEach((r) => {
                if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime != null) {
                    this.onPeerInfo('sfu', { state: 'connected', rtt: Math.round(r.currentRoundTripTime * 1000) });
                }
            });
        } catch { /* closed */ }
    }

    // The SFU tells us about producers; peers don't need individual connections
    addPeer() {}
    removePeer(peerId) {
        for (const [producerId, c] of this.consumers) {
            if (c.peerId !== peerId) continue;
            c.consumer.close();
            this.consumers.delete(producerId);
            this.onTrack(peerId, c.kind, null);
        }
    }

    close() {
        this.closed = true;
        clearInterval(this.statsTimer);
        this.socket.off('ms-newProducer', this.onNewProducer);
        this.socket.off('ms-producerClosed', this.onProducerClosed);
        this.socket.emit('ms-leaveRoom', { roomId: this.channelId });
        Object.values(this.producers).forEach(p => p.close());
        this.consumers.forEach(({ consumer }) => consumer.close());
        this.sendTransport?.close();
        this.recvTransport?.close();
    }
}
