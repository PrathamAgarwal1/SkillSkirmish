// runtime/notebook.js — helpers for Jupyter notebooks (.ipynb, nbformat 4) run with Pyodide.

export const sourceText = (cell) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source || '');

/** nbformat stores multi-line strings as arrays of lines */
const toLines = (text) => {
    const parts = String(text ?? '').split('\n');
    const lines = parts.map((l, i) => (i < parts.length - 1 ? `${l}\n` : l));
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
};

export const parseNotebook = (text) => {
    try {
        const nb = JSON.parse(text || '{}');
        if (!Array.isArray(nb.cells)) throw new Error('not a notebook');
        // Older notebooks (nbformat < 4.5) have no cell ids; the editor needs them
        const seen = new Set();
        nb.cells = nb.cells.map((c) => {
            const id = c.id && !seen.has(c.id) ? c.id : newCell(c.cell_type === 'code' ? 'code' : 'markdown').id;
            seen.add(id);
            return { ...c, id };
        });
        return nb;
    } catch {
        return null;
    }
};

export const emptyNotebook = () => ({
    cells: [newCell('code')],
    metadata: { kernelspec: { name: 'python3', display_name: 'Python 3 (Pyodide)', language: 'python' }, language_info: { name: 'python' } },
    nbformat: 4,
    nbformat_minor: 5
});

let counter = 0;
export function newCell(type = 'code', source = '') {
    const id = `c${Date.now().toString(36)}${(counter++).toString(36)}`;
    return type === 'code'
        ? { id, cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: toLines(source) }
        : { id, cell_type: 'markdown', metadata: {}, source: toLines(source) };
}

export const withSource = (cell, text) => ({ ...cell, source: toLines(text) });

/** Output list for a cell from what the run produced: streamed text + result + figures. */
export const buildOutputs = (streams, result, executionCount) => {
    const outputs = [];
    for (const s of streams) {
        const last = outputs[outputs.length - 1];
        if (last && last.output_type === 'stream' && last.name === s.name) last.text = toLines(last.text.join('') + s.text);
        else outputs.push({ output_type: 'stream', name: s.name, text: toLines(s.text) });
    }
    if (result?.ok && result.value) {
        const data = {};
        for (const [mime, value] of Object.entries(result.value)) data[mime] = mime.startsWith('image/png') ? value : toLines(value);
        outputs.push({ output_type: 'execute_result', execution_count: executionCount, data, metadata: {} });
    }
    for (const png of result?.figures || []) {
        outputs.push({ output_type: 'display_data', data: { 'image/png': png, 'text/plain': ['<Figure>'] }, metadata: {} });
    }
    if (result && !result.ok && result.ename !== 'Restarted') {
        outputs.push({ output_type: 'error', ename: result.ename || 'Error', evalue: result.evalue || '', traceback: toLines(result.traceback || '') });
    }
    return outputs;
};

export const serialize = (nb) => `${JSON.stringify(nb, null, 1)}\n`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const join = (v) => (Array.isArray(v) ? v.join('') : v || '');

/** Static HTML for a notebook with its saved outputs (for publishing). Markdown is rendered by the caller. */
export const notebookHtml = (nb, title, renderMarkdown) => {
    const cells = nb.cells.map((cell) => {
        if (cell.cell_type === 'markdown') return `<div class="md">${renderMarkdown(sourceText(cell))}</div>`;
        if (cell.cell_type !== 'code') return '';
        const outputs = (cell.outputs || []).map((o) => {
            if (o.output_type === 'stream') return `<pre class="out ${o.name}">${escapeHtml(join(o.text))}</pre>`;
            if (o.output_type === 'error') return `<pre class="out err">${escapeHtml(join(o.traceback) || `${o.ename}: ${o.evalue}`)}</pre>`;
            const d = o.data || {};
            if (d['image/png']) return `<img class="out" src="data:image/png;base64,${join(d['image/png']).trim()}">`;
            if (d['text/html']) return `<div class="out html">${join(d['text/html'])}</div>`;
            if (d['text/plain']) return `<pre class="out">${escapeHtml(join(d['text/plain']))}</pre>`;
            return '';
        }).join('');
        return `<div class="cell"><pre class="code">${escapeHtml(sourceText(cell))}</pre>${outputs}</div>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1f2328;line-height:1.5}
.code{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px;overflow:auto;font-size:13px}
.out{margin:6px 0 18px;overflow:auto;font-size:13px}pre.out{white-space:pre-wrap}.err{color:#cf222e}.stderr{color:#9a6700}
img.out{max-width:100%}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d0d7de;padding:4px 8px}
nav a{color:#0969da}</style></head><body><nav><a href="./">← All notebooks</a></nav><h1>${escapeHtml(title)}</h1>
${cells}</body></html>`;
};
