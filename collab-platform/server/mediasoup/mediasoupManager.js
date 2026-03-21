const mediasoup = require('mediasoup');
const config = require('./mediasoupConfig');

/**
 * MediasoupManager — manages mediasoup workers, routers, transports, producers, consumers.
 * One worker is created on startup. One router per room (lazy-created).
 * Each peer (socket) gets a send transport + recv transport per room.
 */
class MediasoupManager {
    constructor() {
        this.worker = null;
        // Map<roomId, { router, peers: Map<socketId, { sendTransport, recvTransport, producers: Map, consumers: Map }> }>
        this.rooms = new Map();
    }

    /**
     * Initialize the mediasoup worker. Call once on server startup.
     */
    async createWorker() {
        this.worker = await mediasoup.createWorker({
            rtcMinPort: config.worker.rtcMinPort,
            rtcMaxPort: config.worker.rtcMaxPort,
            logLevel: config.worker.logLevel,
            logTags: config.worker.logTags,
        });

        console.log('[mediasoup] Worker created (pid: %d)', this.worker.pid);

        this.worker.on('died', (error) => {
            console.error('[mediasoup] Worker died! Restarting in 2s...', error);
            setTimeout(() => this.createWorker(), 2000);
        });

        return this.worker;
    }

    /**
     * Get or create a router for a given room.
     */
    async getOrCreateRouter(roomId) {
        let roomData = this.rooms.get(roomId);
        if (roomData && roomData.router && !roomData.router.closed) {
            return roomData.router;
        }

        if (!this.worker) {
            throw new Error('[mediasoup] Worker not initialized. Call createWorker() first.');
        }

        const router = await this.worker.createRouter({
            mediaCodecs: config.router.mediaCodecs,
        });

        console.log('[mediasoup] Router created for room: %s', roomId);

        if (!roomData) {
            roomData = { router, peers: new Map() };
            this.rooms.set(roomId, roomData);
        } else {
            roomData.router = router;
        }

        return router;
    }

