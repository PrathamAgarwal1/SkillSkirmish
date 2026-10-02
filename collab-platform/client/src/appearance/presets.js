// appearance/presets.js — starting points for the Appearance page. Each preset is a complete set of
// role colours; everything else on the site (≈140 shades) is derived from these by engine.js.

/** The colour roles a user can set directly, in the order the Appearance page shows them. */
export const ROLES = [
    { key: 'bg', label: 'Page background' },
    { key: 'surface', label: 'Cards and panels' },
    { key: 'border', label: 'Borders' },
    { key: 'text', label: 'Text' },
    { key: 'muted', label: 'Secondary text' },
    { key: 'accent', label: 'Main buttons' },
    { key: 'accentInk', label: 'Text on main buttons' },
    { key: 'link', label: 'Links and highlights' },
    { key: 'signal', label: 'Prompt, cursor and # marks' },
    { key: 'highlight', label: 'Second accent (tabs, owner, orange things)' },
    { key: 'success', label: 'Success' },
    { key: 'warning', label: 'Warnings and gold' },
    { key: 'danger', label: 'Errors and delete' }
];

export const PRESETS = {
    classic: {
        name: 'Classic', blurb: 'The original dark terminal look',
        colors: { bg: '#0d1117', surface: '#0d1117', border: '#30363d', text: '#c9d1d9', muted: '#8b949e', accent: '#238636', accentInk: '#ffffff', link: '#58a6ff', signal: '#3fb950', highlight: '#f0883e', success: '#3fb950', warning: '#d29922', danger: '#f85149' },
        fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' }, radius: 12,
        options: { art: 'terminal', nav: 'terminal', cursor: 'blink', grid: 'on', density: 'comfortable' },
        mascot: { kind: 'none', colors: {} },
        prop: { kind: 'mug', colors: { body: '#58a6ff', shade: '#388bfd', accent: '#1f6feb' } }
    },
    cozy: {
        name: 'Cozy', blurb: 'Late-night café: warm, peach and lavender',
        colors: { bg: '#17131a', surface: '#211b25', border: '#3a3040', text: '#e2d6cd', muted: '#a8999f', accent: '#f5a97f', accentInk: '#2b1b14', link: '#c6a0f6', signal: '#f5a97f', highlight: '#f5a97f', success: '#a6da95', warning: '#eed49f', danger: '#ed8796' },
        fonts: { heading: 'Nunito', body: 'Inter', mono: 'JetBrains Mono' }, radius: 18,
        options: { art: 'cozy', nav: 'terminal', cursor: 'blink', grid: 'on', density: 'comfortable' },
        mascot: { kind: 'cat', colors: { body: '#f0a875', shade: '#d98a5a', accent: '#f5c2c7' } },
        prop: { kind: 'mug', colors: { body: '#f5a97f', shade: '#e8956a', accent: '#c2693f' } }
    },
    midnight: {
        name: 'Midnight', blurb: 'Deep navy with electric blue',
        colors: { bg: '#0b1020', surface: '#121a2f', border: '#26304d', text: '#d6def5', muted: '#8a96b8', accent: '#4c7dff', accentInk: '#ffffff', link: '#7aa2ff', signal: '#5ee7f0', highlight: '#b48cff', success: '#5fd3a0', warning: '#f2c66d', danger: '#ff6b81' },
        fonts: { heading: 'Space Grotesk', body: 'Inter', mono: 'JetBrains Mono' }, radius: 14,
        options: { art: 'terminal', nav: 'terminal', cursor: 'blink', grid: 'on', density: 'comfortable' },
        mascot: { kind: 'robot', colors: { body: '#7aa2ff', shade: '#4c7dff', accent: '#5ee7f0' } },
        prop: { kind: 'book', colors: { body: '#4c7dff', shade: '#d6def5', accent: '#5ee7f0' } }
    },
    forest: {
        name: 'Forest', blurb: 'Mossy greens, calm and earthy',
        colors: { bg: '#121611', surface: '#1a2018', border: '#2f3a2c', text: '#dbe3d3', muted: '#97a38f', accent: '#6f9f5c', accentInk: '#0f1a0c', link: '#a3c98a', signal: '#c9b26b', highlight: '#d9a066', success: '#8fcf7a', warning: '#e0c068', danger: '#e07a6a' },
        fonts: { heading: 'Lexend', body: 'Inter', mono: 'IBM Plex Mono' }, radius: 16,
        options: { art: 'cozy', nav: 'plain', cursor: 'still', grid: 'off', density: 'comfortable' },
        mascot: { kind: 'fox', colors: { body: '#d9844a', shade: '#a85f30', accent: '#f4ead9' } },
        prop: { kind: 'plant', colors: { body: '#b0714a', shade: '#8d5636', accent: '#6f9f5c' } }
    },
    synthwave: {
        name: 'Synthwave', blurb: 'Neon pink and cyan on deep purple',
        colors: { bg: '#170c26', surface: '#21123a', border: '#3d2463', text: '#f2e7ff', muted: '#a993c9', accent: '#ff3d9a', accentInk: '#ffffff', link: '#3ee8ff', signal: '#ff3d9a', highlight: '#ffb86b', success: '#5cffb0', warning: '#ffd36b', danger: '#ff5370' },
        fonts: { heading: 'Outfit', body: 'Outfit', mono: 'Space Mono' }, radius: 10,
        options: { art: 'terminal', nav: 'terminal', cursor: 'blink', grid: 'on', density: 'comfortable' },
        mascot: { kind: 'robot', colors: { body: '#ff3d9a', shade: '#b8237a', accent: '#3ee8ff' } },
        prop: { kind: 'tea', colors: { body: '#3ee8ff', shade: '#ff3d9a', accent: '#ffb86b' } }
    },
    latte: {
        name: 'Latte', blurb: 'Light and warm, for daytime',
        colors: { bg: '#f6efe7', surface: '#fffaf4', border: '#e3d6c8', text: '#3b2f2a', muted: '#7d6c63', accent: '#c2693f', accentInk: '#ffffff', link: '#8a5cd1', signal: '#c2693f', highlight: '#d9822b', success: '#3f8f4f', warning: '#a87510', danger: '#c8414f' },
        fonts: { heading: 'Nunito', body: 'Inter', mono: 'JetBrains Mono' }, radius: 18,
        options: { art: 'cozy', nav: 'terminal', cursor: 'blink', grid: 'off', density: 'comfortable' },
        mascot: { kind: 'bunny', colors: { body: '#e9dccf', shade: '#cdb8a5', accent: '#f2b8c6' } },
        prop: { kind: 'mug', colors: { body: '#c2693f', shade: '#a65630', accent: '#f6efe7' } }
    },
    paper: {
        name: 'Paper', blurb: 'Clean light theme, easy on long reads',
        colors: { bg: '#f5f6f8', surface: '#ffffff', border: '#d8dde5', text: '#1f2933', muted: '#5f6b7a', accent: '#2563eb', accentInk: '#ffffff', link: '#2563eb', signal: '#16a34a', highlight: '#ea580c', success: '#15803d', warning: '#a16207', danger: '#dc2626' },
        fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' }, radius: 10,
        options: { art: 'terminal', nav: 'plain', cursor: 'still', grid: 'off', density: 'comfortable' },
        mascot: { kind: 'none', colors: {} },
        prop: { kind: 'plant', colors: { body: '#e2e8f0', shade: '#94a3b8', accent: '#16a34a' } }
    }
};

