import React, { useEffect, useRef } from 'react';

/** Right-click menu on a participant: their volume (0–200%) and "mute for me". */
const VolumeMenu = ({ x, y, name, volume, onChange, onClose }) => {
    const ref = useRef(null);
    useEffect(() => {
        const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
        const esc = (e) => e.key === 'Escape' && onClose();
        setTimeout(() => window.addEventListener('mousedown', close), 0);
        window.addEventListener('keydown', esc);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
    }, [onClose]);
    const left = Math.min(x, window.innerWidth - 240);
    const top = Math.min(y, window.innerHeight - 150);
    return (
        <div ref={ref} className="vc-menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gh-949ba4)' }}>
                <span>USER VOLUME</span><span>{Math.round(volume * 100)}%</span>
            </div>
            <input type="range" min="0" max="200" step="5" value={Math.round(volume * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} />
            <button onClick={() => onChange(volume === 0 ? 1 : 0)}>{volume === 0 ? '🔊 Unmute for me' : '🔇 Mute for me'}</button>
            <button onClick={() => onChange(1)}>↺ Reset volume</button>
        </div>
    );
};

export default VolumeMenu;
