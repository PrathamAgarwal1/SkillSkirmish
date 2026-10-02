// utils/appearance.js — validates a user's look-and-feel settings (client: src/appearance/).
// Everything is optional; anything unknown or malformed is dropped rather than rejected.
const HEX = /^#[0-9a-f]{6}$/i;
const TOKEN = /^[a-z][a-z0-9-]{0,40}$/i;
const PRESETS = ['classic', 'cozy', 'midnight', 'forest', 'synthwave', 'latte', 'paper'];
const FONTS = {
    heading: ['Inter', 'Nunito', 'Poppins', 'Space Grotesk', 'Lexend', 'Quicksand', 'Fredoka', 'IBM Plex Sans', 'Outfit', 'JetBrains Mono'],
    body: ['Inter', 'Nunito', 'Poppins', 'Lexend', 'IBM Plex Sans', 'Outfit', 'Atkinson Hyperlegible', 'Source Sans 3'],
    mono: ['JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Source Code Pro', 'Space Mono', 'Victor Mono', 'Courier Prime']
};
const MASCOTS = ['cat', 'fox', 'dog', 'bunny', 'robot', 'emoji', 'none'];
const PROPS = ['mug', 'tea', 'plant', 'book', 'emoji'];
const CHOICES = {
    art: ['cozy', 'terminal'],
    nav: ['terminal', 'plain'],
    cursor: ['blink', 'still', 'none'],
    grid: ['on', 'off'],
    density: ['comfortable', 'compact']
};
const MAX_CSS = 20000;
const ART_COLORS = ['body', 'shade', 'accent'];

/** A mascot or prop: which drawing, its colours, and the emoji/text when kind is 'emoji'. */
const cleanArt = (input, kinds) => {
    if (!input || typeof input !== 'object' || !kinds.includes(input.kind)) return null;
    const out = { kind: input.kind, colors: {} };
    for (const k of ART_COLORS) if (typeof input.colors?.[k] === 'string' && HEX.test(input.colors[k])) out.colors[k] = input.colors[k].toLowerCase();
    if (input.kind === 'emoji') {
        const e = typeof input.emoji === 'string' ? input.emoji.trim() : '';
        if (!e || [...e].length > 4 || /[<>&"']/.test(e)) return null;
        out.emoji = e;
    }
    return out;
};

const colorMap = (obj, max) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj).slice(0, max)) {
        if (TOKEN.test(k) && typeof v === 'string' && HEX.test(v)) out[k] = v.toLowerCase();
    }
    return out;
};

/** Returns a clean appearance object, or null to reset to the default look. */
function cleanAppearance(input) {
    if (!input || typeof input !== 'object') return null;
    const out = {
        preset: PRESETS.includes(input.preset) ? input.preset : 'classic',
        colors: colorMap(input.colors, 40),
        palette: colorMap(input.palette, 400),
        fonts: {},
        options: {},
        mascot: cleanArt(input.mascot, MASCOTS),
        prop: cleanArt(input.prop, PROPS),
        radius: null,
        customCss: ''
    };
    for (const kind of Object.keys(FONTS)) {
        if (FONTS[kind].includes(input.fonts?.[kind])) out.fonts[kind] = input.fonts[kind];
    }
    for (const [key, allowed] of Object.entries(CHOICES)) {
        if (allowed.includes(input.options?.[key])) out.options[key] = input.options[key];
    }
    const r = Number(input.radius);
    if (Number.isFinite(r)) out.radius = Math.max(0, Math.min(28, Math.round(r)));
    // Custom CSS stays on the user's own screen; it's stored as text and applied with textContent
    if (typeof input.customCss === 'string') out.customCss = input.customCss.slice(0, MAX_CSS);
    return out;
}

module.exports = { cleanAppearance, PRESETS, FONTS, CHOICES, MASCOTS, PROPS, MAX_CSS };