    /**
     * Create a WebRtcTransport for a peer in a room.
     * @param {string} roomId
     * @param {string} socketId
     * @param {'send'|'recv'} direction
     * @returns transport params for the client
     */
    async createWebRtcTransport(roomId, socketId, direction) {
        const router = await this.getOrCreateRouter(roomId);

        const transport = await router.createWebRtcTransport(config.webRtcTransport);

        console.log('[mediasoup] %s transport created for socket %s in room %s (id: %s)',
            direction, socketId, roomId, transport.id);

        // Store transport for this peer
        const roomData = this.rooms.get(roomId);
        if (!roomData.peers.has(socketId)) {
            roomData.peers.set(socketId, {
                sendTransport: null,
                recvTransport: null,
                producers: new Map(),
                consumers: new Map(),
            });
        }

        const peer = roomData.peers.get(socketId);
        if (direction === 'send') {
            peer.sendTransport = transport;
        } else {
            peer.recvTransport = transport;
        }

        // Auto-cleanup on transport close
        transport.on('routerclose', () => {
            console.log('[mediasoup] Transport router closed (transport id: %s)', transport.id);
            transport.close();
        });

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
        };
    }

    /**
     * Connect a transport with DTLS parameters from the client.
     */
    async connectTransport(roomId, socketId, transportId, dtlsParameters) {
        const peer = this._getPeer(roomId, socketId);
        const transport = this._findTransport(peer, transportId);
        await transport.connect({ dtlsParameters });
        console.log('[mediasoup] Transport connected: %s', transportId);
    }

    /**
     * Create a producer on the peer's send transport.
     */
    async produce(roomId, socketId, transportId, kind, rtpParameters, appData = {}) {
        const peer = this._getPeer(roomId, socketId);
        const transport = this._findTransport(peer, transportId);

        const producer = await transport.produce({ kind, rtpParameters, appData });

        peer.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
            console.log('[mediasoup] Producer transport closed (producer id: %s)', producer.id);
            producer.close();
            peer.producers.delete(producer.id);
        });

        console.log('[mediasoup] Producer created: %s (kind: %s, appData: %j)', producer.id, kind, appData);

        return { producerId: producer.id };
    }

    /**
     * Create a consumer on the peer's recv transport for a given producer.
     */
    async consume(roomId, socketId, producerId, rtpCapabilities) {
        const roomData = this.rooms.get(roomId);
        if (!roomData || !roomData.router) {
            throw new Error('Room not found');
        }

        const router = roomData.router;

        // Check if the router can consume with the given capabilities
        if (!router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('Cannot consume — incompatible RTP capabilities');
        }

        const peer = this._getPeer(roomId, socketId);
        if (!peer.recvTransport) {
            throw new Error('Recv transport not found for this peer');
        }

        const consumer = await peer.recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // Start paused — client will resume after attaching to <video>
        });

        peer.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
            console.log('[mediasoup] Consumer transport closed (consumer id: %s)', consumer.id);
            consumer.close();
            peer.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            console.log('[mediasoup] Consumer producer closed (consumer id: %s)', consumer.id);
            consumer.close();
            peer.consumers.delete(consumer.id);
        });

        return {
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
        };
    }

    /**
     * Resume a paused consumer.
     */
    async resumeConsumer(roomId, socketId, consumerId) {
        const peer = this._getPeer(roomId, socketId);
        const consumer = peer.consumers.get(consumerId);
        if (!consumer) throw new Error('Consumer not found');
        await consumer.resume();
        console.log('[mediasoup] Consumer resumed: %s', consumerId);
    }

    /**
     * Close a specific producer (e.g., stop screen share).
     */
    closeProducer(roomId, socketId, producerId) {
        const peer = this._getPeer(roomId, socketId);
        const producer = peer.producers.get(producerId);
        if (producer) {
            producer.close();
            peer.producers.delete(producerId);
            console.log('[mediasoup] Producer closed: %s', producerId);
        }
    }

    /**
     * Get all producer IDs in a room (excluding the requesting socket's own producers).
     */
    getProducersInRoom(roomId, excludeSocketId) {
        const roomData = this.rooms.get(roomId);
        if (!roomData) return [];

        const producers = [];
        for (const [socketId, peer] of roomData.peers) {
            if (socketId === excludeSocketId) continue;
            for (const [producerId, producer] of peer.producers) {
                if (!producer.closed) {
                    producers.push({
                        producerId,
                        socketId,
                        kind: producer.kind,
                        appData: producer.appData,
                    });
                }
            }
        }
        return producers;
    }

    /**
     * Clean up all resources for a peer that is disconnecting from a room.
     */
    cleanupPeer(roomId, socketId) {
        const roomData = this.rooms.get(roomId);
        if (!roomData) return [];

        const peer = roomData.peers.get(socketId);
        if (!peer) return [];

        // Collect producer IDs before closing (to notify other peers)
        const closedProducerIds = [];

        // Close all consumers
        for (const [, consumer] of peer.consumers) {
            consumer.close();
        }

        // Close all producers
        for (const [producerId, producer] of peer.producers) {
            producer.close();
            closedProducerIds.push(producerId);
        }

        // Close transports
        if (peer.sendTransport) peer.sendTransport.close();
        if (peer.recvTransport) peer.recvTransport.close();

        // Remove peer from room
        roomData.peers.delete(socketId);

        // If room is empty, close the router
        if (roomData.peers.size === 0) {
            if (roomData.router && !roomData.router.closed) {
                roomData.router.close();
            }
            this.rooms.delete(roomId);
            console.log('[mediasoup] Room %s cleaned up (no peers left)', roomId);
        }

        console.log('[mediasoup] Peer %s cleaned up from room %s', socketId, roomId);
        return closedProducerIds;
    }

    // --- PRIVATE HELPERS ---

    _getPeer(roomId, socketId) {
        const roomData = this.rooms.get(roomId);
        if (!roomData) throw new Error(`Room ${roomId} not found`);
        const peer = roomData.peers.get(socketId);
        if (!peer) throw new Error(`Peer ${socketId} not found in room ${roomId}`);
        return peer;
    }

    _findTransport(peer, transportId) {
        if (peer.sendTransport && peer.sendTransport.id === transportId) {
            return peer.sendTransport;
        }
        if (peer.recvTransport && peer.recvTransport.id === transportId) {
            return peer.recvTransport;
        }
        throw new Error(`Transport ${transportId} not found`);
    }
}

module.exports = new MediasoupManager();
