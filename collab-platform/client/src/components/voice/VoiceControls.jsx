import React from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaHeadphones, FaVideo, FaVideoSlash, FaCog } from 'react-icons/fa';
import { MdHeadsetOff, MdScreenShare, MdStopScreenShare, MdCallEnd } from 'react-icons/md';
import { useVoice } from '../../voice/voiceContext';
import { keyLabel } from '../../voice/media';

/** Mic · deafen · camera · screen · settings · disconnect */
const VoiceControls = () => {
    const v = useVoice();
    const micTip = !v.hasMic ? 'No microphone' : v.pushToTalk ? `Push to talk: hold ${keyLabel(v.settings.pttKey)}` : v.muted ? 'Unmute (Alt+Shift+M)' : 'Mute (Alt+Shift+M)';
    return (
        <div className="vc-controls">
            <button className={`vc-btn ${v.muted ? 'off' : ''}`} onClick={v.toggleMute} disabled={!v.hasMic} data-tip={micTip}
                style={v.pushToTalk && v.pttDown && !v.muted ? { boxShadow: '0 0 0 3px var(--vc-green)' } : undefined}>
                {v.muted ? <FaMicrophoneSlash size={18} /> : <FaMicrophone size={18} />}
            </button>
            <button className={`vc-btn ${v.deafened ? 'off' : ''}`} onClick={v.toggleDeafen} data-tip={v.deafened ? 'Undeafen (Alt+Shift+D)' : 'Deafen (Alt+Shift+D)'}>
                {v.deafened ? <MdHeadsetOff size={20} /> : <FaHeadphones size={18} />}
            </button>
            <button className={`vc-btn ${v.cameraTrack ? 'on' : ''}`} onClick={v.toggleCamera} data-tip={v.cameraTrack ? 'Turn off camera' : 'Turn on camera'}>
                {v.cameraTrack ? <FaVideo size={18} /> : <FaVideoSlash size={18} />}
            </button>
            <button className={`vc-btn ${v.screenTrack ? 'on' : ''}`} onClick={v.toggleScreen} data-tip={v.screenTrack ? 'Stop sharing' : 'Share your screen'}>
                {v.screenTrack ? <MdStopScreenShare size={20} /> : <MdScreenShare size={20} />}
            </button>
            <button className="vc-btn" onClick={v.openSettings} data-tip="Voice & video settings">
                <FaCog size={17} />
            </button>
            <button className="vc-btn danger" onClick={() => v.leave()} data-tip="Disconnect">
                <MdCallEnd size={22} />
            </button>
        </div>
    );
};

export default VoiceControls;
