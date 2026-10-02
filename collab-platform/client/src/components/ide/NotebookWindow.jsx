import React, { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import * as python from '../../runtime/python';
import { parseNotebook, emptyNotebook, newCell, withSource, sourceText, buildOutputs, serialize } from '../../runtime/notebook';

/**
 * Jupyter notebook view that runs cells in the browser with Pyodide (pandas, NumPy, scikit-learn,
 * matplotlib...). Outputs are saved into the .ipynb so they show up when the notebook is published.
 */
const join = (v) => (Array.isArray(v) ? v.join('') : v || '');

// Rich HTML output (e.g. pandas tables) is shown in a script-less sandboxed frame
const HtmlOutput = ({ html }) => {
    const ref = useRef(null);
    const fit = () => {
        const doc = ref.current?.contentDocument;
        if (doc?.body) ref.current.style.height = `${Math.min(doc.body.scrollHeight + 16, 600)}px`;
    };
    const srcDoc = `<!doctype html><style>body{margin:0;font:12px system-ui;color:#ddd;background:#1e1e1e}table{border-collapse:collapse}td,th{border:1px solid #444;padding:3px 8px;text-align:right}th{background:#2d2d30}</style>${html}`;
    return <iframe ref={ref} title="output" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={fit} style={{ width: '100%', border: 'none', height: 60, background: 'var(--gh-1e1e1e)' }} />;
};

const Output = ({ o }) => {
    const pre = { margin: '4px 0', whiteSpace: 'pre-wrap', fontSize: 12, fontFamily: 'ui-monospace, monospace', overflowX: 'auto' };
    if (o.output_type === 'stream') return <pre style={{ ...pre, color: o.name === 'stderr' ? 'var(--gh-d29922)' : 'var(--gh-d4d4d4)' }}>{join(o.text)}</pre>;
    if (o.output_type === 'error') return <pre style={{ ...pre, color: 'var(--gh-f85149)' }}>{join(o.traceback) || `${o.ename}: ${o.evalue}`}</pre>;
    const d = o.data || {};
    if (d['image/png']) return <img alt="figure" src={`data:image/png;base64,${join(d['image/png']).trim()}`} style={{ maxWidth: '100%', background: 'var(--gh-ffffff)', borderRadius: 4, margin: '4px 0' }} />;
    if (d['text/html']) return <HtmlOutput html={join(d['text/html'])} />;
    if (d['text/plain']) return <pre style={{ ...pre, color: 'var(--gh-9cdcfe)' }}>{join(d['text/plain'])}</pre>;
    return null;
};

const CodeArea = ({ value, onChange, onRun, autoFocus }) => {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }
    }, [value]);
    return (
        <textarea
            ref={ref}
            value={value}
            autoFocus={autoFocus}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) { e.preventDefault(); onRun(); }
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const { selectionStart: s, selectionEnd: t } = e.target;
                    onChange(`${value.slice(0, s)}    ${value.slice(t)}`);
                    requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = s + 4; });
                }
            }}
            style={{ width: '100%', resize: 'none', overflow: 'hidden', background: 'var(--gh-1e1e1e)', color: 'var(--gh-d4d4d4)', border: '1px solid var(--gh-3e3e42)', borderRadius: 4, padding: 8, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.45, boxSizing: 'border-box', outline: 'none' }}
        />
    );
};

