import React, { useEffect, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';

const box = { background: '#1e1e1e', border: '1px solid #3e3e42', borderRadius: 6, padding: 12, marginBottom: 12 };
const label = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#ccc' };

/** Share a live deployment: copy link, QR code for phones, and public-gallery settings. */
const ShareCard = ({ projectId, deployment, onChange }) => {
    const [copied, setCopied] = useState(false);
    const [qr, setQr] = useState('');
    const [showQr, setShowQr] = useState(false);
    const [description, setDescription] = useState(deployment.gallery?.description || '');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const live = deployment.status === 'live';
    const gallery = deployment.gallery || {};

    useEffect(() => { setDescription(deployment.gallery?.description || ''); }, [deployment.gallery?.description]);

    useEffect(() => {
        if (!showQr) return;
        QRCode.toDataURL(deployment.url, { width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
            .then(setQr)
            .catch(() => setQr(''));
    }, [showQr, deployment.url]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(deployment.url);
        } catch {
            // Clipboard API blocked (insecure context / permissions): fall back to a hidden input
            const input = document.createElement('textarea');
            input.value = deployment.url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const nativeShare = () => navigator.share?.({ title: 'Check out my app', url: deployment.url }).catch(() => {});

    const save = async (patch) => {
        setSaving(true);
        setMessage('');
        try {
            const res = await axios.put(`/api/deployments/${projectId}/gallery`, patch);
            onChange(res.data.deployment);
            if (patch.listed === true) setMessage('✓ Listed in the gallery');
            else if (patch.listed === false) setMessage('Removed from the gallery');
            else setMessage('✓ Saved');
        } catch (err) {
            setMessage(`✕ ${err.response?.data?.message || err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 140 }}>🔗 Share your app</b>
                <span style={{ fontSize: 12, color: '#8b949e' }} title="Views · likes · forks">
                    👁 {deployment.views || 0} · ❤ {deployment.likes || 0} · ⑂ {deployment.forks || 0}
                </span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input
                    readOnly
                    value={deployment.url}
                    onFocus={(e) => e.target.select()}
                    aria-label="Public link"
                    style={{ flex: 1, minWidth: 200, background: '#252526', border: '1px solid #3e3e42', color: '#4fc1ff', padding: '6px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}
                />
                <button className="btn-primary-ide" onClick={copy} disabled={!live}>{copied ? '✓ Copied' : 'Copy link'}</button>
                <button className="btn-secondary-ide" onClick={() => setShowQr(s => !s)} disabled={!live}>{showQr ? 'Hide QR' : 'QR code'}</button>
                {typeof navigator.share === 'function' && <button className="btn-secondary-ide" onClick={nativeShare} disabled={!live}>Share…</button>}
            </div>
            {!live && <div style={{ fontSize: 12, color: '#d29922', marginTop: 6 }}>The app isn't live right now, so the link shows "Nothing is deployed here".</div>}

            {showQr && qr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
                    <img src={qr} alt={`QR code for ${deployment.url}`} width={150} height={150} style={{ borderRadius: 6, background: '#fff', padding: 4 }} />
                    <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
                        Scan with a phone camera to open the app.<br />
                        <a href={qr} download={`${deployment.slug}-qr.png`} style={{ color: '#4fc1ff' }}>Download QR image</a>
                    </div>
                </div>
            )}

            <div style={{ borderTop: '1px solid #333', marginTop: 12, paddingTop: 10 }}>
                <label style={label}>
                    <input type="checkbox" checked={!!gallery.listed} disabled={saving || (!live && !gallery.listed)} onChange={(e) => save({ listed: e.target.checked, description })} />
                    Show in the public <a href="#/gallery" target="_blank" rel="noreferrer" style={{ color: '#4fc1ff' }}>gallery</a>
                </label>
                <label style={{ ...label, marginTop: 6 }}>
                    <input type="checkbox" checked={!!gallery.forkable} disabled={saving} onChange={(e) => save({ forkable: e.target.checked })} />
                    Let others fork (copy) the source code <span style={{ color: '#8b949e', fontSize: 12 }}>· environment variables are never copied</span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                        value={description}
                        maxLength={280}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="One line about your app (shown in the gallery)"
                        style={{ flex: 1, background: '#252526', border: '1px solid #3e3e42', color: '#ddd', padding: '6px 8px', borderRadius: 4, fontSize: 12 }}
                    />
                    <button className="btn-secondary-ide" disabled={saving || description === (gallery.description || '')} onClick={() => save({ description })}>Save</button>
                </div>
                {message && <div style={{ fontSize: 12, marginTop: 6, color: message.startsWith('✕') ? '#f85149' : '#3fb950' }}>{message}</div>}
            </div>
        </div>
    );
};

export default ShareCard;
