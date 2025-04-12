let stream;
let screenStream;
let peerConnections = {};
const videoElement = document.getElementById('videoElement');
const videoPreview = document.getElementById('videoPreview');

export function initWebRTC() {
    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(s => {
        stream = s;
        videoElement.srcObject = stream;
        document.getElementById('videoGrid1').srcObject = stream;
    }).catch(err => console.error('Error accessing media devices:', err));

    // Setup controls
    document.getElementById('toggleMic').addEventListener('click', toggleMic);
    document.getElementById('toggleCamera').addEventListener('click', toggleCamera);
    document.getElementById('toggleScreenShare').addEventListener('click', toggleScreenShare);
    document.getElementById('toggleFullScreen').addEventListener('click', toggleFullScreen);
    document.getElementById('endCall').addEventListener('click', endCall);
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

// WebRTC functions for peer connections would go here
// You'll need to implement signaling, ICE candidates, etc.