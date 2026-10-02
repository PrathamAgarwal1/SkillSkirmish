import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import FileExplorerWindow from './FileExplorerWindow';
import CodeEditorWindow from './CodeEditorWindow';
import ConsoleWindow from './ConsoleWindow';
import TerminalWindow from './TerminalWindow';
import BrowserPreviewWindow from './BrowserPreviewWindow';
import PackageLibraryWindow from './PackageLibraryWindow';
import DeployPanel from './DeployPanel';
import NotebookWindow from './NotebookWindow';
import ApiTesterWindow from './ApiTesterWindow';
import useBrowserRuntime from './useBrowserRuntime';
import KaggleImportModal from './KaggleImportModal';
import { socket } from '../../socket'; // Import the global socket instance
import './IDEStyles.css';

const RUNNABLE_EXTS = ['js', 'mjs', 'cjs', 'ts', 'py', 'sh'];

const WindowManager = ({ projectId, projectType = 'React App', projectName, roomId, user }) => {
    const [currentFile, setCurrentFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [files, setFiles] = useState([]);
    const [isDirty, setIsDirty] = useState(false);

    // Console (Project Run) Logs
    const [consoleLogs, setConsoleLogs] = useState([]);
    const [isProjectRunning, setIsProjectRunning] = useState(false);

    // Terminal (File Run) Logs
    const [terminalLogs, setTerminalLogs] = useState([{ message: 'Terminal ready', type: 'info' }]);
    const [activeFileProcessId, setActiveFileProcessId] = useState(null);

    const [previewUrl, setPreviewUrl] = useState('');
    const [installedPackages, setInstalledPackages] = useState([]);
    const [showPackageModal, setShowPackageModal] = useState(false);
    const [showBrowserWindow, setShowBrowserWindow] = useState(false);

    // Collapsible panel state
    const [panelCollapsed, setPanelCollapsed] = useState({
        explorer: false,
        console: false,
        terminal: false
    });
    const togglePanel = (panel) => setPanelCollapsed(prev => ({ ...prev, [panel]: !prev[panel] }));

    // Collaborative editing presence
    const [collabPresence, setCollabPresence] = useState([]);

    // Sandbox run state (shared by everyone in the project via 'project-status')
    const [runConfig, setRunConfig] = useState(null);     // { label, env, envLabel, targets, deploy }
    const [runPhase, setRunPhase] = useState('stopped');  // preparing|installing|starting|running|stopped|error
    const [selectedTarget, setSelectedTarget] = useState('');
    const [showDeploy, setShowDeploy] = useState(false);
    const [showKaggle, setShowKaggle] = useState(false);
    const activeFileProcessRef = useRef(null);

    // Keep only the newest console lines so long-running dev servers don't bog down the UI
    const addLog = useCallback((message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setConsoleLogs(prev => [...prev.slice(-1500), { message: `[${timestamp}] ${message}`, type }]);
    }, []);

    const addTerminalLog = useCallback((message, type = 'info') => {
        setTerminalLogs(prev => [...prev.slice(-2000), { message, type }]);
    }, []);

    // Cleanup function to be called on unmount or stop
    const cleanupProcess = async (processId) => {
        if (!processId) return;
        try {
            await axios.post('/api/execute/stop-process', { processId, roomId });
            setActiveFileProcessId(null);
            addTerminalLog('Process terminated', 'info');
        } catch (err) {
            console.error('Error stopping process:', err);
        }
    };

    useEffect(() => { activeFileProcessRef.current = activeFileProcessId; }, [activeFileProcessId]);

    // On leaving the IDE, stop only *your own* file/terminal process. The project's dev server is
    // shared with collaborators, so it keeps running (the sandbox stops it when idle).
    // (This used to run on every state change and stop the project for everyone.)
    useEffect(() => () => {
        if (activeFileProcessRef.current) {
            axios.post('/api/execute/stop-process', { processId: activeFileProcessRef.current }).catch(() => {});
        }
    }, []);

    // --- COLLABORATIVE EDITING: Join/Leave Project ---
    useEffect(() => {
        if (!socket || !projectId || !user) return;

        // Join the project's collaborative session
        socket.emit('collab:join-project', {
            projectId,
            userId: user._id,
            username: user.username
        }, (response) => {
            if (response?.error) {
                console.warn('[collab] Could not join project:', response.error);
            } else {
                console.log('[collab] Joined project for collaboration');
            }
        });

        // Listen for presence updates
        const handlePresence = (presence) => {
            // Filter out self using socket.id so same user on multiple tabs works
            const others = presence.filter(p => p.socketId !== socket.id);
            setCollabPresence(others);
        };
        socket.on('collab:presence', handlePresence);

        // Request initial presence
        socket.emit('collab:get-presence', { projectId }, (presence) => {
            if (presence) {
                const others = presence.filter(p => p.socketId !== socket.id);
                setCollabPresence(others);
            }
        });

        return () => {
            socket.emit('collab:leave-project', { projectId });
            socket.off('collab:presence', handlePresence);
            setCollabPresence([]);
        };
    }, [projectId, user]);

    const formatFilesForTree = useCallback((fileList) => {
        // Build a proper tree structure handling folders as first-class citizens
        const root = { __children: {} };

        fileList.forEach(file => {
            const parts = file.path.split('/');
            let current = root;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;

                if (!current.__children[part]) {
                    current.__children[part] = {
                        name: part,
                        path: parts.slice(0, index + 1).join('/'),
                        type: 'folder', // Default to folder for intermediate nodes
                        __children: {}
                    };
                }

                current = current.__children[part];

                if (isLast) {
                    // It's the DB record itself
                    Object.assign(current, file);
                    // Explicitly set type based on DB record
                    current.type = file.isFolder ? 'folder' : 'file';
                }
            });
        });

        const buildTree = (node) => {
            const children = Object.values(node.__children).map(child => {
                // If it's a folder (either explicit or intermediate), process children
                if (child.type === 'folder') {
                    return {
                        ...child,
                        children: buildTree(child)
                    };
                } else {
                    return child; // Leaf file
                }
            });

            // Sort: Folders first, then files
            return children.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
        };

        return buildTree(root);
    }, []);

    // Setup Socket Listeners - ALWAYS CONNECTED
    useEffect(() => {
        if (!socket) return;

        // Listener for Project Console Output
        const handleProjectConsole = ({ projectId: pid, message, type }) => {
            if (pid === projectId) {
                addLog(message, type);
            }
        };

        const handleProjectStopped = ({ projectId: pid, exitCode }) => {
            if (pid === projectId) {
                setIsProjectRunning(false);
                addLog(`Project process exited with code ${exitCode}`, exitCode === 0 ? 'success' : 'error');
            }
        };

        // Listener for File Execution Output - Goes to BOTH Terminal AND Console
        const handleTerminalOutput = (data) => {
            if (!data) return;
            const { processId, message, type } = data;
            if (message && message.trim()) {
                addTerminalLog(message, type || 'info');
                // Also route to Console panel so console.log appears there
                addLog(`[Output] ${message.trim()}`, type || 'info');
            }
        };

        // A file run / terminal command finished (read the ref: this listener is registered once)
        const handleFileProcessEnded = ({ projectId: pid, processId }) => {
            if (pid === projectId && processId === activeFileProcessRef.current) {
                setActiveFileProcessId(null);
            }
        };

        // Preview became reachable
        const handlePreviewUrl = ({ projectId: pid, url }) => {
            if (pid === projectId) {
                setPreviewUrl(url);
                setShowBrowserWindow(true);
            }
        };

        // Shared run state — keeps every collaborator's toolbar in sync
        const handleStatus = (status) => {
            if (status.projectId !== projectId) return;
            setRunPhase(status.phase || 'stopped');
            setIsProjectRunning(['preparing', 'installing', 'starting', 'running'].includes(status.phase));
            if (status.previewUrl) setPreviewUrl(status.previewUrl);
            if (status.phase === 'stopped') setPreviewUrl('');
        };

        // Files created/changed inside the sandbox (git clone, Jupyter saves, npm init...)
        const handleFilesChanged = ({ projectId: pid }) => {
            if (pid !== projectId) return;
            axios.get(`/api/files/project/${projectId}`)
                .then(res => setFiles(formatFilesForTree(res.data)))
                .catch(() => {});
        };

        socket.on('project-console', handleProjectConsole);
        socket.on('project-stopped', handleProjectStopped);
        socket.on('terminal-output', handleTerminalOutput);
        socket.on('file-process-ended', handleFileProcessEnded);
        socket.on('project-preview-url', handlePreviewUrl);
        socket.on('project-status', handleStatus);
        socket.on('files-changed', handleFilesChanged);

        return () => {
            socket.off('project-console', handleProjectConsole);
            socket.off('project-stopped', handleProjectStopped);
            socket.off('terminal-output', handleTerminalOutput);
            socket.off('file-process-ended', handleFileProcessEnded);
            socket.off('project-preview-url', handlePreviewUrl);
            socket.off('project-status', handleStatus);
            socket.off('files-changed', handleFilesChanged);
        };
    }, [projectId, addLog, formatFilesForTree]);

    // How this project runs and deploys (environment, run targets)
    const loadRunConfig = useCallback(async () => {
        try {
            const res = await axios.get(`/api/execute/config/${projectId}`);
            setRunConfig(res.data);
            setSelectedTarget(t => (res.data.targets.some(x => x.id === t) ? t : (res.data.targets[0]?.id || '')));
        } catch (err) {
            console.error('Failed to load run config', err);
        }
    }, [projectId]);

    useEffect(() => { loadRunConfig(); }, [loadRunConfig]);

    const refreshFiles = useCallback(() => {
        axios.get(`/api/files/project/${projectId}`)
            .then(res => setFiles(formatFilesForTree(res.data)))
            .catch(() => {});
    }, [projectId, formatFilesForTree]);

    // Browser mode (no Docker on the server): code runs in this tab — WebContainer / Pyodide
    const browserMode = runConfig?.mode === 'browser';
    const openFileByPath = useCallback(async (filePath) => {
        const res = await axios.get(`/api/files/project/${projectId}`);
        const file = res.data.find(f => f.path === filePath);
        if (file) handleSelectFile(file);
    }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
    const rt = useBrowserRuntime({
        enabled: browserMode, projectId, projectName, runConfig,
        addLog, addTerminalLog, setPreviewUrl, setShowBrowserWindow, setRunPhase, setIsProjectRunning,
        setActiveFileProcessId, refreshFiles, openFile: openFileByPath, user, onRunConfig: setRunConfig
    });

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl+S or Cmd+S: Save current file
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (currentFile && isDirty) {
                    handleSaveFile(fileContent);
                }
            }
            // Ctrl+B or Cmd+B: Run current file
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                if (currentFile && !activeFileProcessId) {
                    const ext = currentFile.path?.split('.').pop();
                    if (RUNNABLE_EXTS.includes(ext)) {
                        handleRunFile();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentFile, fileContent, isDirty, activeFileProcessId]);

    // Load files on mount
    useEffect(() => {
        const loadFiles = async () => {
            try {
                const response = await axios.get(`/api/files/project/${projectId}`);
                const formattedFiles = formatFilesForTree(response.data);
                setFiles(formattedFiles);
            } catch (error) {
                console.error('Error loading project files:', error);
                addLog('Error loading project files', 'error');
            }
        };
        loadFiles();
    }, [projectId, formatFilesForTree]);

    // Check running status on mount (for late joining members)
    useEffect(() => {
        if (!projectId) return;
        const fetchStatus = async () => {
            try {
                const response = await axios.get(`/api/execute/status/${projectId}`);
                setRunPhase(response.data.phase || 'stopped');
                if (response.data.target) setSelectedTarget(response.data.target);
                if (response.data.running) {
                    setIsProjectRunning(true);
                    if (response.data.previewUrl) {
                        setPreviewUrl(response.data.previewUrl);
                    }
                    if (response.data.logs) {
                        setConsoleLogs(response.data.logs);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch project status', err);
            }
        };
        fetchStatus();
    }, [projectId]);

    const handleSelectFile = async (file) => {
        setCurrentFile(file);
        setIsDirty(false);
        try {
            const response = await axios.get(`/api/files/${file._id}`);
            setFileContent(response.data.content);
        } catch (error) {
            console.error('Failed to load file:', error);
            addLog(`Error loading file: ${file.name}`, 'error');
        }
    };

    const handleContentChange = (newContent) => {
        setFileContent(newContent);
        setIsDirty(true);
    };

    const handleSaveFile = async (contentCb) => {
        if (!currentFile) return;
        // Function can accept content directly or use state
        const contentToSave = (typeof contentCb === 'string') ? contentCb : fileContent;

        try {
            const response = await axios.put(`/api/files/${currentFile._id}`, { content: contentToSave });
            setIsDirty(false);
            setFileContent(response.data.content);
            if (browserMode) rt.onFileSaved(currentFile.path, response.data.content);
            if (/.json$/i.test(currentFile.path) && !currentFile.path.endsWith('.ipynb')) {
                try {
                    JSON.parse(contentToSave);
                } catch (jsonErr) {
                    addLog(`⚠ ${currentFile.name} is not valid JSON: ${jsonErr.message}`, 'warning');
                }
            }
            addLog(`✓ Saved: ${currentFile.name}`, 'success');
        } catch (_err) {
            addLog(`Error saving file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    const handleCreateFile = async (filename, isFolder = false) => {
        try {
            // Extract directory from filename if it contains path
            const filenameParts = filename.split('/');
            const actualFileName = filenameParts[filenameParts.length - 1];
            const directory = filenameParts.slice(0, -1).join('/');

            // Create parent folders if they don't exist
            if (directory) {
                let currentPath = '';
                for (const dir of filenameParts.slice(0, -1)) {
                    currentPath = currentPath ? `${currentPath}/${dir}` : dir;
                    // Check if folder exists, if not create it
                    try {
                        await axios.post('/api/files', {
                            name: dir,
                            path: currentPath,
                            projectId: projectId,
                            isFolder: true,
                            content: ''
                        });
                    } catch (folderErr) {
                        // Folder might already exist, ignore this error
                        if (folderErr.response?.status !== 400) {
                            console.warn('Error creating parent folder:', currentPath);
                        }
                    }
                }
            }

            // Create the actual file with full path
            await axios.post('/api/files', {
                name: actualFileName,
                path: filename,
                projectId: projectId,
                isFolder: isFolder,
                content: isFolder ? '' : '// New file'
            });

            // Refresh file tree
            const response = await axios.get(`/api/files/project/${projectId}`);
            const formattedFiles = formatFilesForTree(response.data);
            setFiles(formattedFiles);
            if (browserMode && !isFolder) rt.onFileSaved(filename, '// New file');
            addLog(`✓ Created ${isFolder ? 'folder' : 'file'}: ${filename}`, 'success');
        } catch (_err) {
            addLog(`Error creating file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    const handleDeleteFile = async (filePath) => {
        if (!window.confirm(`Delete ${filePath}?`)) return;
        try {
            await axios.delete(`/api/files/by-path`, { data: { filePath, projectId } });
            if (browserMode) rt.onFileDeleted(filePath);
            const response = await axios.get(`/api/files/project/${projectId}`);
            const formattedFiles = formatFilesForTree(response.data);
            setFiles(formattedFiles);
            if (currentFile?.path === filePath || currentFile?.path?.startsWith(filePath + '/')) {
                setCurrentFile(null);
                setFileContent('');
                setIsDirty(false);
            }
            addLog(`✓ Deleted: ${filePath}`, 'success');
        } catch (_err) {
            addLog(`Error deleting file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    const handleRenameFile = async (oldPath, newName) => {
        try {
            const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
            const newPath = parentPath ? parentPath + '/' + newName : newName;

            // Helper to find file ID from tree is hard, so we rely on backend path endpoint or rebuild flat list?
            // Actually `files` is a tree. We need the ID.
            // Let's refetch all files to find the ID since we don't keep a flat map easily here?
            // Wait, formatFilesForTree puts _id on the node.

            const findNodeByPath = (nodes, path) => {
                for (const node of nodes) {
                    if (node.path === path) return node;
                    if (node.children) {
                        const found = findNodeByPath(node.children, path);
                        if (found) return found;
                    }
                }
                return null;
            };

            const node = findNodeByPath(files, oldPath);
            if (!node || !node._id) {
                // Might be an inferred folder which has no ID? 
                // If so, renaming logic is complex (needs to rename all children paths).
                // Backend `rename` by ID only works for real records.
                addLog(`Error: Renaming virtual folders not fully supported yet`, 'warning');
                return;
            }

            await axios.put(`/api/files/rename/${node._id}`, {
                newName: newName,
                newPath: newPath
            });
            const response = await axios.get(`/api/files/project/${projectId}`);
            const formattedFiles = formatFilesForTree(response.data);
            setFiles(formattedFiles);
            addLog(`✓ Renamed: ${oldPath} → ${newPath}`, 'success');
        } catch (_err) {
            addLog(`Error renaming file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    // --- Run Whole Project ---
    const handleRunProject = async () => {
        if (browserMode) {
            if (currentFile && isDirty) await handleSaveFile(fileContent);
            setConsoleLogs([]);
            return rt.runProject(selectedTarget);
        }
        setIsProjectRunning(true);
        setRunPhase('preparing');
        setConsoleLogs([]);
        addLog(`🚀 Starting project in its sandbox...`, 'info');

        if (currentFile && isDirty) {
            await handleSaveFile(fileContent);
        }

        try {
            const response = await axios.post('/api/execute/run-project', {
                projectId,
                target: selectedTarget || undefined
            });

            if (response.data.success) {
                const { previewUrl: url, message, config } = response.data;
                addLog(`✓ ${message}`, 'success');
                if (config) setRunConfig(config);
                if (url) {
                    // The browser view shows a "starting…" page until the app answers
                    setPreviewUrl(url);
                    setShowBrowserWindow(true);
                }
            } else {
                addLog(`❌ Failed to start: ${response.data.message}`, 'error');
                setIsProjectRunning(false);
            }
        } catch (err) {
            addLog(`❌ Error running project: ${err.response?.data?.message || err.message}`, 'error');
            setIsProjectRunning(false);
        }
    };

    const handleStopProject = async () => {
        if (browserMode) return rt.stopProject();
        try {
            await axios.post('/api/execute/stop-project', { projectId });
            setIsProjectRunning(false);
            addLog(`Project stopped`, 'info');
        } catch (error) {
            console.error('Failed to stop project:', error);
            addLog(`Error stopping project: ${error.message}`, 'error');
        }
    };

    // --- Run Single File ---
    const handleRunFile = async () => {
        if (!currentFile || !currentFile.path) {
            addTerminalLog('Please select a file to run first.', 'warning');
            return;
        }

        const ext = currentFile.path.split('.').pop();
        if (!RUNNABLE_EXTS.includes(ext)) {
            addTerminalLog(`Only ${RUNNABLE_EXTS.map(e => '.' + e).join(', ')} files can be run directly — use ▶ Run for web apps.`, 'warning');
            return;
        }

        // Save before running
        if (isDirty) await handleSaveFile(fileContent);

        // Clear terminal logs and show running indicator
        setTerminalLogs([{ message: `$ Running ${currentFile.path}...`, type: 'info' }]);
        addLog(`▶ Running file: ${currentFile.path}`, 'info');
        if (browserMode) return rt.runFile(currentFile.path);

        try {
            const response = await axios.post('/api/execute/run-file', {
                projectId,
                filePath: currentFile.path,
                roomId
            });

            if (response.data.success) {
                setActiveFileProcessId(response.data.processId);
                addTerminalLog(`Process ID: ${response.data.processId}`, 'info');
            } else {
                addTerminalLog(`Error: ${response.data.message}`, 'error');
            }
        } catch (err) {
            addTerminalLog(`Error launching file: ${err.message}`, 'error');
        }
    };

    const handleStopFile = async () => {
        if (!activeFileProcessId) return;
        if (browserMode) return rt.stopFile();
        await cleanupProcess(activeFileProcessId);
    };

    const handleTerminalInput = async (input) => {
        if (!activeFileProcessId) {
            addTerminalLog('No active process to receive input.', 'warning');
            return;
        }

        addTerminalLog(input, 'input'); // Echo input
        if (browserMode) { rt.writeInput(input); return; }

        try {
            await axios.post('/api/execute/write-terminal', {
                processId: activeFileProcessId,
                input
            });
        } catch (err) {
            addTerminalLog(`Error sending input: ${err.message}`, 'error');
        }
    };

    // Execute shell/git commands when no process is running
    const handleCommandExec = async (command, currentDir = '') => {
        // Only log the command if it's not a clear command
        if (command.trim().toLowerCase() === 'clear') {
            setTerminalLogs([{ message: 'Terminal cleared', type: 'info' }]);
            return currentDir;
        }

        if (browserMode) return rt.runCommand(command, currentDir);
        addTerminalLog(`$ ${command}`, 'command');

        try {
            const response = await axios.post('/api/execute/run-command', {
                projectId,
                command,
                roomId,
                cwd: currentDir
            });

            if (response.data.output) {
                addTerminalLog(response.data.output, response.data.success ? 'info' : 'error');
            }
            if (!response.data.success) {
                addTerminalLog(`Command exited with code ${response.data.exitCode ?? 1}`, 'error');
            } else if (response.data.processId) {
                // Still running (server, watcher, REPL): route typed input to it and allow Stop.
                // Its output keeps streaming in; created files (e.g. git clone) appear in the explorer.
                setActiveFileProcessId(response.data.processId);
            }

            // Return newCwd if provided by server (for `cd` commands)
            if (response.data.newCwd !== undefined) {
                return response.data.newCwd;
            }
        } catch (err) {
            const errMsg = err.response?.data?.output || err.message;
            addTerminalLog(`Error: ${errMsg}`, 'error');
        }
    };

    // Upload files/folders to the project
    const handleUploadFiles = async (fileList) => {
        addLog(`📤 Uploading ${fileList.length} items...`, 'info');

        try {
            const response = await axios.post('/api/execute/upload-files-json', {
                projectId,
                files: fileList
            });

            if (response.data.success) {
                addLog(`✅ ${response.data.message}`, 'success');
                // Refresh file tree
                const filesRes = await axios.get(`/api/files/project/${projectId}`);
                const formattedFiles = formatFilesForTree(filesRes.data);
                setFiles(formattedFiles);
            } else {
                addLog(`❌ Upload failed: ${response.data.message}`, 'error');
            }
        } catch (err) {
            addLog(`❌ Upload error: ${err.response?.data?.message || err.message}`, 'error');
        }
    };

    const handleClearLogs = () => {
        setConsoleLogs([]);
    };

    const handleClearTerminal = () => {
        setTerminalLogs([{ message: 'Terminal cleared', type: 'info' }]);
    };

    // Pull in files changed inside the sandbox (e.g. notebooks saved from JupyterLab)
    const handleSyncFiles = async () => {
        if (browserMode) {
            try {
                const r = await rt.sync();
                addLog(`⇅ Synced files from the in-browser runtime (${r.uploaded} updated, ${r.deleted} removed)`, 'success');
            } catch (err) {
                addLog(`Sync failed: ${err.message}`, 'error');
            }
            return;
        }
        try {
            const res = await axios.post('/api/execute/sync', { projectId });
            const filesRes = await axios.get(`/api/files/project/${projectId}`);
            setFiles(formatFilesForTree(filesRes.data));
            addLog(`⇅ Synced files (${res.data.toDb} updated, ${res.data.imported} new)`, 'success');
        } catch (err) {
            addLog(`Sync failed: ${err.response?.data?.message || err.message}`, 'error');
        }
    };

    const phaseLabel = {
        preparing: '⏳ Preparing sandbox…',
        installing: '📦 Installing dependencies…',
        starting: '🚀 Starting…',
        running: '● Running',
        error: '✕ Error'
    }[runPhase];
    const targets = runConfig?.targets || [];

    return (
        <div className="ide-container">
            {/* IDE Header with Controls */}
            <div className="ide-header">
                <h2>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    Project IDE
                </h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--gh-999999)', fontSize: '13px' }} title={runConfig ? `Sandbox environment: ${runConfig.envLabel}` : ''}>
                        {projectType}{runConfig ? ` • ${browserMode ? '🌐' : '🐳'} ${runConfig.envLabel.split(' (')[0]}` : ''}
                    </span>
                    {phaseLabel && (
                        <span style={{ fontSize: '12px', color: runPhase === 'running' ? 'var(--gh-3fb950)' : runPhase === 'error' ? 'var(--gh-f85149)' : 'var(--gh-d29922)' }}>
                            {phaseLabel}
                        </span>
                    )}

                    {/* Collaborators Presence Bar */}
                    {collabPresence.length > 0 && (
                        <div className="collab-presence-bar">
                            {collabPresence.map((p, i) => (
                                <div
                                    key={p.socketId}
                                    className="collab-avatar"
                                    title={`${p.username}${p.activeFileName ? ` — editing ${p.activeFileName}` : ''}`}
                                    style={{
                                        '--avatar-color': `hsl(${(i * 47 + 120) % 360}, 70%, 60%)`
                                    }}
                                >
                                    {p.username?.charAt(0)?.toUpperCase() || '?'}
                                    {p.activeFileName && (
                                        <span className="collab-avatar-file">{p.activeFileName}</span>
                                    )}
                                </div>
                            ))}
                            <span className="collab-count">
                                {collabPresence.length} online
                            </span>
                        </div>
                    )}

                    {/* Run Project Controls */}
                    <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--gh-444444)', paddingRight: '10px' }}>
                        {targets.length > 1 && (
                            <select
                                value={selectedTarget}
                                onChange={(e) => setSelectedTarget(e.target.value)}
                                disabled={isProjectRunning}
                                title="What to run"
                                style={{ background: 'var(--gh-1e1e1e)', color: 'var(--gh-cccccc)', border: '1px solid var(--gh-3e3e42)', borderRadius: 3, fontSize: 12 }}
                            >
                                {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        )}
                        <button onClick={handleRunProject} disabled={isProjectRunning || (runConfig && targets.length === 0)} title={browserMode ? 'Run the project in your browser' : 'Run the project in its sandbox'}>
                            ▶ Run
                        </button>
                        <button onClick={handleStopProject} disabled={!isProjectRunning} style={{ background: 'var(--gh-c74c3c)' }} title="Stop project">
                            ◼ Stop
                        </button>
                    </div>

                    {/* Editor Controls */}
                    <button
                        onClick={() => handleSaveFile(fileContent)}
                        disabled={!currentFile}
                        style={{ background: 'var(--gh-0e639c)', color: 'white' }}
                        title="Save current file (Ctrl+S)"
                    >
                        💾 Save
                    </button>

                    {/* Run File Control */}
                    <button
                        onClick={handleRunFile}
                        disabled={!currentFile || (currentFile.path && !RUNNABLE_EXTS.includes(currentFile.path.split('.').pop())) || !!activeFileProcessId}
                        style={{
                            background: !!activeFileProcessId ? 'var(--gh-3c3c3c)' : 'var(--gh-d7ba7d)',
                            color: !!activeFileProcessId ? 'var(--gh-cccccc)' : 'var(--gh-1e1e1e)',
                            cursor: !!activeFileProcessId ? 'wait' : 'pointer'
                        }}
                        title={!!activeFileProcessId ? "File is currently running..." : "Run currently selected file (Ctrl+B)"}
                    >
                        {!!activeFileProcessId ? 'Running...' : '▶ Run File'}
                    </button>

                    {/* Stop File Control */}
                    {activeFileProcessId && (
                        <button
                            onClick={handleStopFile}
                            style={{ background: 'var(--gh-c74c3c)' }}
                            title="Stop currently running file"
                        >
                            ◼ Stop File
                        </button>
                    )}

                    <button
                        onClick={() => setShowBrowserWindow(!showBrowserWindow)}
                        style={{ background: showBrowserWindow ? 'var(--gh-6a9955)' : 'var(--gh-007acc)' }}
                    >
                        🌐 Browser {showBrowserWindow ? 'Hide' : 'Show'}
                    </button>

                    {['ml', 'python'].includes(runConfig?.env) && (
                        <button onClick={() => setShowKaggle(true)} title="Import a Kaggle dataset into data/">📥 Kaggle</button>
                    )}

                    <button onClick={handleSyncFiles} title={browserMode ? 'Save files created or changed by terminal commands back to the project' : 'Sync files changed inside the sandbox (e.g. notebooks saved in JupyterLab)'}>
                        ⇅ Sync
                    </button>

                    <button
                        onClick={() => { loadRunConfig(); setShowDeploy(true); }}
                        style={{ background: 'var(--gh-238636)', color: 'white' }}
                        title="Build and publish this project to a live URL"
                    >
                        🚀 Deploy
                    </button>
                </div>
            </div>

            {/* Main Window Container */}
            <div className="window-container">
                {/* Left Column: File Explorer (Full Height) */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '5px',
                    width: panelCollapsed.explorer ? '40px' : '250px',
                    minWidth: panelCollapsed.explorer ? '40px' : '250px',
                    flex: 0, position: 'relative',
                    transition: 'width 0.25s ease, min-width 0.25s ease'
                }}>
                    {panelCollapsed.explorer ? (
                        <div className="ide-window" style={{ flex: 1, cursor: 'pointer' }} onClick={() => togglePanel('explorer')}>
                            <div className="window-header" style={{ padding: '8px 4px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '11px', writingMode: 'vertical-rl', textOrientation: 'mixed', color: 'var(--gh-cccccc)', letterSpacing: '2px' }}>EXPLORER</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <FileExplorerWindow
                                files={files}
                                onSelectFile={handleSelectFile}
                                selectedFile={currentFile?.path}
                                onCreateFile={handleCreateFile}
                                onDeleteFile={handleDeleteFile}
                                onRenameFile={handleRenameFile}
                                onUploadFiles={handleUploadFiles}
                                onCollapse={() => togglePanel('explorer')}
                            />
                            {/* Package Library Toggle Button */}
                            <button
                                onClick={() => setShowPackageModal(!showPackageModal)}
                                style={{
                                    position: 'absolute',
                                    bottom: '10px',
                                    left: '10px',
                                    padding: '8px 14px',
                                    background: 'var(--gh-007acc)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    zIndex: 50,
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'var(--gh-005a9e)'}
                                onMouseLeave={(e) => e.target.style.background = 'var(--gh-007acc)'}
                            >
                                📦 Packages
                            </button>
                        </>
                    )}
                </div>

                {/* Middle Column: Code Editor (notebooks get a runnable notebook view) */}
                {currentFile?.path?.endsWith('.ipynb') ? (
                    <NotebookWindow
                        key={currentFile._id}
                        projectId={projectId}
                        file={currentFile}
                        content={fileContent}
                        onSave={handleSaveFile}
                        requirements={rt.requirements}
                    />
                ) : (
                <CodeEditorWindow
                    key={currentFile?._id || 'empty'}
                    currentFile={currentFile}
                    fileContent={fileContent}
                    onContentChange={handleContentChange}
                    onSaveFile={handleSaveFile}
                    projectId={projectId}
                    user={user}
                    language="javascript"
                />
                )}

                {/* Right Column: Console & Terminal Split */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                    {/* Top: Project Console */}
                    <div style={{
                        flex: panelCollapsed.console ? '0 0 36px' : 1,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        transition: 'flex 0.25s ease'
                    }}>
                        <ConsoleWindow
                            logs={consoleLogs}
                            onClearLogs={handleClearLogs}
                            isRunning={isProjectRunning}
                            collapsed={panelCollapsed.console}
                            onToggleCollapse={() => togglePanel('console')}
                        />
                    </div>

                    {/* Bottom: Interactive Terminal */}
                    <div style={{
                        flex: panelCollapsed.terminal ? '0 0 36px' : 1,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        borderTop: '2px solid var(--gh-333333)',
                        transition: 'flex 0.25s ease'
                    }}>
                        <TerminalWindow
                            logs={terminalLogs}
                            onInput={handleTerminalInput}
                            onClear={handleClearTerminal}
                            isRunning={!!activeFileProcessId}
                            onCommand={handleCommandExec}
                            projectId={projectId}
                            browserGit={browserMode}
                            collapsed={panelCollapsed.terminal}
                            onToggleCollapse={() => togglePanel('terminal')}
                        />
                    </div>
                </div>
            </div>

            {/* Fixed Draggable Browser Preview Window */}
            {showBrowserWindow && (
                <BrowserPreviewWindow
                    previewUrl={previewUrl}
                    phase={runPhase}
                    onConsole={addLog}
                    onClose={() => setShowBrowserWindow(false)}
                    stlite={rt.stlite}
                />
            )}

            {showDeploy && (
                <DeployPanel projectId={projectId} projectName={projectName} runConfig={runConfig} onClose={() => setShowDeploy(false)} />
            )}

            {showKaggle && (
                <KaggleImportModal
                    projectId={projectId}
                    onDone={(r) => { refreshFiles(); addLog(`📥 Imported from Kaggle: ${r.imported.join(', ')}`, 'success'); }}
                    onClose={() => setShowKaggle(false)}
                />
            )}

            {rt.apiTarget && (
                <ApiTesterWindow projectId={projectId} target={rt.apiTarget} requirements={rt.requirements} onLog={addLog} onClose={rt.closeApi} />
            )}

            {rt.figures.length > 0 && (
                <div style={{ position: 'fixed', right: 20, bottom: 20, width: 460, maxHeight: '70vh', overflow: 'auto', background: 'var(--gh-252526)', border: '1px solid var(--gh-3e3e42)', borderRadius: 8, zIndex: 2500, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--gh-3e3e42)', color: 'var(--gh-cccccc)', fontSize: 13 }}>
                        <b style={{ flex: 1 }}>📊 Figures</b>
                        <button onClick={rt.clearFigures} style={{ background: 'transparent', border: 'none', color: 'var(--gh-cccccc)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    {rt.figures.map((png, i) => <img key={i} alt={`figure ${i + 1}`} src={`data:image/png;base64,${png}`} style={{ width: '100%', background: 'var(--gh-ffffff)', display: 'block', marginBottom: 4 }} />)}
                </div>
            )}

            {browserMode && !rt.supported && (
                <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', background: 'var(--gh-3d321a)', color: 'var(--gh-d29922)', border: '1px solid var(--gh-d29922)', borderRadius: 6, padding: '8px 14px', fontSize: 13, zIndex: 2500 }}>
                    ⚠ This server runs code in your browser, which needs a recent Chrome, Edge or Firefox. Python and notebooks still work.
                </div>
            )}

            {/* Package Library Modal */}
            {showPackageModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000
                }}>
                    <div style={{
                        background: 'var(--gh-252526)',
                        border: '1px solid var(--gh-3e3e42)',
                        borderRadius: '6px',
                        width: '90%',
                        maxWidth: '600px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--gh-3e3e42)',
                            background: 'var(--gh-2d2d30)'
                        }}>
                            <h3 style={{ margin: 0, color: 'var(--gh-cccccc)', fontSize: '14px' }}>📦 Packages & Libraries</h3>
                            <button
                                onClick={() => setShowPackageModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--gh-cccccc)',
                                    fontSize: '18px',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <PackageLibraryWindow
                                projectType={projectType}
                                projectId={projectId}
                                installer={browserMode ? rt.install : undefined}
                                onPackageInstalled={(pkg) => {
                                    setInstalledPackages(prev => [...prev, pkg]);
                                    addLog(`✓ Installed: ${pkg}`, 'success');
                                }}
                                installedPackages={installedPackages}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WindowManager;
