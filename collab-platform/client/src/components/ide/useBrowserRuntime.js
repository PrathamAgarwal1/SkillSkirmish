import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import * as wc from '../../runtime/webcontainer';
import * as python from '../../runtime/python';
import { openInSnack } from '../../runtime/snack';
import { STLITE_FILE, stliteRequirements } from '../../runtime/publish';
import { importKaggle } from '../../runtime/kaggle';

/**
 * Browser mode: runs the project in the user's own browser instead of a server sandbox.
 * JavaScript → WebContainer (Node.js + npm), Python → Pyodide, Streamlit → stlite, Expo → Snack.
 * Mirrors the server-mode handlers in WindowManager so the toolbar/terminal work the same way.
 */
const PY_PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9_,-]+\])?([<>=!~]=?[A-Za-z0-9.*+!-]+)?$/;
const NPM_PACKAGE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*-]+)?$/i;

export default function useBrowserRuntime({
    enabled, projectId, projectName, runConfig,
    addLog, addTerminalLog, setPreviewUrl, setShowBrowserWindow, setRunPhase, setIsProjectRunning,
    setActiveFileProcessId, refreshFiles, openFile
}) {
    const devProc = useRef(null);        // running dev server / project process (WebContainer)
    const fileProc = useRef(null);       // running file or terminal command: { kind: 'wc'|'py', handle }
    const serverReadyOff = useRef(null);
    const [apiTarget, setApiTarget] = useState(null);
    const [stlite, setStlite] = useState(null);
    const [figures, setFigures] = useState([]);
    const plan = runConfig?.plan;
    const requirements = useMemo(() => plan?.requirements || [], [plan]);

    const supported = wc.isSupported();
    const env = useCallback(async () => (await axios.get(`/api/execute/runtime-env/${projectId}`).catch(() => ({ data: {} }))).data.env || {}, [projectId]);

    const endProject = useCallback((message, type = 'info') => {
        serverReadyOff.current?.();
        serverReadyOff.current = null;
        devProc.current = null;
        setIsProjectRunning(false);
        setRunPhase('stopped');
        setPreviewUrl('');
        setStlite(null);
        if (message) addLog(message, type);
    }, [addLog, setIsProjectRunning, setPreviewUrl, setRunPhase]);

    // Leaving the IDE stops everything this tab started
    useEffect(() => () => {
        serverReadyOff.current?.();
        devProc.current?.kill();
        if (fileProc.current?.kind === 'wc') fileProc.current.handle.kill();
        if (fileProc.current?.kind === 'py') python.stop();
    }, [projectId]);

    const requireSupport = useCallback(() => {
        if (supported) return true;
        addLog(`❌ ${wc.unsupportedReason()}`, 'error');
        return false;
    }, [supported, addLog]);

    /* ── Run a single file (terminal) ───────────────────────── */
    const runPythonFile = useCallback(async (path) => {
        setActiveFileProcessId('py');
        fileProc.current = { kind: 'py' };
        let partial = '';
        const flush = (type) => { if (partial) { addTerminalLog(partial, type); partial = ''; } };
        const offStream = python.on('stream', ({ name, text }) => {
            const lines = (partial + text).split('\n');
            partial = lines.pop();
            lines.forEach(l => addTerminalLog(l, name === 'stderr' ? 'error' : 'info'));
        });
        const offInput = python.on('input', () => flush('info')); // show the prompt before waiting
        const offStatus = python.on('status', (t) => addTerminalLog(`… ${t}`, 'info'));
        try {
            addTerminalLog('🐍 Loading Python in your browser (first run downloads ~10 MB)…', 'info');
            const files = await python.syncFromServer(projectId);
            const code = files.find(f => f.path === path)?.content;
            if (code === undefined) throw new Error(`${path} not found`);
            const { result, files: changed } = await python.run({ code, filename: path, mode: 'script', requirements });
            flush('info');
            if (!result.ok && result.ename !== 'Restarted') {
                addTerminalLog(result.ename === 'KeyboardInterrupt' ? 'Stopped' : (result.traceback || `${result.ename}: ${result.evalue}`), 'error');
            }
            if (result.figures?.length) {
                setFigures(result.figures);
                addTerminalLog(`📊 ${result.figures.length} figure(s) created`, 'success');
            }
            if (changed?.length) {
                await axios.post('/api/execute/upload-files-json', { projectId, files: changed.map(f => ({ filePath: f.path, content: f.content })) });
                addTerminalLog(`💾 Saved ${changed.map(f => f.path).join(', ')}`, 'success');
                refreshFiles();
            }
            addTerminalLog(result.ok ? '✓ Finished' : 'Process exited with an error', result.ok ? 'success' : 'error');
        } catch (err) {
            addTerminalLog(`Error: ${err.message}`, 'error');
        } finally {
            offStream(); offInput(); offStatus();
            fileProc.current = null;
            setActiveFileProcessId(null);
        }
    }, [projectId, requirements, addTerminalLog, setActiveFileProcessId, refreshFiles]);

    const runInWebContainer = useCallback(async (cmd, { cwd = '', keepAsProcess = true } = {}) => {
        await wc.syncFromServer(projectId);
        const handle = await wc.spawn(cmd, { cwd, env: await env(), onLine: (l) => addTerminalLog(l, 'info') });
        if (keepAsProcess) {
            fileProc.current = { kind: 'wc', handle };
            setActiveFileProcessId('wc');
        }
        const code = await handle.exit;
        if (fileProc.current?.handle === handle) {
            fileProc.current = null;
            setActiveFileProcessId(null);
        }
        // Files created/changed by the command (npm init, generators...) go back to the project
        const { uploaded, deleted } = await wc.syncToServer(projectId).catch(() => ({}));
        if (uploaded || deleted) refreshFiles();
        return code;
    }, [projectId, env, addTerminalLog, setActiveFileProcessId, refreshFiles]);

    const runFile = useCallback(async (path) => {
        const ext = path.split('.').pop().toLowerCase();
        if (ext === 'py') return runPythonFile(path);
        if (!requireSupport()) return;
        const cmd = { js: 'node', mjs: 'node', cjs: 'node', ts: 'npx --yes tsx', sh: 'sh' }[ext];
        if (!cmd) return addTerminalLog(`Can't run .${ext} files in the browser`, 'warning');
        const code = await runInWebContainer(`${cmd} '${path.replace(/'/g, `'\\''`)}'`);
        addTerminalLog(`Process exited with code ${code}`, code === 0 ? 'success' : 'error');
    }, [runPythonFile, runInWebContainer, addTerminalLog, requireSupport]);

    /* ── Run the whole project (▶ Run) ──────────────────────── */
    const runProject = useCallback(async (targetId) => {
        const target = (runConfig?.targets || []).find(t => t.id === targetId) || runConfig?.targets?.[0];
        if (!target) return addLog('Nothing to run in this project yet', 'warning');

        if (target.engine === 'snack') {
            try {
                await openInSnack(projectId, projectName);
                addLog('📱 Opened in Expo Snack. Scan the QR code there with the Expo Go app to run it on your phone.', 'success');
            } catch (err) {
                addLog(`❌ ${err.message}`, 'error');
            }
            return;
        }
        if (target.engine === 'notebook') { openFile(target.file); return; }
        if (target.engine === 'api') { setApiTarget(target); return; }
        if (target.engine === 'python') { runPythonFile(target.file); return; }

        if (target.engine === 'streamlit') {
            setIsProjectRunning(true);
            setRunPhase('starting');
            addLog('🎈 Starting Streamlit in your browser (stlite). The first start downloads Python and Streamlit…', 'info');
            const files = (await axios.get(`/api/execute/snapshot/${projectId}`)).data.files;
            const text = Object.fromEntries(files.filter(f => STLITE_FILE.test(f.path)).map(f => [f.path, f.content]));
            setStlite({ entry: target.entry, files: text, requirements: stliteRequirements(text, requirements), nonce: Date.now() });
            setPreviewUrl(`${axios.defaults.baseURL}/runtime/stlite.html?run=${Date.now()}`);
            setShowBrowserWindow(true);
            setRunPhase('running');
            return;
        }

        // WebContainer: install + dev server
        if (!requireSupport()) return;
        if (devProc.current) devProc.current.kill();
        setIsProjectRunning(true);
        setRunPhase('preparing');
        try {
            const vars = await env();
            addLog('⚡ Loading the project into your browser (WebContainer)…', 'info');
            await wc.syncFromServer(projectId);
            setRunPhase('installing');
            await wc.installDependencies(plan?.install, { env: vars, onLine: addLog });
            setRunPhase('starting');
            serverReadyOff.current?.();
            serverReadyOff.current = await wc.onServerReady((port, url) => {
                setPreviewUrl(url);
                setShowBrowserWindow(true);
                setRunPhase('running');
                addLog(`✅ Live at ${url}`, 'success');
            });
            addLog(`🚀 ${target.label}: ${target.cmd}`, 'info');
            const handle = await wc.spawn(target.cmd, { cwd: plan?.root || '', env: vars, onLine: (l) => addLog(l, 'info') });
            devProc.current = handle;
            if (!target.preview) setRunPhase('running');
            const code = await handle.exit;
            if (devProc.current === handle) endProject(`Project process exited with code ${code}`, code === 0 ? 'success' : 'error');
        } catch (err) {
            endProject(`❌ ${err.message}`, 'error');
            setRunPhase('error');
        }
    }, [runConfig, plan, projectId, projectName, requirements, env, addLog, openFile, runPythonFile, endProject, requireSupport,
        setIsProjectRunning, setRunPhase, setPreviewUrl, setShowBrowserWindow]);

    const stopProject = useCallback(() => {
        if (devProc.current) { devProc.current.kill(); devProc.current = null; }
        endProject('Project stopped');
    }, [endProject]);

    /* ── Terminal ───────────────────────────────────────────── */
    const writeInput = useCallback((input) => {
        const p = fileProc.current;
        if (!p) return false;
        if (p.kind === 'py') python.provideInput(input);
        else p.handle.write(`${input}\n`);
        return true;
    }, []);

    const stopFile = useCallback(() => {
        const p = fileProc.current;
        if (!p) return;
        if (p.kind === 'py') python.stop();
        else p.handle.kill();
        addTerminalLog('Process terminated', 'info');
    }, [addTerminalLog]);

    const install = useCallback(async (name) => {
        if (plan?.runtime === 'python') {
            if (!PY_PACKAGE.test(name)) return { success: false, message: 'Invalid package name' };
            const files = (await axios.get(`/api/execute/snapshot/${projectId}`)).data.files;
            const reqs = files.find(f => f.path === 'requirements.txt')?.content || '';
            const base = name.split(/[<>=!~[]/)[0].toLowerCase();
            const has = reqs.split('\n').some(l => l.trim().split(/[<>=!~[\s]/)[0].toLowerCase() === base);
            if (!has) {
                await axios.post('/api/execute/upload-files-json', { projectId, files: [{ filePath: 'requirements.txt', content: `${reqs.replace(/\s*$/, '')}\n${name}\n`.replace(/^\n/, '') }] });
                refreshFiles();
            }
            addLog(`📦 Added ${name} to requirements.txt; it installs automatically on the next run (pure-Python and Pyodide packages only).`, 'success');
            return { success: true };
        }
        if (!NPM_PACKAGE.test(name)) return { success: false, message: 'Invalid package name' };
        if (!requireSupport()) return { success: false, message: wc.unsupportedReason() };
        addLog(`📦 npm install ${name} (in your browser)…`, 'info');
        await wc.syncFromServer(projectId);
        const handle = await wc.spawn(`npm install ${name} --no-audit --no-fund`, { cwd: plan?.root || '', onLine: (l) => addLog(l, 'info') });
        const code = await handle.exit;
        await wc.syncToServer(projectId);
        refreshFiles();
        return code === 0 ? { success: true } : { success: false, message: `npm install failed (exit ${code})` };
    }, [plan, projectId, addLog, refreshFiles, requireSupport]);

    const runCommand = useCallback(async (command, currentDir = '') => {
        const cmd = command.trim();
        addTerminalLog(`$ ${cmd}`, 'command');

        // Python projects: python/pip commands go to Pyodide
        const py = cmd.match(/^python3?\s+(\S+\.py)\s*$/);
        if (py) { await runPythonFile([currentDir, py[1]].filter(Boolean).join('/')); return currentDir; }
        const pip = cmd.match(/^pip3?\s+install\s+(.+)$/);
        if (pip && plan?.runtime === 'python') {
            for (const pkg of pip[1].split(/\s+/).filter(p => !p.startsWith('-'))) {
                const r = await install(pkg);
                if (!r.success) addTerminalLog(r.message, 'error');
            }
            return currentDir;
        }
        // kaggle datasets download [-d] owner/name  |  kaggle competitions download [-c] name
        const kaggle = cmd.match(/^kaggles+(datasets|competitions)s+downloads+(?:-[dc]s+)?(S+)/);
        if (kaggle) {
            try {
                addTerminalLog('📥 Downloading from Kaggle…', 'info');
                const r = await importKaggle(projectId, kaggle[1] === 'competitions' ? `competitions/${kaggle[2]}` : kaggle[2]);
                addTerminalLog(`✓ Imported ${r.imported.join(', ') || 'nothing'}${r.skipped.length ? ` (skipped: ${r.skipped.join(', ')})` : ''}`, 'success');
                refreshFiles();
            } catch (err) {
                addTerminalLog(err.response?.data?.message || err.message, 'error');
            }
            return currentDir;
        }
        if (!supported) { addTerminalLog(wc.unsupportedReason(), 'error'); return currentDir; }

        const cd = cmd.match(/^cd(?:\s+(.*))?$/);
        if (cd) {
            const parts = currentDir ? currentDir.split('/') : [];
            for (const seg of (cd[1] || '').trim().replace(/^["']|["']$/g, '').split('/')) {
                if (!seg || seg === '.') continue;
                if (seg === '..') parts.pop(); else parts.push(seg);
            }
            const next = cd[1] ? parts.join('/') : '';
            await wc.syncFromServer(projectId);
            if (next && !(await wc.pathExists(next))) {
                addTerminalLog(`cd: no such directory: ${cd[1]}`, 'error');
                return currentDir;
            }
            return next;
        }
        if (/^git\b/.test(cmd)) {
            addTerminalLog('git is not available in the in-browser runtime. Use the Explorer\'s import/upload instead.', 'warning');
            return currentDir;
        }
        const code = await runInWebContainer(cmd, { cwd: currentDir });
        if (code !== 0) addTerminalLog(`Command exited with code ${code}`, 'error');
        return currentDir;
    }, [plan, projectId, supported, install, runPythonFile, runInWebContainer, addTerminalLog, refreshFiles]);

    /* ── File events from the editor ────────────────────────── */
    const onFileSaved = useCallback((path, content) => {
        wc.writeProjectFile(projectId, path, content).catch(() => {});
        python.writeProjectFile(projectId, path, content).catch(() => {});
    }, [projectId]);

    const onFileDeleted = useCallback((path) => {
        wc.removeProjectPath(projectId, path).catch(() => {});
    }, [projectId]);

    const sync = useCallback(async () => {
        const r = await wc.syncToServer(projectId);
        refreshFiles();
        return r;
    }, [projectId, refreshFiles]);

    return {
        enabled, supported, runProject, stopProject, runFile, writeInput, stopFile, runCommand, install, sync,
        onFileSaved, onFileDeleted, apiTarget, closeApi: () => setApiTarget(null), stlite, figures, clearFigures: () => setFigures([]),
        requirements
    };
}
