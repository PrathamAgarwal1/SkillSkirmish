import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { socket } from '../../socket';

const CollaborativeEditor = ({ file, onMount }) => {
    const editorRef = useRef(null);

    useEffect(() => {
        if (!editorRef.current || !file) {
            return;
        }

        const ydoc = new Y.Doc();
        
        const sendUpdate = (update, origin) => {
            if (origin !== socket) {
                socket.emit('doc-update', file._id, update);
            }
        };
        ydoc.on('update', sendUpdate);

        const handleRemoteUpdate = (update) => {
            Y.applyUpdate(ydoc, new Uint8Array(update), socket);
        };
        socket.on('doc-update', handleRemoteUpdate);

        socket.emit('join-doc', file._id);

        const ytext = ydoc.getText('monaco');
        ytext.insert(0, file.content);
        
        const binding = new MonacoBinding(
            ytext,
            editorRef.current.getModel(),
            new Set([editorRef.current])
        );

        return () => {
            socket.emit('leave-doc', file._id);
            socket.off('doc-update', handleRemoteUpdate);
            ydoc.off('update', sendUpdate);
            binding.destroy();
            ydoc.destroy();
        };

    }, [file]);

    // --- THIS IS THE FIX ---
    // The 'monaco' argument has been removed
    const handleEditorDidMount = (editor) => {
    // --- END OF FIX ---
        editorRef.current = editor;
        onMount(editor);
    };

    return (
        <Editor
            height="60vh"
            theme="vs-dark"
            key={file ? file._id : 'empty'}
            defaultLanguage={file ? file.name.split('.').pop() : 'javascript'}
            onMount={handleEditorDidMount}
        />
    );
};

export default CollaborativeEditor;