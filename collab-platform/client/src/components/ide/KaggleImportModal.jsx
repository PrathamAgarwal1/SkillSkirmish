import React, { useState } from 'react';
import { importKaggle } from '../../runtime/kaggle';

const KaggleImportModal = ({ projectId, onDone, onClose }) => {
    const [source, setSource] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const submit = async () => {
        if (!source.trim()) return;
        setBusy(true);
        setMessage('Downloading from Kaggle…');
        try {
            const r = await importKaggle(projectId, source.trim());
            setMessage(`✓ Imported ${r.imported.length} file(s): ${r.imported.join(', ')}${r.skipped.length ? `. Skipped: ${r.skipped.join(', ')}` : ''}`);
            onDone?.(r);
        } catch (err) {
            setMessage(`✕ ${err.response?.data?.message || err.message}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div style={{ width: 'min(560px, 94vw)', background: 'var(--gh-252526)', border: '1px solid var(--gh-3e3e42)', borderRadius: 8, padding: 18, color: 'var(--gh-cccccc)' }}>
                <h3 style={{ margin: '0 0 6px', color: 'var(--gh-ffffff)', fontSize: 15 }}>📥 Import a Kaggle dataset</h3>
                <p style={{ fontSize: 12, color: 'var(--gh-8b949e)', marginTop: 0 }}>
                    Paste a dataset link or <code>owner/dataset</code> (e.g. <code>uciml/iris</code>). CSV/JSON/TXT files go into <code>data/</code>.
                    Competitions (<code>competitions/titanic</code>) need <code>KAGGLE_USERNAME</code> and <code>KAGGLE_KEY</code> in Deploy → Environment.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        autoFocus
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder="https://www.kaggle.com/datasets/owner/name"
                        style={{ flex: 1, background: 'var(--gh-1e1e1e)', color: 'var(--gh-dddddd)', border: '1px solid var(--gh-3e3e42)', borderRadius: 3, padding: '7px 9px', fontFamily: 'monospace', fontSize: 13 }}
                    />
                    <button className="btn-primary-ide" onClick={submit} disabled={busy || !source.trim()}>{busy ? 'Importing…' : 'Import'}</button>
                    <button className="btn-secondary-ide" onClick={onClose}>Close</button>
                </div>
                {message && <div style={{ fontSize: 12, marginTop: 10, color: message.startsWith('✓') ? 'var(--gh-3fb950)' : message.startsWith('✕') ? 'var(--gh-f85149)' : 'var(--gh-d29922)', wordBreak: 'break-word' }}>{message}</div>}
            </div>
        </div>
    );
};

export default KaggleImportModal;