export const FONT_CHOICES = {
    heading: ['Inter', 'Nunito', 'Poppins', 'Space Grotesk', 'Lexend', 'Quicksand', 'Fredoka', 'IBM Plex Sans', 'Outfit', 'JetBrains Mono'],
    body: ['Inter', 'Nunito', 'Poppins', 'Lexend', 'IBM Plex Sans', 'Outfit', 'Atkinson Hyperlegible', 'Source Sans 3'],
    mono: ['JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Source Code Pro', 'Space Mono', 'Victor Mono', 'Courier Prime']
};

export const OPTION_CHOICES = {
    art: { label: 'Empty-state art', values: { cozy: 'Cat and mug', terminal: 'Little terminal' } },
    nav: { label: 'Navigation style', values: { terminal: 'Terminal (lowercase, ❯)', plain: 'Plain' } },
    cursor: { label: 'Title cursor', values: { blink: 'Blinking', still: 'Still', none: 'Hidden' } },
    grid: { label: 'Grid behind page titles', values: { on: 'On', off: 'Off' } },
    density: { label: 'Spacing', values: { comfortable: 'Comfortable', compact: 'Compact' } }
};

export const MASCOT_KINDS = { cat: 'Cat', fox: 'Fox', dog: 'Dog', bunny: 'Bunny', robot: 'Robot', emoji: 'Any emoji', none: 'None' };
export const PROP_KINDS = { mug: 'Coffee mug', tea: 'Teacup', plant: 'Plant', book: 'Book', emoji: 'Any emoji' };
export const ART_COLOR_LABELS = { body: 'Main colour', shade: 'Shading / stripes', accent: 'Details' };
