import { initControls } from './controls.js';

let stream;
let screenStream;
let peerConnections = {};
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};
const videoElement = document.getElementById('videoElement');
const videoPreview = document.getElementById('videoPreview');

export async function initWebRTC() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        videoElement.srcObject = stream;
        document.getElementById('videoGrid1').srcObject = stream;
        
        // Initialize controls with stream
        await initControls(stream);
        
        // Setup WebSocket connection
        setupWebSocketConnection();
        
    } catch (err) {
        console.error('Error initializing WebRTC:', err);
    }
}

function setupWebSocketConnection() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsURL = `${wsProtocol}//${window.location.host}/ws/room/${ROOM_ID}/`;
    const socket = new WebSocket(wsURL);

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        switch(data.type) {
            case 'new-peer':
                await createPeerConnection(data.peerId);
                break;
            case 'offer':
                await handleOffer(data.peerId, data.offer);
                break;
            case 'answer':
                await handleAnswer(data.peerId, data.answer);
                break;
            case 'ice-candidate':
                await handleIceCandidate(data.peerId, data.candidate);
                break;
            case 'peer-disconnected':
                removePeerConnection(data.peerId);
                break;
        }
    };
}

async function createPeerConnection(peerId) {
    try {
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections[peerId] = peerConnection;

        // Add local stream
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignalingMessage({
                    type: 'ice-candidate',
                    peerId: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle incoming streams
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById(`videoGrid${Object.keys(peerConnections).length + 1}`);
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        // Create and send offer if we're the initiator
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignalingMessage({
            type: 'offer',
            peerId: peerId,
            offer: offer
        });

    } catch (err) {
        console.error('Error creating peer connection:', err);
    }
}

async function handleOffer(peerId, offer) {
    try {
        if (!peerConnections[peerId]) {
            await createPeerConnection(peerId);
        }
        const pc = peerConnections[peerId];
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignalingMessage({
            type: 'answer',
            peerId: peerId,
            answer: answer
        });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
}

async function handleAnswer(peerId, answer) {
    try {
        const pc = peerConnections[peerId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

async function handleIceCandidate(peerId, candidate) {
    try {
        const pc = peerConnections[peerId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error handling ICE candidate:', err);
    }
}

function removePeerConnection(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
}

function sendSignalingMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function toggleMic() {
    if (stream && !screenStream) {
        const enabled = stream.getAudioTracks()[0].enabled;
        stream.getAudioTracks()[0].enabled = !enabled;
        document.getElementById('toggleMic').textContent = enabled ? '🎙️ Mic On' : '🎙️ Mic Off';
    }
}

function toggleCamera() {
    if (stream && !screenStream) {
        const enabled = stream.getVideoTracks()[0].enabled;
        stream.getVideoTracks()[0].enabled = !enabled;
        document.getElementById('toggleCamera').textContent = enabled ? '📹 Camera On' : '📹 Camera Off';
    }
}

function toggleScreenShare() {
    if (!screenStream) {
        navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => {
            screenStream = s;
            videoElement.srcObject = screenStream;
            document.getElementById('videoGrid2').srcObject = screenStream;
            document.getElementById('toggleScreenShare').textContent = '🖥️ Stop Sharing';
            screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
        }).catch(err => console.error('Error sharing screen:', err));
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        videoElement.srcObject = stream;
        document.getElementById('videoGrid2').srcObject = null;
        document.getElementById('toggleScreenShare').textContent = '🖥️ Screen Share';
        if (videoPreview.classList.contains('fullscreen')) {
            toggleFullScreen();
        }
    }
}

function toggleFullScreen() {
    videoPreview.classList.toggle('fullscreen');
    document.getElementById('chatPanel').classList.toggle('fullscreen');
    document.getElementById('toggleFullScreen').textContent =
        videoPreview.classList.contains('fullscreen') ? '⛶ Exit Full Screen' : '⛶ Full Screen';
}

function endCall() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        videoElement.srcObject = null;
    }
    stopScreenShare();
}