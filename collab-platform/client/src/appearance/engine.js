// appearance/engine.js — turns appearance settings into the site's look.
//
// A user picks a preset and optionally overrides role colours, single palette shades, fonts, corner
// radius, options, mascot/prop and custom CSS. resolve() merges that with the preset; apply() sets CSS
// variables on <html>, so every stylesheet (which reads variables, see palette.css) follows.
import { PRESETS } from './presets';
import { PALETTE_KEYS } from './paletteKeys';

export const STORAGE_KEY = 'ss-appearance';

/* ── colour helpers ── */
const clamp = (x) => Math.max(0, Math.min(1, x));
export const hexToRgb = (hex) => { const n = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255); };
export const rgbToHex = (rgb) => '#' + rgb.map(x => Math.round(clamp(x) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
function rgbToHsl([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    }
    return [h, s, l];
}
function hslToRgb([h, s, l]) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}
const lightness = (hex) => rgbToHsl(hexToRgb(hex))[2];
/** Moves a colour's lightness by `dl` (keeps hue/saturation). */
const shiftL = (hex, dl) => { const [h, s, l] = rgbToHsl(hexToRgb(hex)); return rgbToHex(hslToRgb([h, s, clamp(l + dl)])); };
export const isLight = (hex) => lightness(hex) > 0.6;
const alpha = (hex, a) => { const [r, g, b] = hexToRgb(hex).map(x => Math.round(x * 255)); return `rgba(${r}, ${g}, ${b}, ${a})`; };

/* ── settings ── */
/** Full settings: the preset's values with the user's overrides on top. */
export function resolve(appearance) {
    const a = appearance || {};
    const preset = PRESETS[a.preset] || PRESETS.classic;
    return {
        preset: PRESETS[a.preset] ? a.preset : 'classic',
        colors: { ...preset.colors, ...(a.colors || {}) },
        palette: { ...(a.palette || {}) },
        fonts: { ...preset.fonts, ...(a.fonts || {}) },
        radius: a.radius ?? preset.radius,
        options: { ...preset.options, ...(a.options || {}) },
        mascot: a.mascot || preset.mascot,
        prop: a.prop || preset.prop,
        customCss: a.customCss || ''
    };
}

/** Untouched classic: the stylesheets' own colours apply and nothing is overridden. */
export const isPlainClassic = (a) => !a || ((a.preset || 'classic') === 'classic' &&
    !Object.keys(a.colors || {}).length && !Object.keys(a.palette || {}).length && !Object.keys(a.fonts || {}).length &&
    a.radius == null && !a.customCss);

/* ── the derived palette: every --gh-<hex> shade from the role colours ── */
const REF = { link: '#58a6ff', success: '#3fb950', danger: '#f85149', warning: '#d29922', highlight: '#f0883e', accent: '#238636' };
const FIXED_ROLE = {
    '238636': 'accent', '1a8f4c': 'accent', '1a8b4b': 'accent', '2ea043': 'accentHover',
    '3fb950': 'success', '56d364': 'success', '23a55a': 'success', '22c55e': 'success', '27c93f': 'success'
};
function roleFor(h) {
    if (h >= 190 && h < 330) return 'link';       // blue, purple
    if (h >= 90 && h < 190) return 'success';     // green, teal
    if (h >= 45 && h < 90) return 'warning';      // yellow, gold
    if (h >= 15 && h < 45) return 'highlight';    // orange
    return 'danger';                              // red, pink
}

export function derivePalette(c) {
    const inset = mix(c.bg, isLight(c.bg) ? '#ffffff' : '#000000', 0.35);
    const surface2 = mix(c.surface, c.border, 0.45);
    const bright = mix(c.text, isLight(c.bg) ? '#000000' : '#ffffff', 0.55);
    const accentHover = shiftL(c.accent, isLight(c.accent) ? -0.06 : 0.06);
    // Classic greys by lightness -> the user's surfaces and text
    const ramp = [
        [0.00, mix(inset, '#000000', isLight(c.bg) ? 0 : 0.3)], [0.03, inset], [0.07, c.bg], [0.11, c.surface],
        [0.15, surface2], [0.21, c.border], [0.43, mix(c.border, c.muted, 0.6)], [0.58, c.muted],
        [0.81, c.text], [0.92, mix(c.text, bright, 0.5)], [1.00, bright]
    ];
    const neutral = (l) => {
        for (let i = 1; i < ramp.length; i++) {
            if (l <= ramp[i][0]) return mix(ramp[i - 1][1], ramp[i][1], (l - ramp[i - 1][0]) / (ramp[i][0] - ramp[i - 1][0] || 1));
        }
        return bright;
    };
    const roles = { ...c, accentHover };
    const out = {};
    for (const key of PALETTE_KEYS) {
        const orig = `#${key}`;
        const [h, s, l] = rgbToHsl(hexToRgb(orig));
        if (FIXED_ROLE[key]) { out[key] = roles[FIXED_ROLE[key]]; continue; }
        if (s < 0.18 || l < 0.16) { out[key] = neutral(l); continue; }
        const role = roleFor(h);
        // Keep the original's shading relative to its family (e.g. dark blue backgrounds stay dark)
        out[key] = shiftL(roles[role], (l - lightness(REF[role])) * 0.8);
    }
    return out;
}

/* ── fonts ── */
const loadedFonts = new Set(['Inter', 'JetBrains Mono']);
function loadFont(name) {
    if (!name || loadedFonts.has(name)) return;
    loadedFonts.add(name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
}

/* ── apply ── */
const APPLIED = new Set(); // CSS variables we set, so they can be cleared again

export function apply(appearance) {
    const root = document.documentElement;
    for (const v of APPLIED) root.style.removeProperty(v);
    APPLIED.clear();
    const set = (name, value) => { root.style.setProperty(name, value); APPLIED.add(name); };

    const st = resolve(appearance);
    root.dataset.theme = st.preset;
    root.dataset.art = st.options.art;
    root.dataset.nav = st.options.nav;
    root.dataset.cursor = st.options.cursor;
    root.dataset.grid = st.options.grid;
    root.dataset.density = st.options.density;
    root.dataset.mode = isLight(st.colors.bg) ? 'light' : 'dark';
    root.dataset.custom = isPlainClassic(appearance) ? '' : 'on';

    let css = document.getElementById('ss-user-css');
    if (!css) { css = document.createElement('style'); css.id = 'ss-user-css'; document.head.appendChild(css); }
    css.textContent = st.customCss; // text only: user CSS never becomes markup

    if (isPlainClassic(appearance)) return st;

    const c = st.colors;
    const pal = { ...derivePalette(c), ...st.palette };
    for (const [k, v] of Object.entries(pal)) set(`--gh-${k}`, v);

    const surface2 = mix(c.surface, c.border, 0.45);
    const bright = mix(c.text, isLight(c.bg) ? '#000000' : '#ffffff', 0.55);
    const inset = mix(c.bg, isLight(c.bg) ? '#ffffff' : '#000000', 0.35);
    const vars = {
        '--bg-deep': c.bg, '--bg-body': c.bg, '--bg-app': c.bg, '--bg-dark': c.surface, '--bg-card': surface2, '--bg-input': inset,
        '--border-subtle': c.border, '--border-active': c.muted, '--text-bright': bright, '--text-main': c.text, '--text-muted': c.muted,
        '--term-blue': c.link, '--term-green': c.success, '--term-gold': c.warning, '--term-red': c.danger, '--term-purple': c.link,
        '--accent-primary': c.signal, '--accent-glow': alpha(c.signal, 0.3),
        '--ui-accent': c.accent, '--ui-accent-hover': shiftL(c.accent, isLight(c.accent) ? -0.06 : 0.06), '--ui-accent-ink': c.accentInk,
        '--ui-accent-glow': alpha(c.accent, 0.35), '--ui-signal': c.signal, '--ui-success': c.success, '--ui-danger': c.danger,
        '--ui-line': surface2, '--ui-chip': surface2, '--ui-btn-bg': mix(c.surface, c.border, 0.35), '--ui-btn-ink': c.text,
        '--ui-btn-hover': c.muted, '--ui-link': c.link, '--ui-tab-active': c.highlight,
        '--ui-grid-line': alpha(c.text, 0.035), '--ui-glow-1': alpha(c.signal, 0.12), '--ui-glow-2': alpha(c.link, 0.09),
        '--ui-card-sheen': alpha(c.text, 0.03),
        '--ui-radius-card': `${st.radius}px`, '--ui-radius-btn': `${Math.round(st.radius * 0.66)}px`,
        '--radius-lg': `${st.radius}px`, '--radius-md': `${Math.round(st.radius * 0.5)}px`, '--radius-sm': `${Math.round(st.radius * 0.33)}px`,
        '--ui-heading-font': `'${st.fonts.heading}', var(--font-sans)`,
        '--font-sans': `'${st.fonts.body}', system-ui, sans-serif`,
        '--font-mono': `'${st.fonts.mono}', ui-monospace, monospace`
    };
    for (const [k, v] of Object.entries(vars)) set(k, v);
    Object.values(st.fonts).forEach(loadFont);
    return st;
}

/* ── code editor theme ── */
export function editorThemeFor(st) {
    const c = st.colors;
    const light = isLight(c.bg);
    const strip = (h) => h.replace('#', '');
    return {
        base: light ? 'vs' : 'vs-dark',
        inherit: true,
        rules: [
            { token: '', foreground: strip(c.text) },
            { token: 'comment', foreground: strip(c.muted), fontStyle: 'italic' },
            { token: 'keyword', foreground: strip(c.link) },
            { token: 'string', foreground: strip(c.success) },
            { token: 'number', foreground: strip(c.highlight) },
            { token: 'constant', foreground: strip(c.highlight) },
            { token: 'type', foreground: strip(c.warning) },
            { token: 'type.identifier', foreground: strip(c.warning) },
            { token: 'tag', foreground: strip(c.danger) },
            { token: 'attribute.name', foreground: strip(c.warning) },
            { token: 'attribute.value', foreground: strip(c.success) },
            { token: 'delimiter', foreground: strip(mix(c.text, c.muted, 0.5)) },
            { token: 'regexp', foreground: strip(c.danger) }
        ],
        colors: {
            'editor.background': c.surface,
            'editor.foreground': c.text,
            'editorLineNumber.foreground': mix(c.muted, c.surface, 0.4),
            'editorLineNumber.activeForeground': c.signal,
            'editor.lineHighlightBackground': mix(c.surface, c.border, 0.25),
            'editor.selectionBackground': mix(c.surface, c.link, 0.3),
            'editor.inactiveSelectionBackground': mix(c.surface, c.link, 0.18),
            'editorCursor.foreground': c.signal,
            'editorWidget.background': mix(c.surface, c.border, 0.2),
            'editorSuggestWidget.background': mix(c.surface, c.border, 0.2),
            'editorSuggestWidget.selectedBackground': mix(c.surface, c.border, 0.6),
            'editorHoverWidget.background': mix(c.surface, c.border, 0.2),
            'editorGutter.background': c.surface,
            'minimap.background': c.surface
        }
    };
}

/* ── storage ── */
export function loadLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
export function saveLocal(appearance) {
    try {
        if (appearance) localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
        else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage blocked */ }
}
