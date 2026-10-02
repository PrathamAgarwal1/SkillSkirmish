// appearance/context.js — the appearance context, its hook, and startup helpers (provider: AppearanceContext.jsx).
import { createContext, useContext } from 'react';
import { apply, resolve, loadLocal } from './engine';

export const AppearanceContext = createContext(null);

/** Saved settings; also understands the older ☕ switch, which stored just 'cozy'. */
export function initialAppearance() {
    const saved = loadLocal();
    if (saved) return saved;
    try { if (localStorage.getItem('ss-theme') === 'cozy') return { preset: 'cozy' }; } catch { /* storage blocked */ }
    return null;
}

/** Applies the stored look right away (called from main.jsx before React renders). */
export function applyStoredAppearance() {
    apply(initialAppearance());
}

export const useAppearance = () => useContext(AppearanceContext) ||
    { appearance: null, saved: null, settings: resolve(null), custom: false, preview: () => {}, revert: () => {}, save: async () => null };
