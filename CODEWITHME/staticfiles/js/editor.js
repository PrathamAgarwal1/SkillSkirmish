document.addEventListener('DOMContentLoaded', () => {
    const editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
      mode: 'javascript',
      theme: 'material-darker',
      lineNumbers: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      showHint: true,
      extraKeys: { 'Ctrl-Space': 'autocomplete' },
    });
  
    const languageSelect = document.getElementById('languageSelect');
    const runCodeBtn = document.getElementById('runCode');
    const saveCodeBtn = document.getElementById('saveCode');
    const shareCodeBtn = document.getElementById('shareCode');
  
    // Language selection
    languageSelect.addEventListener('change', () => {
      const mode = languageSelect.value;
      editor.setOption('mode', mode);
    });
  
    // Run code (placeholder for execution)
    runCodeBtn.addEventListener('click', () => {
      const code = editor.getValue();
      const outputArea = document.querySelector('.output-area');
      try {
        if (languageSelect.value === 'javascript') {
          const result = eval(code); // Note: eval is unsafe; replace with sandbox for production
          outputArea.textContent = result || 'Executed';
        } else {
          outputArea.textContent = 'Execution not supported for this language';
        }
      } catch (err) {
        outputArea.textContent = `Error: ${err.message}`;
      }
    });
  
    // Save code (placeholder for AJAX)
    saveCodeBtn.addEventListener('click', () => {
      const code = editor.getValue();
      fetch(`/room/${ROOM_ID}/save/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': CSRF_TOKEN,
        },
        body: JSON.stringify({ code_content: code }),
      })
        .then(response => response.json())
        .then(data => alert(data.message || 'Code saved'))
        .catch(err => console.error('Save error:', err));
    });
  
    // Share code
    shareCodeBtn.addEventListener('click', () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url)
        .then(() => alert('Room URL copied to clipboard'))
        .catch(err => console.error('Copy error:', err));
    });
  });