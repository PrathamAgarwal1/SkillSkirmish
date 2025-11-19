import React, { useState, useEffect } from 'react';
import { FaFolder, FaFolderOpen, FaJs, FaCss3Alt, FaFileAlt, FaTrash, FaPlus, FaFile } from 'react-icons/fa';
import axios from 'axios';

const getFileIcon = (name) => {
    if (name.endsWith('.js')) return <FaJs style={{ color: '#f7df1e' }} />;
    if (name.endsWith('.css')) return <FaCss3Alt style={{ color: '#1572b6' }} />;
    if (name.endsWith('.json')) return <FaFile style={{ color: '#f0db4f' }} />;
    return <FaFileAlt style={{ color: '#ccc' }} />;
};

// This is a new, recursive component to render the tree
const FileTreeNode = ({ file, onFileSelect, onRefresh, projectId, level = 0 }) => {
    const [isOpen, setIsOpen] = useState(level === 0); // Open root by default

    const isFolder = file.isFolder;

    const handleToggleFolder = () => {
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            onFileSelect(file);
        }
    };

    const handleCreate = async (e, isFolder) => {
        e.stopPropagation(); // Stop click from bubbling up to the folder
        const name = prompt(isFolder ? 'Enter folder name:' : 'Enter file name (e.g., app.js):');
        if (!name) return;

        const newPath = file.path === '/' ? `/${name}` : `${file.path}/${name}`;
        
        await axios.post('/api/files', {
            name: name,
            path: newPath,
            projectId: projectId,
            isFolder: isFolder
        });
        setIsOpen(true); // Open the folder to show the new file
        onRefresh();
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete ${file.name}? This will also delete all contents.`)) {
            await axios.delete(`/api/files/${file._id}`);
            onRefresh();
        }
    };

    return (
        <li style={{ paddingLeft: `${level * 15}px` }} className="file-tree-node">
            <div className="file-item" onClick={handleToggleFolder}>
                {isFolder ? (isOpen ? <FaFolderOpen /> : <FaFolder />) : getFileIcon(file.name)}
                <span>{file.name}</span>
                <div className="file-item-actions">
                    {isFolder && (
                        <>
                            <button title="Add File" onClick={(e) => handleCreate(e, false)}><FaFile /></button>
                            <button title="Add Folder" onClick={(e) => handleCreate(e, true)}><FaFolder /></button>
                        </>
                    )}
                    {file.path !== '/' && (
                        <button title="Delete" className="btn-delete-file" onClick={handleDelete}>
                            <FaTrash />
                        </button>
                    )}
                </div>
            </div>
            {isFolder && isOpen && (
                <ul className="file-list">
                    {file.children && file.children.map(child => (
                        <FileTreeNode 
                            key={child._id} 
                            file={child} 
                            onFileSelect={onFileSelect}
                            onRefresh={onRefresh}
                            projectId={projectId}
                            level={level + 1} 
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

// This is the main component that fetches and builds the tree structure
const FileTree = ({ projectId, onFileSelect, onRefresh }) => {
    const [tree, setTree] = useState(null);

    useEffect(() => {
        const fetchFiles = async () => {
            const res = await axios.get(`/api/files/project/${projectId}`);
            // Add a virtual root folder
            const root = { _id: 'root', name: 'Project', path: '/', isFolder: true };
            const files = [root, ...res.data];
            
            // --- Build the tree structure ---
            const fileMap = {};
            files.forEach(file => {
                fileMap[file.path] = { ...file, children: [] };
            });

            const treeData = [];
            files.forEach(file => {
                if (file.path === '/') {
                    treeData.push(fileMap[file.path]);
                } else {
                    const parentPath = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
                    if (fileMap[parentPath]) {
                        fileMap[parentPath].children.push(fileMap[file.path]);
                    }
                }
            });
            setTree(treeData[0]); // Set the root node
        };
        fetchFiles();
    }, [projectId, onRefresh]);

    if (!tree) {
        return <div className="file-tree-panel">Loading files...</div>;
    }

    return (
        <div className="file-tree-panel">
            <h3>File Explorer</h3>
            <ul className="file-list">
                <FileTreeNode 
                    file={tree} 
                    onFileSelect={onFileSelect} 
                    onRefresh={onRefresh} 
                    projectId={projectId}
                />
            </ul>
        </div>
    );
};

export default FileTree;