let localStream = null;
let screenStream = null;
let isScreenSharing = false;

document.addEventListener('DOMContentLoaded', () => {
  const toggleCameraBtn = document.getElementById('toggleCamera');
  const toggleMicBtn = document.getElementById('toggleMic');
  const toggleScreenShareBtn = document.getElementById('toggleScreenShare');
  const toggleFullScreenBtn = document.getElementById('toggleFullScreen');
  const endCallBtn = document.getElementById('endCall');
  const localVideo = document.getElementById('localVideo');

  // Initialize media stream
  async function startCameraStream() {
    try {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localVideo.srcObject = localStream;
      isScreenSharing = false;
      toggleScreenShareBtn.classList.remove('off');
      toggleCameraBtn.classList.remove('off');
      toggleMicBtn.classList.remove('off');
    } catch (err) {
      console.error('Error accessing camera/mic:', err);
    }
  }

  // Toggle Camera
  toggleCameraBtn.addEventListener('click', () => {
    if (localStream && !isScreenSharing) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      toggleCameraBtn.classList.toggle('off', !videoTrack.enabled);
    }
  });

  // Toggle Microphone
  toggleMicBtn.addEventListener('click', () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      toggleMicBtn.classList.toggle('off', !audioTrack.enabled);
    }
  });

  // Toggle Screen Share
  toggleScreenShareBtn.addEventListener('click', async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          screenStream = null;
        }
        await startCameraStream();
      } else {
        // Start screen sharing
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false, // Adjust if you need audio
        });
        localVideo.srcObject = screenStream;
        isScreenSharing = true;
        toggleScreenShareBtn.classList.add('off');
        toggleCameraBtn.classList.add('off'); // Disable camera button during screen share
        // Handle screen share ending (e.g., user stops sharing)
        screenStream.getVideoTracks()[0].onended = () => {
          screenStream = null;
          startCameraStream();
        };
      }
    } catch (err) {
      console.error('Error with screen sharing:', err);
      isScreenSharing = false;
      toggleScreenShareBtn.classList.remove('off');
      startCameraStream(); // Revert to camera on error
    }
  });

  // Toggle Fullscreen
  toggleFullScreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
      toggleFullScreenBtn.classList.add('off');
    } else {
      document.exitFullscreen();
      toggleFullScreenBtn.classList.remove('off');
    }
  });

  // End Call
  endCallBtn.addEventListener('click', () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    localVideo.srcObject = null;
    isScreenSharing = false;
    toggleCameraBtn.classList.remove('off');
    toggleMicBtn.classList.remove('off');
    toggleScreenShareBtn.classList.remove('off');
    toggleFullScreenBtn.classList.remove('off');
  });

  // Start media when page loads
  startCameraStream();
});