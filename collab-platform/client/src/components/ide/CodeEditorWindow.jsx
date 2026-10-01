import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { socket } from '../../socket';
import { registerAIAutocomplete } from '../AI/CodeSuggestionOverlay';

// Cursor color palette for remote collaborators
const CURSOR_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

const CodeEditorWindow = ({
    currentFile = null,
    fileContent = '',
    onContentChange,
    onSaveFile,
    projectId = null,
    user = null
}) => {
    const [content, setContent] = useState(fileContent);
    const [isDirty, setIsDirty] = useState(false);
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isEditorMounted, setIsEditorMounted] = useState(false);
    const [collaborators, setCollaborators] = useState([]); // others editing this same file
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const cleanupRef = useRef(null);

    // Yjs refs
    const ydocRef = useRef(null);
    const bindingRef = useRef(null);
    const isCollabActiveRef = useRef(false);
    const prevFileIdRef = useRef(null);
    const remoteCursorsRef = useRef(new Map()); // socketId -> decorationIds
    const decorationsRef = useRef([]); // Monaco decoration collection
    const presenceRef = useRef(new Map()); // socketId -> { userId, username, activeFileId } (from the server)
    const cursorStateRef = useRef(new Map()); // socketId -> { cursor, timer } (name-tag fade-out)
    const currentFileIdRef = useRef(null);
    currentFileIdRef.current = currentFile?._id || null;

    // Sync internal content state when fileContent prop changes (new file selected)
    // Only used when collab is NOT active (fallback mode)
    useEffect(() => {
        if (!isCollabActiveRef.current) {
            setContent(fileContent);
            setIsDirty(false);
        }
    }, [fileContent]);

    // Cleanup autocomplete on unmount
    useEffect(() => {
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
            }
        };
    }, []);

    // Setup socket connection listener for reactive collab initialization
    useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);

    // --- WHO'S HERE: presence for this project (names for cursors, avatars, removing stale cursors) ---
    useEffect(() => {
        if (!projectId) return undefined;
        const apply = (list) => {
            if (!Array.isArray(list)) return;
            presenceRef.current = new Map(list.map(p => [p.socketId, p]));
            const fileId = currentFileIdRef.current;
            const here = list.filter(p => p.socketId !== socket.id && fileId && p.activeFileId === fileId);
            setCollaborators(here);
            // Cursors of people who closed this file or left
            const hereIds = new Set(here.map(p => p.socketId));
            for (const id of [...remoteCursorsRef.current.keys()]) {
                if (!hereIds.has(id)) removeRemoteCursor(editorRef.current, id);
            }
        };
        socket.on('collab:presence', apply);
        socket.emit('collab:get-presence', { projectId }, apply);
        return () => socket.off('collab:presence', apply);
    }, [projectId, currentFile?._id]);

    // --- COLLABORATIVE EDITING SETUP ---
    useEffect(() => {
        if (!isEditorMounted || !editorRef.current || !currentFile || !currentFile._id || !projectId || !isConnected) {
            return;
        }

        const fileId = currentFile._id;
        const editor = editorRef.current;
        const monaco = monacoRef.current;

        // If same file, skip re-initialization
        if (prevFileIdRef.current === fileId && isCollabActiveRef.current) {
            return;
        }

        // Clean up previous file's collaboration
        cleanupCollab();

        prevFileIdRef.current = fileId;

        // Join the file for collaborative editing
        socket.emit('collab:open-file', {
            projectId,
            fileId,
            fileName: currentFile.name
        }, (response) => {
            if (!response || response.error) {
                console.warn('[collab] Failed to open file:', response?.error);
                // Fallback: use non-collaborative mode
                return;
            }

            try {
                // Create Yjs document
                const ydoc = new Y.Doc();
                ydocRef.current = ydoc;

                // Apply server state if available
                if (response.state) {
                    const uint8State = new Uint8Array(response.state);
                    Y.applyUpdate(ydoc, uint8State);
                }

                const ytext = ydoc.getText('monaco');

                // Create Monaco binding — this takes over content management
                const binding = new MonacoBinding(
                    ytext,
                    editor.getModel(),
                    new Set([editor])
                );
                bindingRef.current = binding;
                isCollabActiveRef.current = true;

                // Listen for remote updates from server
                const handleRemoteUpdate = ({ update, senderId }) => {
                    if (senderId === socket.id) return; // Skip own updates
                    try {
                        Y.applyUpdate(ydoc, new Uint8Array(update), 'remote');
                    } catch (err) {
                        console.error('[collab] Error applying remote update:', err);
                    }
                };
                socket.on('collab:sync-update', handleRemoteUpdate);

                // Send local updates to server
                const handleLocalUpdate = (update, origin) => {
                    // Don't send updates that originated from remote sync
                    if (origin === 'remote' || origin === socket) return;
                    socket.emit('collab:sync-update', {
                        projectId,
                        fileId,
                        update: Array.from(update)
                    });
                };
                ydoc.on('update', handleLocalUpdate);

                // Track content changes for dirty state and parent callback
                const handleYTextChange = () => {
                    const currentContent = ytext.toString();
                    setIsDirty(true);
                    onContentChange(currentContent);
                };
                ytext.observe(handleYTextChange);

                // Listen for remote cursor updates
                const handleRemoteCursor = ({ socketId: remoteSocketId, cursor }) => {
                    if (remoteSocketId === socket.id) return;
                    updateRemoteCursor(editor, monaco, remoteSocketId, cursor);
                };
                socket.on('collab:cursor-update', handleRemoteCursor);

                // Someone just opened this file: tell them where we are
                const sendCursor = () => {
                    const position = editor.getPosition();
                    const selection = editor.getSelection();
                    if (!position) return;
                    socket.emit('collab:cursor-update', {
                        projectId,
                        fileId,
                        cursor: {
                            position,
                            selection: selection ? {
                                startLineNumber: selection.startLineNumber,
                                startColumn: selection.startColumn,
                                endLineNumber: selection.endLineNumber,
                                endColumn: selection.endColumn
                            } : null,
                            username: user?.username || 'Anonymous'
                        }
                    });
                };
                const handleCursorRequest = (data) => { if (data?.fileId === fileId) sendCursor(); };
                socket.on('collab:cursor-request', handleCursorRequest);

                // Send own cursor position on selection change
                const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
                    const selection = editor.getSelection();
                    socket.emit('collab:cursor-update', {
                        projectId,
                        fileId,
                        cursor: {
                            position: e.position,
                            selection: selection ? {
                                startLineNumber: selection.startLineNumber,
                                startColumn: selection.startColumn,
                                endLineNumber: selection.endLineNumber,
                                endColumn: selection.endColumn
                            } : null,
                            username: user?.username || 'Anonymous'
                        }
                    });
                });

                // Store cleanup references
                cleanupRef.current = () => {
                    socket.off('collab:sync-update', handleRemoteUpdate);
                    socket.off('collab:cursor-update', handleRemoteCursor);
                    socket.off('collab:cursor-request', handleCursorRequest);
                    ydoc.off('update', handleLocalUpdate);
                    ytext.unobserve(handleYTextChange);
                    cursorDisposable.dispose();
                    binding.destroy();
                    ydoc.destroy();

                    // Clear remote cursor decorations
                    clearAllRemoteCursors(editor);

                    isCollabActiveRef.current = false;
                    ydocRef.current = null;
                    bindingRef.current = null;
                };

                console.log(`[collab] Collaborative editing active for ${currentFile.name} (${response.userCount} users)`);
            } catch (err) {
                console.error('[collab] Error setting up collaborative editing:', err);
                isCollabActiveRef.current = false;
            }
        });

        return () => {
            // Close the file collaboration on unmount or file change
            // Use captured fileId (not ref) since ref resets on remount
            if (isConnected) {
                socket.emit('collab:close-file', {
                    projectId,
                    fileId
                });
            }
            cleanupCollab();
        };
    }, [currentFile?._id, projectId, isConnected, isEditorMounted]);

    const cleanupCollab = () => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    };

    // --- REMOTE CURSOR RENDERING ---
    // Each collaborator gets their own color (by user, so it's stable across reconnects), a caret,
    // a selection highlight and a name tag that shows while they're active.
    const colorFor = (key) => CURSOR_COLORS[Math.abs(hashString(String(key))) % CURSOR_COLORS.length];
    const cursorClass = (socketId) => `rc-${String(socketId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const updateRemoteCursor = (editor, monaco, socketId, cursor, showName = true) => {
        if (!editor || !monaco || !cursor) return;

        // Names come from the server's presence list (not from the cursor message, which anyone could fake)
        const info = presenceRef.current.get(socketId);
        const username = info?.username || cursor.username || 'Someone';
        const color = colorFor(info?.userId || socketId);
        const cls = cursorClass(socketId);
        const lineCount = editor.getModel()?.getLineCount() || 1;
        const clampLine = (n) => Math.min(Math.max(1, n || 1), lineCount);

        const decorations = [];
        if (cursor.position) {
            const line = clampLine(cursor.position.lineNumber);
            decorations.push({
                range: new monaco.Range(line, cursor.position.column, line, cursor.position.column),
                options: {
                    afterContentClassName: `rc-caret ${cls}${showName ? ' rc-show' : ''}${line === 1 ? ' rc-below' : ''}`,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    hoverMessage: { value: `**${username}**` }
                }
            });
        }

        const sel = cursor.selection;
        if (sel && (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)) {
            decorations.push({
                range: new monaco.Range(clampLine(sel.startLineNumber), sel.startColumn, clampLine(sel.endLineNumber), sel.endColumn),
                options: {
                    className: `rc-sel ${cls}-sel`,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        const prevDecorationIds = remoteCursorsRef.current.get(socketId) || [];
        remoteCursorsRef.current.set(socketId, editor.deltaDecorations(prevDecorationIds, decorations));
        injectCursorStyle(cls, color, username);

        // Show the name tag for a few seconds after each move, then just the caret
        if (showName) {
            const state = cursorStateRef.current.get(socketId) || {};
            clearTimeout(state.timer);
            const timer = setTimeout(() => updateRemoteCursor(editor, monaco, socketId, cursor, false), 3000);
            cursorStateRef.current.set(socketId, { cursor, timer });
        }
    };

    const removeRemoteCursor = (editor, socketId) => {
        const ids = remoteCursorsRef.current.get(socketId);
        if (ids && editor) editor.deltaDecorations(ids, []);
        remoteCursorsRef.current.delete(socketId);
        clearTimeout(cursorStateRef.current.get(socketId)?.timer);
        cursorStateRef.current.delete(socketId);
    };

    const clearAllRemoteCursors = (editor) => {
        if (!editor) return;
        for (const socketId of [...remoteCursorsRef.current.keys()]) removeRemoteCursor(editor, socketId);
    };

    // --- UTILITY ---
    const hashString = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash;
    };

    // One <style> per collaborator: their color and name tag
    const injectCursorStyle = (cls, color, username) => {
        const styleId = `cursor-style-${cls}`;
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        // CSS string escaping: the name ends up inside content: "…"
        // eslint-disable-next-line no-control-regex
        const label = String(username).slice(0, 30).replace(/[\\"]/g, '\\$&').replace(/[\u0000-\u001f\u007f]/g, ' ');
        const css = `
            .${cls} { border-color: ${color}; }
            .${cls}::after { content: "${label}"; background: ${color}; }
            .${cls}-sel { background-color: ${color}40; }
        `;
        if (styleEl.textContent !== css) styleEl.textContent = css;
    };

    const handleChange = (newContent) => {
        // When collab is active, content changes come through Yjs observer
        // This handler is only called in non-collab mode
        if (!isCollabActiveRef.current) {
            setContent(newContent);
            setIsDirty(true);
            onContentChange(newContent);
        }
    };

    const handleSave = () => {
        // Always read from editor instance for the most current content
        const editor = editorRef.current;
        const currentContent = editor ? editor.getValue() : content;
        onSaveFile(currentContent);
        setIsDirty(false);
    };

    const getLanguageFromFilename = (filename) => {
        if (!filename) return 'plaintext';
        const ext = filename.split('.').pop().toLowerCase();
        const languageMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'php': 'php',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'json': 'json',
            'xml': 'xml',
            'sql': 'sql',
            'sh': 'shell',
            'bash': 'shell',
            'md': 'markdown',
            'yml': 'yaml',
            'yaml': 'yaml'
        };
        return languageMap[ext] || 'plaintext';
    };

    const currentLanguage = getLanguageFromFilename(currentFile?.name);

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setIsEditorMounted(true); // Trigger collab useEffect now that editor is ready

        // Keyboard shortcut for save
        editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            handleSave
        );

        // --- "Explain this Code" Context Menu Action ---
        editor.addAction({
            id: 'ai-explain-code',
            label: '🤖 Explain this Code',
            keybindings: [
                monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE
            ],
            contextMenuGroupId: '9_ai',
            contextMenuOrder: 1,
            run: (ed) => {
                const selection = ed.getSelection();
                const selectedText = ed.getModel().getValueInRange(selection);
                if (selectedText && selectedText.trim()) {
                    if (window.__aiSidebar) {
                        window.__aiSidebar.addExplanation(selectedText, currentLanguage);
                    }
                } else {
                    const allContent = ed.getValue();
                    if (allContent.trim() && window.__aiSidebar) {
                        window.__aiSidebar.addExplanation(allContent, currentLanguage);
                    }
                }
            }
        });

        // --- "Debug this Code" Context Menu Action ---
        editor.addAction({
            id: 'ai-debug-code',
            label: '🐛 Debug this Code',
            contextMenuGroupId: '9_ai',
            contextMenuOrder: 2,
            run: (ed) => {
                const selection = ed.getSelection();
                const selectedText = ed.getModel().getValueInRange(selection);
                const code = selectedText && selectedText.trim() ? selectedText : ed.getValue();
                if (code.trim() && window.__aiSidebar) {
                    window.__aiSidebar.open();
                    window.__aiSidebar.addExplanation(code, currentLanguage);
                }
            }
        });

        // --- "Ask AI about this Code" Context Menu Action ---
        editor.addAction({
            id: 'ai-ask-about-code',
            label: '💬 Ask AI about this Code',
            contextMenuGroupId: '9_ai',
            contextMenuOrder: 3,
            run: (ed) => {
                if (window.__aiSidebar) {
                    window.__aiSidebar.open();
                }
            }
        });

        // --- Register AI Autocomplete Provider ---
        try {
            const aiCleanup = registerAIAutocomplete(editor, monaco, () => currentLanguage);
            // Store a separate ref for AI cleanup (don't overwrite collab cleanup)
            const prevCleanup = cleanupRef.current;
            cleanupRef.current = () => {
                if (aiCleanup) aiCleanup();
                if (prevCleanup) prevCleanup();
            };
        } catch (err) {
            console.warn('AI autocomplete registration failed:', err);
        }
    };

    return (
        <div className="ide-window" style={{ flex: 2 }}>
            <div className="window-header">
                <h3>
                    <span className="window-title-icon">📝</span>
                    {currentFile?.name || 'No file selected'}
                    {isDirty && <span style={{ color: '#f48771', marginLeft: '8px' }}>●</span>}
                    {isCollabActiveRef.current && (
                        <span className="collab-badge" title="Live collaboration active">
                            🔴 LIVE
                        </span>
                    )}
                    {collaborators.length > 0 && (
                        <span className="collab-avatars" aria-label={`Also editing: ${collaborators.map(c => c.username).join(', ')}`}>
                            {collaborators.slice(0, 5).map(c => (
                                <span
                                    key={c.socketId}
                                    className="collab-avatar"
                                    style={{ background: colorFor(c.userId || c.socketId) }}
                                    title={`${c.username} is editing this file`}
                                >
                                    {(c.username || '?').slice(0, 1).toUpperCase()}
                                </span>
                            ))}
                            {collaborators.length > 5 && <span className="collab-avatar more">+{collaborators.length - 5}</span>}
                        </span>
                    )}
                </h3>
                <div className="window-controls">
                    {/* Explain Code Button */}
                    {currentFile && (
                        <button
                            className="window-btn"
                            onClick={() => {
                                const editor = editorRef.current;
                                if (!editor) return;
                                const selection = editor.getSelection();
                                const selectedText = editor.getModel().getValueInRange(selection);
                                const code = selectedText && selectedText.trim() ? selectedText : editor.getValue();
                                if (code.trim() && window.__aiSidebar) {
                                    window.__aiSidebar.addExplanation(code, currentLanguage);
                                }
                            }}
                            title="Explain Code (Ctrl+Shift+E)"
                            style={{ fontSize: '14px' }}
                        >
                            🤖
                        </button>
                    )}
                    <button
                        className="window-btn"
                        onClick={handleSave}
                        disabled={!isDirty}
                        title="Save (Ctrl+S)"
                    >
                        💾
                    </button>
                </div>
            </div>
            <div className="window-content" style={{ padding: 0, flexDirection: 'column' }}>
                {currentFile ? (
                    <Editor
                        height="100%"
                        defaultLanguage={currentLanguage}
                        language={currentLanguage}
                        // Only set value when collab is NOT active (Yjs handles content otherwise)
                        {...(!isCollabActiveRef.current ? { value: content } : {})}
                        onChange={(value) => handleChange(value || '')}
                        theme="vs-dark"
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: "'Consolas', 'Monaco', monospace",
                            lineHeight: 1.6,
                            tabSize: 4,
                            insertSpaces: true,
                            wordWrap: 'on',
                            automaticLayout: true,
                            scrollBeyondLastLine: false,
                            padding: { top: 12, bottom: 12 },
                            formatOnPaste: true,
                            formatOnType: true,
                            inlineSuggest: { enabled: true },
                            quickSuggestions: true
                        }}
                        onMount={handleEditorMount}
                    />
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: '#999',
                            fontSize: '14px',
                            flexDirection: 'column',
                            gap: '10px'
                        }}
                    >
                        <span style={{ fontSize: '48px' }}>📂</span>
                        <span>Select a file from the explorer to start editing</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodeEditorWindow;
