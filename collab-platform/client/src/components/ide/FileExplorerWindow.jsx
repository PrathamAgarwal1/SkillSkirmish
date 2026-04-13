import React, { useState, useRef } from 'react';

const FileExplorerWindow = ({ files = [], onSelectFile, selectedFile, onCreateFile, onDeleteFile, onRenameFile, onUploadFiles, onCollapse }) => {
    const folderInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [renamingPath, setRenamingPath] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    // Inline creation state: { parentPath, isFolder }
    const [creatingIn, setCreatingIn] = useState(null);
    const [newItemName, setNewItemName] = useState('');

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

    const handleStartCreate = (parentPath, isFolder) => {
        // Expand the parent folder so the inline input is visible
        const newExpanded = new Set(expandedFolders);
        newExpanded.add(parentPath);
        setExpandedFolders(newExpanded);
        setCreatingIn({ parentPath, isFolder });
        setNewItemName('');
    };

    const handleConfirmCreate = () => {
        if (!creatingIn || !newItemName.trim()) {
            setCreatingIn(null);
            setNewItemName('');
            return;
        }
        const fullPath = creatingIn.parentPath
            ? `${creatingIn.parentPath}/${newItemName.trim()}`
            : newItemName.trim();
        onCreateFile(fullPath, creatingIn.isFolder);
        setCreatingIn(null);
        setNewItemName('');
    };

    const handleCancelCreate = () => {
        setCreatingIn(null);
        setNewItemName('');
    };

    const handleRename = (path, currentName) => {
        setRenamingPath(path);
        setRenameValue(currentName);
    };

    const handleRenameSubmit = (path) => {
        if (renameValue.trim() && renameValue !== path.split('/').pop()) {
            onRenameFile(path, renameValue);
        }
        setRenamingPath(null);
        setRenameValue('');
    };

    // Inline input row for creating a new file/folder inside a parent
    const renderInlineInput = () => (
        <div
            className="file-tree-item"
            style={{
                paddingLeft: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            }}
        >
            <span style={{ minWidth: '16px', fontSize: '14px' }}>
                {creatingIn.isFolder ? '📁' : '📄'}
            </span>
            <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate();
                    if (e.key === 'Escape') handleCancelCreate();
                }}
                onBlur={handleConfirmCreate}
                autoFocus
                placeholder={creatingIn.isFolder ? 'folder name' : 'filename.js'}
                style={{
                    flex: 1,
                    padding: '2px 6px',
                    backgroundColor: '#3c3c3c',
                    color: '#e0e0e0',
                    border: '1px solid #007acc',
                    borderRadius: '2px',
                    fontSize: '12px',
                    outline: 'none',
                    fontFamily: 'inherit',
                }}
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );

    const renderFileTree = (items, depth = 0, parentPath = '') => {
        return items.map((item, idx) => {
            const isFolder = item.type === 'folder';
            const isExpanded = expandedFolders.has(item.path);
            const isRenaming = renamingPath === item.path;
            const isCreatingHere = creatingIn && creatingIn.parentPath === item.path;

            return (
                <div key={item.path || idx}>
                    <div
                        className={`file-tree-item ${selectedFile === item.path ? 'selected' : ''}`}
                        style={{
                            paddingLeft: `${depth * 16 + 8}px`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            position: 'relative',
                            height: '24px',
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
                        {/* Chevron for folders */}
                        {isFolder && (
                            <span style={{
                                minWidth: '12px',
                                fontSize: '10px',
                                color: '#999',
                                transition: 'transform 0.15s',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                display: 'inline-block',
                            }}>
                                ▶
                            </span>
                        )}
                        {!isFolder && <span style={{ minWidth: '12px' }} />}

                        {/* Icon */}
                        {isFolder ? (
                            <span style={{ minWidth: '16px', fontSize: '14px' }}>
                                {isExpanded ? '📂' : '📁'}
                            </span>
                        ) : (
                            <span style={{ minWidth: '16px', fontSize: '14px' }}>
                                {getFileIcon(item.name)}
                            </span>
                        )}

                        {/* Name or rename input */}
                        {isRenaming ? (
                            <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit(item.path);
                                    if (e.key === 'Escape') {
                                        setRenamingPath(null);
                                        setRenameValue('');
                                    }
                                }}
                                onBlur={() => handleRenameSubmit(item.path)}
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '1px 4px',
                                    backgroundColor: '#3c3c3c',
                                    color: '#e0e0e0',
                                    border: '1px solid #007acc',
                                    borderRadius: '2px',
                                    fontSize: '12px',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span style={{
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '13px',
                            }}>
                                {item.name}
                            </span>
                        )}

                        {/* Hover actions */}
                        {!isRenaming && (
                            <div className="file-tree-actions">
                                {isFolder && (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartCreate(item.path, false);
                                            }}
                                            title="New File"
                                            style={actionBtnStyle}
                                        >
                                            📄
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartCreate(item.path, true);
                                            }}
                                            title="New Folder"
                                            style={actionBtnStyle}
                                        >
                                            📁
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRename(item.path, item.name);
                                    }}
                                    title="Rename"
                                    style={actionBtnStyle}
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteFile(item.path);
                                    }}
                                    title="Delete"
                                    style={{ ...actionBtnStyle, color: '#f48771' }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Children + inline create input */}
                    {isFolder && isExpanded && (
                        <div>
                            {/* Inline creation input appears at the top of the folder's children */}
                            {isCreatingHere && (
                                <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                                    {renderInlineInput()}
                                </div>
                            )}
                            {item.children && renderFileTree(item.children, depth + 1, item.path)}
                        </div>
                    )}
                </div>
            );
        });
    };

    const actionBtnStyle = {
        background: 'transparent',
        border: 'none',
        color: '#999',
        cursor: 'pointer',
        fontSize: '12px',
        padding: '0 2px',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
    };

    const handleFolderUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Read all files and their relative paths
        const fileList = [];
        const folders = new Set();

        for (const file of files) {
            const relativePath = file.webkitRelativePath || file.name;
            // Skip node_modules, .git, etc.
            if (relativePath.includes('node_modules/') || relativePath.includes('.git/')) continue;
            
            // Collect folder paths
            const parts = relativePath.split('/');
            for (let i = 1; i < parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }

            try {
                const content = await file.text();
                fileList.push({ filePath: relativePath, content, isFolder: false });
            } catch (err) {
                console.warn(`Could not read file: ${relativePath}`);
            }
        }

        // Add folder entries first
        const folderEntries = Array.from(folders).map(f => ({ filePath: f, content: '', isFolder: true }));
        
        if (onUploadFiles) {
            onUploadFiles([...folderEntries, ...fileList]);
        }

        // Reset input
        e.target.value = '';
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const fileList = [];
        for (const file of files) {
            try {
                const content = await file.text();
                fileList.push({ filePath: file.name, content, isFolder: false });
            } catch (err) {
                console.warn(`Could not read file: ${file.name}`);
            }
        }

        if (onUploadFiles) {
            onUploadFiles(fileList);
        }

        e.target.value = '';
    };

    return (
        <div className="ide-window" style={{ minWidth: '250px', maxWidth: '400px' }}>
            {/* Hidden file inputs */}
            <input 
                ref={folderInputRef} 
                type="file" 
                webkitdirectory="" 
                directory="" 
                multiple 
                style={{ display: 'none' }} 
                onChange={handleFolderUpload} 
            />
            <input 
                ref={fileInputRef} 
                type="file" 
                multiple 
                style={{ display: 'none' }} 
                onChange={handleFileUpload} 
            />
            <div className="window-header">
                <h3>
                    <span className="window-title-icon">📁</span>
                    Explorer
                </h3>
                {/* Top-level root actions: create at root */}
                <div className="window-controls" style={{ display: 'flex', gap: '4px' }}>
                    <button
                        className="window-btn"
                        onClick={() => handleStartCreate('', false)}
                        title="New File (root)"
                    >
                        📄
                    </button>
                    <button
                        className="window-btn"
                        onClick={() => handleStartCreate('', true)}
                        title="New Folder (root)"
                    >
                        📁
                    </button>
                    <button
                        className="window-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Files"
                        style={{ color: '#4ec9b0' }}
                    >
                        📤
                    </button>
                    <button
                        className="window-btn"
                        onClick={() => folderInputRef.current?.click()}
                        title="Upload Folder"
                        style={{ color: '#569cd6' }}
                    >
                        📂⬆
                    </button>
                    {onCollapse && (
                        <button
                            className="window-btn"
                            onClick={onCollapse}
                            title="Collapse Explorer"
                            style={{ color: '#999', fontSize: '12px', fontWeight: 'bold' }}
                        >
                            ◀
                        </button>
                    )}
                </div>
            </div>
            <div className="window-content" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="file-tree" style={{ flex: 1, overflow: 'auto' }}>
                    {/* Root-level inline create */}
                    {creatingIn && creatingIn.parentPath === '' && (
                        <div style={{ paddingLeft: '8px' }}>
                            {renderInlineInput()}
                        </div>
                    )}
                    {files.length === 0 && !creatingIn ? (
                        <div className="file-tree-item" style={{ opacity: 0.7 }}>
                            No files yet — upload a folder or create files
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
