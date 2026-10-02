// pages/AppearancePage.jsx — make the site yours: presets, colours, mascot and prop, fonts, shape,
// details, every single palette shade, and your own CSS. Changes preview live and save automatically.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { useAppearance } from '../appearance/context';
import { PRESETS, ROLES, FONT_CHOICES, OPTION_CHOICES, MASCOT_KINDS, PROP_KINDS, ART_COLOR_LABELS } from '../appearance/presets';
import { derivePalette } from '../appearance/engine';
import { PALETTE_KEYS } from '../appearance/paletteKeys';
import { Mascot, Prop } from '../appearance/art';
import PageTitle from '../components/layout/PageTitle';
import './Appearance.css';

const MAX_CSS = 20000;
const HEX = /^#[0-9a-f]{6}$/i;

/** Colour picker + hex field. */
function ColorField({ label, value, onChange, onReset, changed }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    return (
        <div className="ap-color">
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
            <div className="ap-color-main">
                <span>{label}</span>
                <input className="ap-hex" value={text} spellCheck="false" aria-label={`${label} hex`}
                    onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
            </div>
            {changed && <button type="button" className="ui-link ui-small" onClick={onReset}>Reset</button>}
        </div>
    );
}

function Segmented({ value, values, onChange, label }) {
    return (
        <div className="ap-seg" role="radiogroup" aria-label={label}>
            {Object.entries(values).map(([k, text]) => (
                <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{text}</button>
            ))}
        </div>
    );
}

