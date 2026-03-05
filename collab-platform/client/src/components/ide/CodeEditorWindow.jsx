import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { registerAIAutocomplete } from '../AI/CodeSuggestionOverlay';

const CodeEditorWindow = ({
    currentFile = null,
    fileContent = '',
    onContentChange,
    onSaveFile
}) => {
    const [content, setContent] = useState(fileContent);
    const [isDirty, setIsDirty] = useState(false);
    const editorRef = useRef(null);
    const cleanupRef = useRef(null);

    // Sync internal content state when fileContent prop changes (new file selected)
    useEffect(() => {
        setContent(fileContent);
        setIsDirty(false);
    }, [fileContent]);

    // Cleanup autocomplete on unmount
    useEffect(() => {
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
            }
        };
    }, []);

    const handleChange = (newContent) => {
        setContent(newContent);
        setIsDirty(true);
        onContentChange(newContent);
    };

    const handleSave = () => {
        onSaveFile(content);
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
                    // Send to AI sidebar for explanation
                    if (window.__aiSidebar) {
                        window.__aiSidebar.addExplanation(selectedText, currentLanguage);
                    }
                } else {
                    // If no selection, explain the entire file
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
                    window.__aiSidebar.addExplanation(
                        code,
                        currentLanguage
                    );
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
            const cleanup = registerAIAutocomplete(editor, monaco, () => currentLanguage);
            cleanupRef.current = cleanup;
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
                        value={content}
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
