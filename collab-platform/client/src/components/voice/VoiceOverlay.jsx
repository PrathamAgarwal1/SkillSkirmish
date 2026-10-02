import React from 'react';
import { useVoice } from '../../voice/voiceContext';
import VoiceLauncher from './VoiceLauncher';
import VoiceSettingsModal from './VoiceSettingsModal';
import './voice.css';

/** App-wide voice UI: the draggable voice pill + call window, the settings modal and voice notices. */
const VoiceOverlay = () => {
    const voice = useVoice();
    const message = voice.error || voice.notice;
    return (
        <>
            <VoiceLauncher />
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