export default function AppearancePage() {
    const { appearance, settings, preview, save } = useAppearance();
    const opened = useRef(appearance);
    const [status, setStatus] = useState('');
    const [paletteFilter, setPaletteFilter] = useState('');
    const [importText, setImportText] = useState('');
    const saveTimer = useRef(null);
    const draft = appearance || { preset: 'classic' };

    // Every change previews at once and is saved shortly after
    const change = (next) => {
        preview(next);
        setStatus('Saving…');
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            save(next).then(() => setStatus('Saved')).catch(() => setStatus("Couldn't save to your account (kept on this device)"));
        }, 700);
    };
    useEffect(() => () => clearTimeout(saveTimer.current), []);

    const set = (key, value) => change({ ...draft, [key]: value });
    const setIn = (key, sub, value) => {
        const obj = { ...(draft[key] || {}) };
        if (value === undefined) delete obj[sub]; else obj[sub] = value;
        change({ ...draft, [key]: obj });
    };
    const pickPreset = (id) => change({ preset: id, customCss: draft.customCss || '' });

    const derived = useMemo(() => ({ ...derivePalette(settings.colors), ...settings.palette }), [settings]);
    const keys = PALETTE_KEYS.filter(k => !paletteFilter || k.includes(paletteFilter.replace('#', '').toLowerCase()) || (derived[k] || '').includes(paletteFilter.toLowerCase()));

    const setArt = (which, patch) => change({ ...draft, [which]: { ...settings[which], colors: { ...(settings[which]?.colors || {}) }, ...patch } });
    const setArtColor = (which, k, v) => change({ ...draft, [which]: { ...settings[which], colors: { ...(settings[which]?.colors || {}), [k]: v } } });

    const exportJson = () => {
        const json = JSON.stringify(draft, null, 2);
        navigator.clipboard.writeText(json).then(() => toast.success('Theme copied. Paste it to a friend!')).catch(() => setImportText(json));
    };
    const importJson = () => {
        try {
            const data = JSON.parse(importText);
            if (!data || typeof data !== 'object') throw new Error();
            change(data);
            setImportText('');
            toast.success('Theme imported');
        } catch {
            toast.error("That doesn't look like a theme. Paste the text from Export.");
        }
    };

    return (
        <div className="ui-page ap-page">
            <PageTitle path="~/appearance" title="Make it yours" sub="Every change shows up instantly everywhere on the site, and is saved automatically.">
                <div className="ap-actions">
                    <span className="ui-muted ui-small" role="status">{status}</span>
                    <button className="ui-btn ghost" onClick={() => change(opened.current || { preset: 'classic' })}>Undo my changes</button>
                    <button className="ui-btn ghost" onClick={() => { if (window.confirm('Go back to the default look? Your custom CSS will be removed too.')) change(null); }}>Reset to default</button>
                </div>
            </PageTitle>

            <section className="ui-card ap-section">
                <div className="ui-card-head"><h2>Start from a theme</h2></div>
                <div className="ap-presets">
                    {Object.entries(PRESETS).map(([id, p]) => (
                        <button key={id} type="button" className={`ap-preset${settings.preset === id ? ' on' : ''}`} onClick={() => pickPreset(id)} aria-pressed={settings.preset === id}
                            style={{ background: p.colors.surface, color: p.colors.text, borderColor: settings.preset === id ? p.colors.signal : p.colors.border }}>
                            <span className="ap-swatches">
                                {['bg', 'accent', 'link', 'signal', 'success', 'danger'].map(k => <i key={k} style={{ background: p.colors[k] }} />)}
                            </span>
                            <b style={{ fontFamily: `'${p.fonts.heading}', sans-serif` }}>{p.name}</b>
                            <small style={{ color: p.colors.muted }}>{p.blurb}</small>
                        </button>
                    ))}
                </div>
            </section>

            <div className="ap-grid">
                <section className="ui-card ap-section">
                    <div className="ui-card-head"><h2>Colours</h2></div>
                    <p>Set the main colours and the rest of the site's shades follow automatically.</p>
                    <div className="ap-colors">
                        {ROLES.map(r => (
                            <ColorField key={r.key} label={r.label} value={settings.colors[r.key]} changed={draft.colors?.[r.key] !== undefined}
                                onChange={(v) => setIn('colors', r.key, v)} onReset={() => setIn('colors', r.key, undefined)} />
                        ))}
                    </div>
                </section>

                <section className="ui-card ap-section">
                    <div className="ui-card-head"><h2>Mascot</h2></div>
                    <div className="ap-art-stage"><Mascot mascot={settings.mascot?.kind === 'none' ? null : settings.mascot} z={settings.colors.link} width={144} height={96} />{settings.mascot?.kind === 'none' && <span className="ui-muted">No mascot</span>}</div>
                    <div className="ap-chips">
                        {Object.entries(MASCOT_KINDS).map(([k, name]) => (
                            <button key={k} type="button" className={settings.mascot?.kind === k ? 'on' : ''} onClick={() => setArt('mascot', { kind: k, emoji: k === 'emoji' ? (settings.mascot?.emoji || '🐱') : undefined })}>{name}</button>
                        ))}
                    </div>
                    {settings.mascot?.kind === 'emoji' && (
                        <label className="ui-field"><span>Emoji</span><input className="ui-input" maxLength={4} value={settings.mascot.emoji || ''} onChange={(e) => setArt('mascot', { emoji: e.target.value })} placeholder="🦊" /></label>
                    )}
                    {settings.mascot && !['none', 'emoji'].includes(settings.mascot.kind) && (
                        <div className="ap-colors">
                            {Object.entries(ART_COLOR_LABELS).map(([k, label]) => (
                                <ColorField key={k} label={label} value={settings.mascot.colors?.[k] || '#888888'} onChange={(v) => setArtColor('mascot', k, v)} />
                            ))}
                        </div>
                    )}

                    <div className="ui-card-head" style={{ marginTop: 18 }}><h2>Prop</h2></div>
                    <p>Shows up on loading screens and in empty lists.</p>
                    <div className="ap-art-stage"><Prop prop={settings.prop} size={88} /></div>
                    <div className="ap-chips">
                        {Object.entries(PROP_KINDS).map(([k, name]) => (
                            <button key={k} type="button" className={settings.prop?.kind === k ? 'on' : ''} onClick={() => setArt('prop', { kind: k, emoji: k === 'emoji' ? (settings.prop?.emoji || '🍵') : undefined })}>{name}</button>
                        ))}
                    </div>
                    {settings.prop?.kind === 'emoji' && (
                        <label className="ui-field"><span>Emoji</span><input className="ui-input" maxLength={4} value={settings.prop.emoji || ''} onChange={(e) => setArt('prop', { emoji: e.target.value })} placeholder="🍵" /></label>
                    )}
                    {settings.prop && settings.prop.kind !== 'emoji' && (
                        <div className="ap-colors">
                            {Object.entries(ART_COLOR_LABELS).map(([k, label]) => (
                                <ColorField key={k} label={label} value={settings.prop.colors?.[k] || '#888888'} onChange={(v) => setArtColor('prop', k, v)} />
                            ))}
                        </div>
                    )}
                </section>

                <section className="ui-card ap-section">
                    <div className="ui-card-head"><h2>Text and shape</h2></div>
                    {Object.entries({ heading: 'Headings', body: 'Body text', mono: 'Code and numbers' }).map(([k, label]) => (
                        <label key={k} className="ui-field">
                            <span>{label}</span>
                            <select className="ui-select" value={settings.fonts[k]} onChange={(e) => setIn('fonts', k, e.target.value)} style={{ fontFamily: `'${settings.fonts[k]}', sans-serif` }}>
                                {FONT_CHOICES[k].map(f => <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
                            </select>
                        </label>
                    ))}
                    <label className="ui-field">
                        <span>Roundness: {settings.radius}px</span>
                        <input type="range" min="0" max="28" step="1" value={settings.radius} onChange={(e) => set('radius', Number(e.target.value))} aria-label="Corner roundness" />
                    </label>
                    <div className="ap-sample" style={{ borderRadius: settings.radius }}>
                        <div style={{ fontFamily: 'var(--ui-heading-font)', fontWeight: 800, fontSize: 18, color: 'var(--text-bright)' }}>The quick brown fox</div>
                        <div>jumps over the lazy dog, then ships to prod.</div>
                        <code>const answer = 42;</code>
                    </div>
                </section>

                <section className="ui-card ap-section">
                    <div className="ui-card-head"><h2>Details</h2></div>
                    {Object.entries(OPTION_CHOICES).map(([k, o]) => (
                        <div key={k} className="ap-option">
                            <span>{o.label}</span>
                            <Segmented label={o.label} value={settings.options[k]} values={o.values} onChange={(v) => setIn('options', k, v)} />
                        </div>
                    ))}
                </section>
            </div>

            <section className="ui-card ap-section">
                <details>
                    <summary><h2 className="ap-summary">Every colour ({PALETTE_KEYS.length})</h2></summary>
                    <p>Fine-tune any single shade the site uses. Each one is named after its original colour; the swatch shows what it is now.</p>
                    <input className="ui-input" value={paletteFilter} onChange={(e) => setPaletteFilter(e.target.value)} placeholder="Filter, e.g. 30363d or a colour you see" style={{ maxWidth: 320, marginBottom: 12 }} />
                    <div className="ap-palette">
                        {keys.map(k => (
                            <div key={k} className={`ap-pal${draft.palette?.[k] ? ' changed' : ''}`}>
                                <input type="color" value={derived[k] || `#${k}`} onChange={(e) => setIn('palette', k, e.target.value)} aria-label={`Colour ${k}`} />
                                <code title="Original colour">#{k}</code>
                                {draft.palette?.[k] && <button type="button" className="ui-link ui-small" onClick={() => setIn('palette', k, undefined)}>×</button>}
                            </div>
                        ))}
                    </div>
                </details>
            </section>

            <section className="ui-card ap-section">
                <div className="ui-card-head"><h2>Your own CSS</h2><span className="ui-muted ui-small">{(draft.customCss || '').length}/{MAX_CSS}</span></div>
                <p>Change literally anything. This CSS only applies on your screen, never for other people. Try <code>.nav-item {'{'} letter-spacing: 2px; {'}'}</code> or <code>.ui-card {'{'} border-width: 2px; {'}'}</code>. The site's colours are variables like <code>var(--ui-link)</code> and <code>var(--gh-58a6ff)</code>.</p>
                <textarea className="ui-textarea ap-css" rows={10} maxLength={MAX_CSS} spellCheck="false" value={draft.customCss || ''} onChange={(e) => set('customCss', e.target.value)}
                    placeholder={'/* your CSS here */\n.ui-head h1 {\n  text-shadow: 0 0 12px var(--ui-signal);\n}'} />
            </section>

            <section className="ui-card ap-section">
                <div className="ui-card-head"><h2>Share your theme</h2></div>
                <p>Export copies your whole look as text. Anyone can paste it here to use it.</p>
                <div className="ui-inline" style={{ marginBottom: 10 }}>
                    <button className="ui-btn" onClick={exportJson}>Export (copy)</button>
                </div>
                <textarea className="ui-textarea ap-css" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a theme here…" spellCheck="false" />
                <div style={{ marginTop: 8 }}><button className="ui-btn" disabled={!importText.trim()} onClick={importJson}>Import</button></div>
            </section>

            <p className="ui-muted ui-small" style={{ marginTop: 18 }}>Tip: the ☕ / 🌙 button in the top bar switches between Cozy and Classic. <Link to="/dashboard" className="ui-link">Back to home</Link></p>
        </div>
    );
}
