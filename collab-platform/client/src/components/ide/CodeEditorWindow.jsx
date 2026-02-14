import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const CodeEditorWindow = ({ 
    currentFile = null, 
    fileContent = '', 
    onContentChange, 
    onSaveFile
}) => {
    const [content, setContent] = useState(fileContent);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setContent(fileContent);
        setIsDirty(false);
    }, [currentFile, fileContent]);

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

    return (
        <div className="ide-window" style={{ flex: 2 }}>
            <div className="window-header">
                <h3>
                    <span className="window-title-icon">📝</span>
                    {currentFile?.name || 'No file selected'}
                    {isDirty && <span style={{ color: '#f48771', marginLeft: '8px' }}>●</span>}
                </h3>
                <div className="window-controls">
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
                        defaultLanguage={getLanguageFromFilename(currentFile.name)}
                        language={getLanguageFromFilename(currentFile.name)}
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
                            formatOnType: true
                        }}
                        onMount={(editor) => {
                            // Add keyboard shortcut for save
                            editor.addCommand(
                                window.monaco?.KeyMod.CtrlCmd | window.monaco?.KeyCode.KeyS,
                                handleSave
                            );
                        }}
                    />
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: '#999',
                            fontSize: '14px'
                        }}
                    >
                        Select a file to start editing
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodeEditorWindow;
