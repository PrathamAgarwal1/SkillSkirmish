// utils/theme.js — which Monaco theme the code editors use (follows the Appearance settings).
import { useAppearance } from '../appearance/context';

/** 'vs-dark' for the untouched classic look, otherwise the theme generated from the user's colours. */
export const useEditorTheme = () => (useAppearance().custom ? 'skirmish-custom' : 'vs-dark');
