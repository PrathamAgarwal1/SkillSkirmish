import React, { useState } from 'react';

const FileExplorerWindow = ({ files = [], onSelectFile, selectedFile, onCreateFile, onDeleteFile, onRenameFile }) => {
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [newFileName, setNewFileName] = useState('');
    const [creatingFile, setCreatingFile] = useState(false);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [renamingPath, setRenamingPath] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    const toggleFolder = (folderPath) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderPath)) {
            newExpanded.delete(folderPath);
        } else {
            newExpanded.add(folderPath);
        }
        setExpandedFolders(newExpanded);
    };

    const getFileIcon = (filename) => {
        if (filename.endsWith('.js') || filename.endsWith('.jsx')) return '✨';
        if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return '📘';
        if (filename.endsWith('.py')) return '🐍';
        if (filename.endsWith('.json')) return '{}';
        if (filename.endsWith('.css')) return '🎨';
        if (filename.endsWith('.scss')) return '🎨';
        if (filename.endsWith('.html')) return '🌐';
        if (filename.endsWith('.md')) return '📝';
        if (filename.endsWith('.java')) return '☕';
        if (filename.endsWith('.cpp') || filename.endsWith('.c')) return '⚙️';
        if (filename.endsWith('.go')) return '🐹';
        if (filename.endsWith('.rs')) return '🦀';
        if (filename.endsWith('.rb')) return '💎';
        return '📄';
    };

    const handleCreateFile = () => {
        if (newFileName.trim()) {
            onCreateFile(newFileName, false);
            setNewFileName('');
            setCreatingFile(false);
        }
    };

    const handleCreateFolder = () => {
        if (newFileName.trim()) {
            onCreateFile(newFileName, true);
            setNewFileName('');
            setCreatingFolder(false);
        }
    };

    const handleRename = (path, currentName) => {
        setRenamingPath(path);
        setRenameValue(currentName);
    };

    const handleRenameSubmit = (path) => {
        if (renameValue.trim() && renameValue !== path.split('/').pop()) {
            onRenameFile(path, renameValue);
            setRenamingPath(null);
            setRenameValue('');
        }
    };

    const renderFileTree = (items, depth = 0) => {
        return items.map((item, idx) => {
            const isFolder = item.type === 'folder';
            const isExpanded = expandedFolders.has(item.path);
            const isRenaming = renamingPath === item.path;

            return (
                <div key={idx}>
                    <div
                        className={`file-tree-item ${selectedFile === item.path ? 'selected' : ''}`}
                        style={{ 
                            paddingLeft: `${depth * 16 + 8}px`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            position: 'relative'
                        }}
                        onClick={() => {
                            if (isFolder && !isRenaming) {
                                toggleFolder(item.path);
                            } else if (!isFolder && !isRenaming) {
                                onSelectFile(item);
                            }
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (!isRenaming) {
                                handleRename(item.path, item.name);
                            }
                        }}
                    >
                        {isFolder && (
                            <span className="file-tree-item-icon" style={{ fontWeight: 'bold', minWidth: '16px' }}>
                                {isExpanded ? '📂' : '📁'}
                            </span>
                        )}
                        {!isFolder && (
                            <span className="file-tree-item-icon" style={{ minWidth: '16px' }}>
                                {getFileIcon(item.name)}
                            </span>
                        )}
                        {isRenaming ? (
                            <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit(item.path);
                                    if (e.key === 'Escape') setRenamingPath(null);
                                }}
                                onBlur={() => handleRenameSubmit(item.path)}
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '2px 4px',
                                    backgroundColor: '#3c3c3c',
                                    color: '#e0e0e0',
                                    border: '1px solid #007acc',
                                    borderRadius: '2px',
                                    fontSize: '12px',
                                    outline: 'none'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                            </span>
                        )}
                        {!isRenaming && (
                            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', opacity: 0, transition: 'opacity 0.2s' }} className="file-tree-actions">
                                <button
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#999',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        padding: '2px 4px'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRename(item.path, item.name);
                                    }}
                                    title="Rename"
                                >
                                    ✏️
                                </button>
                                <button
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#f48771',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        padding: '2px 4px'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteFile(item.path);
                                    }}
                                    title="Delete"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                    {isFolder && isExpanded && item.children && (
                        renderFileTree(item.children, depth + 1)
                    )}
                </div>
            );
        });
    };

    return (
        <div className="ide-window" style={{ minWidth: '250px', maxWidth: '400px' }}>
            <div className="window-header">
                <h3>
                    <span className="window-title-icon">📁</span>
                    Files
                </h3>
                <div className="window-controls" style={{ display: 'flex', gap: '4px' }}>
                    <button
                        className="window-btn"
                        onClick={() => setCreatingFile(true)}
                        title="New File"
                    >
                        📄
                    </button>
                    <button
                        className="window-btn"
                        onClick={() => setCreatingFolder(true)}
                        title="New Folder"
                    >
                        📁
                    </button>
                </div>
            </div>
            <div className="window-content" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {(creatingFile || creatingFolder) && (
                    <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#2d2d30', borderRadius: '4px', flexShrink: 0 }}>
                        <input
                            type="text"
                            placeholder={creatingFile ? 'filename.js' : 'folder name'}
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') creatingFile ? handleCreateFile() : handleCreateFolder();
                                if (e.key === 'Escape') {
                                    setCreatingFile(false);
                                    setCreatingFolder(false);
                                    setNewFileName('');
                                }
                            }}
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '6px',
                                backgroundColor: '#3c3c3c',
                                color: '#e0e0e0',
                                border: '1px solid #555',
                                borderRadius: '3px',
                                marginBottom: '6px',
                                fontSize: '12px'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
                            <button
                                onClick={creatingFile ? handleCreateFile : handleCreateFolder}
                                style={{
                                    flex: 1,
                                    padding: '4px',
                                    background: '#007acc',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                Create
                            </button>
                            <button
                                onClick={() => {
                                    setCreatingFile(false);
                                    setCreatingFolder(false);
                                    setNewFileName('');
                                }}
                                style={{
                                    flex: 1,
                                    padding: '4px',
                                    background: '#3c3c3c',
                                    color: '#e0e0e0',
                                    border: '1px solid #555',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                <div className="file-tree" style={{ flex: 1, overflow: 'auto' }}>
                    {files.length === 0 ? (
                        <div className="file-tree-item" style={{ opacity: 0.7 }}>
                            No files yet
                        </div>
                    ) : (
                        renderFileTree(files)
                    )}
                </div>
            </div>
        </div>
    );
};

export default FileExplorerWindow;
