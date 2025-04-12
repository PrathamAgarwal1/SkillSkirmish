let editor;

function initEditor() {
    editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        mode: "javascript",
        lineNumbers: true,
        theme: "monokai",
        autofocus: true
    });
    
    document.getElementById('languageSelect').addEventListener('change', (e) => {
        editor.setOption('mode', e.target.value);
    });
    
    // Listen for code changes from other users (via WebSocket)
    // You'll need to implement this based on your WebRTC/WebSocket setup
}

export function getEditorContent() {
    return editor.getValue();
}

export function setEditorContent(content) {
    editor.setValue(content);
}