// runtime/snack.js — opens an Expo project in Expo Snack (snack.expo.dev), Expo's free online
// playground, so it can run on a real phone with the Expo Go app (scan the QR code there).
import axios from 'axios';

// Snack provides these itself, matched to its SDK version
const PROVIDED = new Set(['expo', 'react', 'react-dom', 'react-native', 'react-native-web', '@expo/metro-runtime', '@expo/ngrok']);
const CODE = /\.(js|jsx|ts|tsx|json|md)$/i;

export async function openInSnack(projectId, name) {
    const files = (await axios.get(`/api/execute/snapshot/${projectId}`)).data.files;
    const pkgFile = files.find(f => f.path === 'package.json');
    let pkg = {};
    try { pkg = JSON.parse(pkgFile?.content || '{}'); } catch { /* ignore */ }

    const snackFiles = {};
    for (const f of files) {
        if (!CODE.test(f.path) || ['package.json', 'package-lock.json', 'app.json'].includes(f.path)) continue;
        snackFiles[f.path] = { type: 'CODE', contents: f.content };
    }
    const dependencies = Object.entries(pkg.dependencies || {})
        .filter(([dep]) => !PROVIDED.has(dep))
        // Expo packages: let Snack choose the version that matches its SDK
        .map(([dep, version]) => (/^(expo-|@expo\/)/.test(dep) ? dep : `${dep}@${String(version).replace(/^[~^]/, '')}`))
        .join(',');
    const sdk = String(pkg.dependencies?.expo || '').match(/(\d+)/)?.[1];

    const params = new URLSearchParams({
        name: name || 'SkillSkirmish app',
        platform: 'mydevice',
        files: JSON.stringify(snackFiles),
        hideQueryParams: 'true',
        ...(dependencies ? { dependencies } : {}),
        ...(sdk ? { sdkVersion: `${sdk}.0.0` } : {})
    });
    const url = `https://snack.expo.dev/?${params}`;
    if (url.length > 60000) {
        throw new Error('This project is too large to open in Expo Snack from a link. Download it and use "npx expo start --tunnel" instead.');
    }
    window.open(url, '_blank', 'noopener');
}
