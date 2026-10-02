// appearance/AppearanceContext.jsx — the current look for the whole app: live preview while editing,
// saved to the account (follows you to other devices) and to this browser (applies before first paint).
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { loader } from '@monaco-editor/react';
import AuthContext from '../context/AuthContext';
import { apply, resolve, saveLocal, editorThemeFor, isPlainClassic } from './engine';
import { AppearanceContext, initialAppearance as initial } from './context';

export function AppearanceProvider({ children }) {
    const { user } = useContext(AuthContext);
    const [appearance, setAppearance] = useState(initial); // what's on screen (may be an unsaved preview)
    const [saved, setSaved] = useState(initial);            // what's stored
    const adopted = useRef(null);
    const settings = useMemo(() => resolve(appearance), [appearance]);
    const custom = !isPlainClassic(appearance);

    useEffect(() => {
        const st = apply(appearance);
        loader.init().then((monaco) => {
            monaco.editor.defineTheme('skirmish-custom', editorThemeFor(st));
            if (custom) monaco.editor.setTheme('skirmish-custom');
        }).catch(() => {});
    }, [appearance, custom]);

    // Signed in: the account's saved look wins (once per user)
    useEffect(() => {
        if (!user?._id || adopted.current === user._id) return;
        adopted.current = user._id;
        if (user.appearance) {
            setAppearance(user.appearance);
            setSaved(user.appearance);
            saveLocal(user.appearance);
        }
    }, [user]);

    const preview = useCallback((a) => setAppearance(a), []);
    const revert = useCallback(() => setAppearance(saved), [saved]);
    const save = useCallback(async (a) => {
        let stored = a;
        if (user) stored = (await axios.put('/api/profile/appearance', { appearance: a })).data.appearance;
        setAppearance(stored);
        setSaved(stored);
        saveLocal(stored);
        return stored;
    }, [user]);

    const value = useMemo(() => ({ appearance, saved, settings, custom, preview, revert, save }), [appearance, saved, settings, custom, preview, revert, save]);
    return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
