import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import FileExplorerWindow from './FileExplorerWindow';
import CodeEditorWindow from './CodeEditorWindow';
import ConsoleWindow from './ConsoleWindow';
import TerminalWindow from './TerminalWindow';
import BrowserPreviewWindow from './BrowserPreviewWindow';
import PackageLibraryWindow from './PackageLibraryWindow';
import { socket } from '../../socket'; // Import the global socket instance
import './IDEStyles.css';

const WindowManager = ({ projectId, projectType = 'React App', roomId }) => {
    const [currentFile, setCurrentFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [files, setFiles] = useState([]);

    // Console (Project Run) Logs
    const [consoleLogs, setConsoleLogs] = useState([]);
    const [isProjectRunning, setIsProjectRunning] = useState(false);

    // Terminal (File Run) Logs
    const [terminalLogs, setTerminalLogs] = useState([{ message: 'Terminal ready', type: 'info' }]);
    const [activeFileProcessId, setActiveFileProcessId] = useState(null);

    const [previewUrl, setPreviewUrl] = useState('http://localhost:3000');
    const [installedPackages, setInstalledPackages] = useState([]);
    const [showPackageModal, setShowPackageModal] = useState(false);
    const [showBrowserWindow, setShowBrowserWindow] = useState(false);

    const wsRef = useRef(null);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setConsoleLogs(prev => [...prev, { message: `[${timestamp}] ${message}`, type }]);
    };

    const addTerminalLog = (message, type = 'info') => {
        setTerminalLogs(prev => [...prev, { message, type }]);
    };

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

    // Setup Socket Listeners
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

        // Listener for Terminal (Run File) Output
        const handleTerminalOutput = ({ processId, message, type }) => {
            // If we are tracking this process or just generally showing output for this room to sync collaborative terminal
            addTerminalLog(message, type);
        };

        socket.on('project-console', handleProjectConsole);
        socket.on('project-stopped', handleProjectStopped);
        socket.on('terminal-output', handleTerminalOutput);

        return () => {
            socket.off('project-console', handleProjectConsole);
            socket.off('project-stopped', handleProjectStopped);
            socket.off('terminal-output', handleTerminalOutput);
        };
    }, [projectId]);

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

    const handleSelectFile = async (file) => {
        setCurrentFile(file);
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
    };

    const handleSaveFile = async (contentCb) => {
        if (!currentFile) return;
        // Function can accept content directly or use state
        const contentToSave = (typeof contentCb === 'string') ? contentCb : fileContent;

        try {
            await axios.put(`/api/files/${currentFile._id}`, { content: contentToSave });
            addLog(`✓ Saved: ${currentFile.name}`, 'success');
        } catch (_err) {
            addLog(`Error saving file: ${_err.message}`, 'error');
        }
    };

    const handleCreateFile = async (filename, isFolder = false) => {
        try {
            // Need to handle creation relative to selected folder if possible, 
            // but for now let's assume root or user types full path.
            // Improved path logic: If creating 'folder/file', ensure backend handles it via 'path'
            // The formatFilesForTree logic will handle the nesting.

            await axios.post('/api/files', {
                name: filename,
                path: filename,
                projectId: projectId,
                isFolder: isFolder,
                content: isFolder ? '' : '// New file'
            });
            const response = await axios.get(`/api/files/project/${projectId}`);
            const formattedFiles = formatFilesForTree(response.data);
            setFiles(formattedFiles);
            addLog(`✓ Created ${isFolder ? 'folder' : 'file'}: ${filename}`, 'success');
        } catch (_err) {
            addLog(`Error creating file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    const handleDeleteFile = async (filePath) => {
        if (!window.confirm(`Delete ${filePath}?`)) return;
        try {
            await axios.delete(`/api/files/path/${filePath}`, { data: { projectId } });
            const response = await axios.get(`/api/files/project/${projectId}`);
            const formattedFiles = formatFilesForTree(response.data);
            setFiles(formattedFiles);
            setCurrentFile(null);
            addLog(`✓ Deleted: ${filePath}`, 'success');
        } catch (_err) {
            addLog(`Error deleting file: ${_err.response?.data?.msg || _err.message}`, 'error');
        }
    };

    const handleRenameFile = async (oldPath, newName) => {
        try {
            const newPath = oldPath.substring(0, oldPath.lastIndexOf('/')) + '/' + newName;

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
        setIsProjectRunning(true);
        setConsoleLogs([]);
        addLog(`Starting ${projectType}...`, 'info');

        if (currentFile) {
            await handleSaveFile(fileContent);
        }

        try {
            const response = await axios.post('/api/execute/run-project', {
                projectId,
                projectType,
                roomId
            });

            if (response.data.success) {
                addLog(`✓ Project started successfully`, 'success');
                if (response.data.previewUrl) {
                    setPreviewUrl(response.data.previewUrl);
                }
            } else {
                addLog(`Failed to start: ${response.data.message}`, 'error');
                setIsProjectRunning(false);
            }
        } catch (err) {
            addLog(`Error running project: ${err.response?.data?.message || err.message}`, 'error');
            setIsProjectRunning(false);
        }
    };

    const handleStopProject = async () => {
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
            alert('Please select a file to run first.');
            return;
        }

        const ext = currentFile.path.split('.').pop();
        if (!['js', 'py'].includes(ext)) {
            alert('Only .js and .py files can be executed directly.');
            return;
        }

        await handleSaveFile(fileContent);

        addTerminalLog(`$ Running ${currentFile.path}...`, 'info');

        try {
            const response = await axios.post('/api/execute/run-file', {
                projectId,
                filePath: currentFile.path,
                roomId
            });

            if (response.data.success) {
                setActiveFileProcessId(response.data.processId);
            } else {
                addTerminalLog(`Error: ${response.data.message}`, 'error');
            }
        } catch (err) {
            addTerminalLog(`Error launching file: ${err.message}`, 'error');
        }
    };

    const handleTerminalInput = async (input) => {
        if (!activeFileProcessId) {
            addTerminalLog('No active process to receive input.', 'warning');
            return;
        }

        addTerminalLog(input, 'input'); // Echo input

        try {
            await axios.post('/api/execute/write-terminal', {
                processId: activeFileProcessId,
                input
            });
        } catch (err) {
            addTerminalLog(`Error sending input: ${err.message}`, 'error');
        }
    };

    const handleClearLogs = () => {
        setConsoleLogs([]);
    };

    const handleRefreshPreview = () => {
        const event = new Event('refresh-preview');
        window.dispatchEvent(event);
    };

    return (
        <div className="ide-container">
            {/* IDE Header with Controls */}
            <div className="ide-header">
                <h2>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    Project IDE
                </h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ color: '#999', fontSize: '13px' }}>
                        {projectType} • {files.length} files
                    </span>

                    {/* Run Project Controls */}
                    <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid #444', paddingRight: '10px' }}>
                        <button onClick={handleRunProject} disabled={isProjectRunning} title="Run entire project (server/client)">
                            ▶ Run Project
                        </button>
                        <button onClick={handleStopProject} disabled={!isProjectRunning} style={{ background: '#c74c3c' }} title="Stop project">
                            ◼ Stop
                        </button>
                    </div>

                    {/* Editor Controls */}
                    <button
                        onClick={() => handleSaveFile(fileContent)}
                        disabled={!currentFile}
                        style={{ background: '#0e639c', color: 'white' }}
                        title="Save current file (Ctrl+S)"
                    >
                        💾 Save
                    </button>

                    {/* Run File Control */}
                    <button
                        onClick={handleRunFile}
                        disabled={!currentFile || (currentFile.path && !['js', 'py'].includes(currentFile.path.split('.').pop()))}
                        style={{ background: '#d7ba7d', color: '#1e1e1e' }}
                        title="Run currently selected file"
                    >
                        ▶ Run File
                    </button>

                    <button
                        onClick={() => setShowBrowserWindow(!showBrowserWindow)}
                        style={{ background: showBrowserWindow ? '#6a9955' : '#007acc' }}
                    >
                        🌐 Browser {showBrowserWindow ? 'Hide' : 'Show'}
                    </button>
                </div>
            </div>

            {/* Main Window Container */}
            <div className="window-container">
                {/* Left Column: File Explorer (Full Height) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '250px', flex: 0, position: 'relative' }}>
                    <FileExplorerWindow
                        files={files}
                        onSelectFile={handleSelectFile}
                        selectedFile={currentFile?.path}
                        onCreateFile={handleCreateFile}
                        onDeleteFile={handleDeleteFile}
                        onRenameFile={handleRenameFile}
                    />
                    {/* Package Library Toggle Button */}
                    <button
                        onClick={() => setShowPackageModal(!showPackageModal)}
                        style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '10px',
                            padding: '8px 14px',
                            background: '#007acc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            zIndex: 50,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#005a9e'}
                        onMouseLeave={(e) => e.target.style.background = '#007acc'}
                    >
                        📦 Packages
                    </button>
                </div>

                {/* Middle Column: Code Editor */}
                <CodeEditorWindow
                    currentFile={currentFile}
                    fileContent={fileContent}
                    onContentChange={handleContentChange}
                    onSaveFile={handleSaveFile}
                    language="javascript"
                />

                {/* Right Column: Console & Terminal Split */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                    {/* Top: Project Console */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <ConsoleWindow
                            logs={consoleLogs}
                            onClearLogs={handleClearLogs}
                            isRunning={isProjectRunning}
                        />
                    </div>

                    {/* Bottom: Interactive Terminal */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '2px solid #333' }}>
                        <TerminalWindow
                            logs={terminalLogs}
                            onInput={handleTerminalInput}
                            isRunning={!!activeFileProcessId}
                        />
                    </div>
                </div>
            </div>

            {/* Fixed Draggable Browser Preview Window */}
            {showBrowserWindow && (
                <BrowserPreviewWindow
                    previewUrl={previewUrl}
                    onRefresh={handleRefreshPreview}
                    isLoading={isProjectRunning}
                    onClose={() => setShowBrowserWindow(false)}
                />
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
                        background: '#252526',
                        border: '1px solid #3e3e42',
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
                            borderBottom: '1px solid #3e3e42',
                            background: '#2d2d30'
                        }}>
                            <h3 style={{ margin: 0, color: '#cccccc', fontSize: '14px' }}>📦 Packages & Libraries</h3>
                            <button
                                onClick={() => setShowPackageModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#cccccc',
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
