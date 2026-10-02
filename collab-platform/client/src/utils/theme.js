// utils/theme.js — the site theme (classic / cozy) and matching code-editor themes.
import { useEffect, useState } from 'react';

export const currentTheme = () => document.documentElement.dataset.theme || 'classic';

export function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ss-theme', theme); } catch { /* storage blocked */ }
}

/** The site theme, kept in sync when it changes anywhere (e.g. the nav switch). */
export function useSiteTheme() {
    const [theme, set] = useState(currentTheme);
    useEffect(() => {
        const obs = new MutationObserver(() => set(currentTheme()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);
    return theme;
}

/** Monaco theme name for the current site theme. */
export const useEditorTheme = () => (useSiteTheme() === 'cozy' ? 'skirmish-cozy' : 'vs-dark');

/** Registers the editor themes once (called from main.jsx with the bundled monaco). */
export function defineEditorThemes(monaco) {
    monaco.editor.defineTheme('skirmish-cozy', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: '', foreground: 'e2d6cd' },
            { token: 'comment', foreground: '8a7a86', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'c6a0f6' },
            { token: 'keyword.control', foreground: 'c6a0f6' },
            { token: 'string', foreground: 'a6da95' },
            { token: 'string.escape', foreground: 'f5bde6' },
            { token: 'regexp', foreground: 'f5bde6' },
            { token: 'number', foreground: 'f5a97f' },
            { token: 'constant', foreground: 'f5a97f' },
            { token: 'type', foreground: 'eed49f' },
            { token: 'type.identifier', foreground: 'eed49f' },
            { token: 'identifier', foreground: 'e2d6cd' },
            { token: 'variable', foreground: 'e2d6cd' },
            { token: 'delimiter', foreground: 'b8a9b0' },
            { token: 'operator', foreground: '91d7e3' },
            { token: 'tag', foreground: 'ed8796' },
            { token: 'attribute.name', foreground: 'eed49f' },
            { token: 'attribute.value', foreground: 'a6da95' },
            { token: 'key', foreground: 'c6a0f6' },
            { token: 'string.key.json', foreground: 'c6a0f6' },
            { token: 'string.value.json', foreground: 'a6da95' },
            { token: 'metatag', foreground: 'f5a97f' },
            { token: 'annotation', foreground: 'f5a97f' }
        ],
        colors: {
            'editor.background': '#1d1721',
            'editor.foreground': '#e2d6cd',
            'editorLineNumber.foreground': '#5e5160',
            'editorLineNumber.activeForeground': '#f5a97f',
            'editor.lineHighlightBackground': '#261f2b',
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': '#4a3a55',
            'editor.inactiveSelectionBackground': '#3a2f44',
            'editor.wordHighlightBackground': '#3a304080',
            'editor.findMatchBackground': '#6b4a2f',
            'editor.findMatchHighlightBackground': '#4a3a2a80',
            'editorCursor.foreground': '#f5a97f',
            'editorWhitespace.foreground': '#3a3040',
            'editorIndentGuide.background1': '#2f2735',
            'editorIndentGuide.activeBackground1': '#4f4352',
            'editorBracketMatch.background': '#3a304080',
            'editorBracketMatch.border': '#8a7a86',
            'editorGutter.background': '#1d1721',
            'editorWidget.background': '#261f2b',
            'editorWidget.border': '#3a3040',
            'editorSuggestWidget.background': '#261f2b',
            'editorSuggestWidget.border': '#3a3040',
            'editorSuggestWidget.selectedBackground': '#3a3040',
            'editorHoverWidget.background': '#261f2b',
            'editorHoverWidget.border': '#3a3040',
            'editorError.foreground': '#ed8796',
            'editorWarning.foreground': '#eed49f',
            'scrollbarSlider.background': '#4f435266',
            'scrollbarSlider.hoverBackground': '#4f4352aa',
            'minimap.background': '#1d1721'
        }
    });
}
