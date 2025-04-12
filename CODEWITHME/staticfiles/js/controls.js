let isVideoOn = true;
let isAudioOn = true;
let isScreenSharing = false;
let localStream = null;
let screenStream = null;

export async function initControls(stream, peerConnections) {
    localStream = stream;
    
    // Initialize button states
    document.getElementById('toggleCamera').textContent = '📹';
    document.getElementById('toggleMic').textContent = '🎤';
    document.getElementById('toggleScreenShare').textContent = '🖥️';
    
    // Add event listeners
    setupButtonListeners(peerConnections);
}

function setupButtonListeners(peerConnections) {
    const toggleCamera = document.getElementById('toggleCamera');
    const toggleMic = document.getElementById('toggleMic');
    const toggleScreenShare = document.getElementById('toggleScreenShare');
    
    if (toggleCamera) {
        toggleCamera.addEventListener('click', () => handleCameraToggle(peerConnections));
    }
    
    if (toggleMic) {
        toggleMic.addEventListener('click', () => handleMicToggle(peerConnections));
    }
    
    if (toggleScreenShare) {
        toggleScreenShare.addEventListener('click', () => handleScreenShare(peerConnections));
    }
}

async function handleCameraToggle(peerConnections) {
    const button = document.getElementById('toggleCamera');
    const videoTrack = localStream.getVideoTracks()[0];
    
    if (videoTrack) {
        isVideoOn = !isVideoOn;
        videoTrack.enabled = isVideoOn;
        button.textContent = isVideoOn ? '📹' : '📹';
        console.log('Camera state:', isVideoOn ? 'on' : 'off');
        
        // Update video track for all peer connections
        updateTrackForPeers(peerConnections, 'video', videoTrack);
    }
}

async function handleMicToggle(peerConnections) {
    const button = document.getElementById('toggleMic');
    const audioTrack = localStream.getAudioTracks()[0];
    
    if (audioTrack) {
        isAudioOn = !isAudioOn;
        audioTrack.enabled = isAudioOn;
        button.textContent = isAudioOn ? '🎤On' : '🎤Off';
        console.log('Microphone state:', isAudioOn ? 'on' : 'off');
        
        // Update audio track for all peer connections
        updateTrackForPeers(peerConnections, 'audio', audioTrack);
    }
}

async function handleScreenShare(peerConnections) {
    const button = document.getElementById('toggleScreenShare');
    
    try {
        if (!isScreenSharing) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true,
                audio: true 
            });
            
            // Replace video track with screen share
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnections[Object.keys(peerConnections)[0]]
                ?.getSenders()
                .find(s => s.track?.kind === 'video');
                
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
            
            isScreenSharing = true;
            button.textContent = '🖥️ ';
            
            // Handle screen share stop
            videoTrack.onended = () => {
                stopScreenShare(peerConnections);
            };
        } else {
            stopScreenShare(peerConnections);
        }
    } catch (err) {
        console.error('Error during screen sharing:', err);
        alert('Unable to start screen sharing: ' + err.message);
    }
}

function stopScreenShare(peerConnections) {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        
        // Restore camera video track
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnections[Object.keys(peerConnections)[0]]
            ?.getSenders()
            .find(s => s.track?.kind === 'video');
            
        if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
        }
    }
    
    isScreenSharing = false;
    document.getElementById('toggleScreenShare').textContent = '🖥️';
}

function updateTrackForPeers(peerConnections, trackType, track) {
    // Loop through all peer connections and replace the respective track (video or audio)
    Object.keys(peerConnections).forEach(peerId => {
        const sender = peerConnections[peerId]
            ?.getSenders()
            .find(s => s.track?.kind === trackType);
        
        if (sender) {
            sender.replaceTrack(track);
        }
    });
}