const NotebookWindow = ({ projectId, file, content, onSave, requirements = [] }) => {
    const [nb, setNb] = useState(() => parseNotebook(content) || emptyNotebook());
    const [dirty, setDirty] = useState(false);
    const [running, setRunning] = useState(null);   // cell id
    const [status, setStatus] = useState('');
    const [editingMd, setEditingMd] = useState(null);
    const [awaitingInput, setAwaitingInput] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [invalid, setInvalid] = useState(false);
    const execCount = useRef(0);
    const nbRef = useRef(nb);
    nbRef.current = nb;

    // Reload when another file is opened or the file changes on the server
    useEffect(() => {
        const parsed = parseNotebook(content);
        setInvalid(!parsed && !!content?.trim());
        setNb(parsed || emptyNotebook());
        setDirty(false);
    }, [file?._id, content]);

    useEffect(() => python.on('input', () => setAwaitingInput(true)), []);
    useEffect(() => python.on('status', (t) => setStatus(t)), []);

    const updateCell = (id, fn) => {
        setNb(n => ({ ...n, cells: n.cells.map(c => (c.id === id ? fn(c) : c)) }));
        setDirty(true);
    };

    const runCell = useCallback(async (cellId) => {
        const cell = nbRef.current.cells.find(c => c.id === cellId);
        if (!cell || cell.cell_type !== 'code') return;
        setRunning(cellId);
        setStatus('Loading Python…');
        const streams = [];
        updateCell(cellId, c => ({ ...c, outputs: [] }));
        const off = python.on('stream', (s) => {
            streams.push({ name: s.name, text: s.text });
            updateCell(cellId, c => ({ ...c, outputs: buildOutputs(streams, null, null) }));
        });
        try {
            await python.syncFromServer(projectId);
            setStatus('Running…');
            const cwd = file?.path?.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
            const { result } = await python.run({ code: sourceText(cell), filename: `${file?.name || 'notebook'} cell`, mode: 'cell', requirements, cwd });
            execCount.current += 1;
            const n = execCount.current;
            updateCell(cellId, c => ({ ...c, execution_count: n, outputs: buildOutputs(streams, result, n) }));
            return result.ok;
        } finally {
            off();
            setRunning(null);
            setAwaitingInput(false);
            setStatus('');
        }
    }, [projectId, file?.name, file?.path, requirements]);

    const runAll = async () => {
        for (const cell of nbRef.current.cells) {
            if (cell.cell_type !== 'code') continue;
            const ok = await runCell(cell.id);
            if (ok === false) break;
        }
    };

    const restart = async () => {
        python.restart();
        execCount.current = 0;
        setStatus('Python restarted');
        setTimeout(() => setStatus(''), 1500);
    };

    const save = useCallback(async () => {
        await onSave(serialize(nbRef.current));
        setDirty(false);
    }, [onSave]);

    const insertAfter = (index, type) => {
        const cell = newCell(type);
        setNb(n => ({ ...n, cells: [...n.cells.slice(0, index + 1), cell, ...n.cells.slice(index + 1)] }));
        if (type === 'markdown') setEditingMd(cell.id);
        setDirty(true);
    };

    const move = (index, delta) => {
        setNb(n => {
            const cells = [...n.cells];
            const j = index + delta;
            if (j < 0 || j >= cells.length) return n;
            [cells[index], cells[j]] = [cells[j], cells[index]];
            return { ...n, cells };
        });
        setDirty(true);
    };

    const remove = (id) => { setNb(n => ({ ...n, cells: n.cells.filter(c => c.id !== id) })); setDirty(true); };

    const sendInput = () => {
        python.provideInput(inputValue);
        setInputValue('');
        setAwaitingInput(false);
    };

    const btn = { background: 'var(--gh-3c3c3c)', color: 'var(--gh-cccccc)', border: '1px solid var(--gh-555555)', borderRadius: 3, padding: '3px 10px', fontSize: 12, cursor: 'pointer' };
    const small = { ...btn, padding: '1px 6px', fontSize: 11 };

    return (
        <div className="ide-window" style={{ flex: 2, minWidth: 0 }}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); e.stopPropagation(); save(); } }}>
            <div className="window-header" style={{ cursor: 'default' }}>
                <h3>
                    <span className="window-title-icon">📓</span>
                    {file?.name}
                    {dirty && <span style={{ color: 'var(--gh-f48771)' }}>●</span>}
                    <span style={{ fontSize: 11, color: 'var(--gh-8b949e)', fontWeight: 400 }}>Python in your browser</span>
                </h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {status && <span style={{ fontSize: 11, color: 'var(--gh-d29922)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>}
                    <button style={btn} onClick={runAll} disabled={!!running} title="Run every cell from the top">⏵⏵ Run all</button>
                    {running
                        ? <button style={{ ...btn, background: 'var(--gh-c74c3c)', color: 'var(--gh-ffffff)' }} onClick={() => python.stop()}>◼ Stop</button>
                        : <button style={btn} onClick={restart} title="Clear all variables">↻ Restart</button>}
                    <button style={{ ...btn, background: 'var(--gh-0e639c)', color: 'var(--gh-ffffff)' }} onClick={save} title="Save (Ctrl+S)">💾 Save</button>
                </div>
            </div>
            <div className="window-content" style={{ padding: '12px 16px' }}>
                {invalid && <div style={{ color: 'var(--gh-f85149)', fontSize: 12, marginBottom: 8 }}>This file isn't a valid notebook. Saving will replace it with the cells below.</div>}
                {nb.cells.map((cell, i) => (
                    <div key={cell.id || i} style={{ marginBottom: 14, borderLeft: `3px solid ${running === cell.id ? 'var(--gh-d29922)' : 'transparent'}`, paddingLeft: 8 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: 'var(--gh-8b949e)', fontFamily: 'monospace', width: 52 }}>
                                {cell.cell_type === 'code' ? `[${running === cell.id ? '*' : cell.execution_count ?? ' '}]` : 'md'}
                            </span>
                            {cell.cell_type === 'code' && <button style={small} onClick={() => runCell(cell.id)} disabled={!!running} title="Run (Shift+Enter)">▶</button>}
                            {cell.cell_type === 'markdown' && <button style={small} onClick={() => setEditingMd(editingMd === cell.id ? null : cell.id)}>{editingMd === cell.id ? 'Done' : 'Edit'}</button>}
                            <span style={{ flex: 1 }} />
                            <button style={small} onClick={() => move(i, -1)} title="Move up">↑</button>
                            <button style={small} onClick={() => move(i, 1)} title="Move down">↓</button>
                            <button style={small} onClick={() => insertAfter(i, 'code')} title="Add code cell below">+ Code</button>
                            <button style={small} onClick={() => insertAfter(i, 'markdown')} title="Add text cell below">+ Text</button>
                            <button style={{ ...small, color: 'var(--gh-f85149)' }} onClick={() => remove(cell.id)} title="Delete cell">✕</button>
                        </div>
                        {cell.cell_type === 'code' && (
                            <>
                                <CodeArea
                                    value={sourceText(cell)}
                                    onChange={(v) => updateCell(cell.id, c => withSource(c, v))}
                                    onRun={() => !running && runCell(cell.id)}
                                />
                                <div style={{ paddingLeft: 4 }}>
                                    {(cell.outputs || []).map((o, k) => <Output key={k} o={o} />)}
                                    {awaitingInput && running === cell.id && (
                                        <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
                                            <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendInput()}
                                                placeholder="input()" style={{ flex: 1, background: 'var(--gh-1e1e1e)', color: 'var(--gh-dddddd)', border: '1px solid var(--gh-0e639c)', borderRadius: 3, padding: '4px 8px', fontFamily: 'monospace' }} />
                                            <button style={btn} onClick={sendInput}>Send</button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {cell.cell_type === 'markdown' && (editingMd === cell.id
                            ? <CodeArea value={sourceText(cell)} autoFocus onChange={(v) => updateCell(cell.id, c => withSource(c, v))} onRun={() => setEditingMd(null)} />
                            : <div className="nb-markdown" onDoubleClick={() => setEditingMd(cell.id)} style={{ color: 'var(--gh-dddddd)', fontSize: 14, lineHeight: 1.55, cursor: 'text' }}>
                                <Markdown>{sourceText(cell) || '*Empty text cell. Double-click to edit.*'}</Markdown>
                            </div>)}
                        {cell.cell_type === 'raw' && <pre style={{ color: 'var(--gh-8b949e)' }}>{sourceText(cell)}</pre>}
                    </div>
                ))}
                {nb.cells.length === 0 && <button style={btn} onClick={() => insertAfter(-1, 'code')}>+ Add a code cell</button>}
                <div style={{ fontSize: 11, color: 'var(--gh-6e7681)', marginTop: 8 }}>
                    Shift+Enter runs a cell · Runs with Pyodide in your browser: pandas, NumPy, scikit-learn, SciPy, matplotlib and pure-Python packages work; PyTorch/TensorFlow don't.
                </div>
            </div>
        </div>
    );
};

export default NotebookWindow;
