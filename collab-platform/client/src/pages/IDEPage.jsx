import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import FileTree from '../components/ide/FileTree';

const IDEPage = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [editor, setEditor] = useState(null);
    const [consoleOutput, setConsoleOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const [files, setFiles] = useState([]);
    const [currentFile, setCurrentFile] = useState(null);
    
    // --- THIS IS THE FIX ---
    // A state variable to trigger a refresh in the FileTree
    const [refreshTree, setRefreshTree] = useState(0);
    // --- END OF FIX ---

    const handleFileSelect = useCallback((file) => {
        setCurrentFile(file);
    }, []);

    const fetchFiles = useCallback(async () => {
        try {
            const res = await axios.get(`/api/files/project/${projectId}`);
            setFiles(res.data);
            if (res.data.length > 0) {
                const firstFile = res.data.find(f => !f.isFolder);
                if (firstFile) handleFileSelect(firstFile);
            }
        } catch (err) {
            console.error("Failed to fetch files", err);
        }
    }, [projectId, handleFileSelect]);

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const res = await axios.get(`/api/projects/${projectId}`);
                setProject(res.data);
            } catch (err) {
                console.error("Failed to fetch project", err);
            }
        };
        
        fetchProject();
        fetchFiles();
    }, [projectId, fetchFiles]);

    const handleSaveCode = async () => {
        if (!editor || !currentFile) return;
        
        const content = editor.getValue();
        try {
            await axios.put(`/api/files/${currentFile._id}`, { content });
            alert("File saved!");
        } catch (err) {
            console.error("Failed to save file:", err);
            alert("Error saving file.");
        }
    };

    const handleRunCode = async () => {
        if (!editor) return;
        
        setIsRunning(true);
        setConsoleOutput('Running code...');
        
        const code = editor.getValue();
        try {
            const res = await axios.post('/api/execute', { code });
            setConsoleOutput(res.data.output);
        } catch (err) {
            console.error("Execution error:", err);
            setConsoleOutput(err.response?.data?.output || 'An unexpected error occurred.');
        } finally {
            setIsRunning(false);
        }
    };

    if (!project) {
        return <div className="container"><h1>Loading Project...</h1></div>;
    }

    return (
        <div className="container ide-layout">
            <FileTree 
                files={files} 
                onFileSelect={handleFileSelect}
                projectId={projectId} // Pass projectId to FileTree
                // --- THIS IS THE FIX ---
                // Pass the refresh function to the FileTree component
                onRefresh={() => setRefreshTree(prev => prev + 1)}
                // This key ensures the FileTree itself re-fetches when state changes
                key={refreshTree} 
                // --- END OF FIX ---
            />

            <div className="main-ide-area">
                <div className="ide-actions">
                    <button className="btn" onClick={handleSaveCode} disabled={!currentFile}>
                        Save Code
                    </button>
                    <button className="btn" onClick={handleRunCode} disabled={isRunning || !currentFile}>
                        {isRunning ? 'Running...' : '▶ Run Code'}
                    </button>
                </div>
                
                <div className="editor-container">
                    <Editor
                        height="60vh"
                        theme="vs-dark"
                        defaultLanguage="javascript"
                        key={currentFile ? currentFile._id : 'empty'}
                        value={currentFile ? currentFile.content : 'Select a file to start editing.'}
                        onMount={(editorInstance) => setEditor(editorInstance)}
                    />
                </div>
                
                <div className="console-panel">
                    <h3>Console</h3>
                    <pre>{consoleOutput}</pre>
                </div>
            </div>
        </div>
    );
};

export default IDEPage;