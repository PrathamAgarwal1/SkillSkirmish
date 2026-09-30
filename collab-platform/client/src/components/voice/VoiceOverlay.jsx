import React from 'react';
import { useVoice } from '../../voice/voiceContext';
import VoiceDock from './VoiceDock';
import VoiceSettingsModal from './VoiceSettingsModal';
import './voice.css';

/** App-wide voice UI: the "Voice Connected" dock, the settings modal and voice notices. */
const VoiceOverlay = () => {
    const voice = useVoice();
    const message = voice.error || voice.notice;
    return (
        <>
            <VoiceDock />
            {voice.settingsOpen && <VoiceSettingsModal />}
            {message && (
                <div className={`vc-toast ${voice.error ? 'error' : ''}`} role="status">
                    <span>{voice.error ? '⚠ ' : '🎙 '}{message}</span>
                    <button onClick={() => { voice.clearError(); voice.clearNotice(); }} aria-label="Dismiss">✕</button>
                </div>
            )}
        </>
    );
};

export default VoiceOverlay;
