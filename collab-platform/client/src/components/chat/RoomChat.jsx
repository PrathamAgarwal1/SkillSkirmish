// components/chat/RoomChat.jsx — room chat with threads, code snippets (syntax highlighted) and @mentions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { socket } from '../../socket';
import './RoomChat.css';

const MAX_LENGTH = 4000;
const USER_COLORS = ['var(--gh-3fb950)', 'var(--gh-58a6ff)', 'var(--gh-d2a8ff)', 'var(--gh-f0883e)', 'var(--gh-ff7b72)', 'var(--gh-79c0ff)', 'var(--gh-e3b341)', 'var(--gh-56d4dd)'];
const colorFor = (id) => {
    let h = 0;
    for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) | 0;
    return USER_COLORS[Math.abs(h) % USER_COLORS.length];
};

const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
};

const isSystem = (m) => m.sender?.username === 'System' || !m.sender?._id;

/* ---------- message text: ```code```, `inline code`, @mentions, links ---------- */

const CodeBlock = ({ lang, code }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    };
    return (
        <div className="rc-code">
            <div className="rc-code-bar">
                <span>{lang || 'code'}</span>
                <button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <SyntaxHighlighter
                language={(lang || 'text').toLowerCase()}
                style={oneDark}
                customStyle={{ margin: 0, padding: '8px 10px', fontSize: 12, background: 'var(--gh-0b0f14)', borderRadius: 0 }}
                codeTagProps={{ style: { fontFamily: "'JetBrains Mono', monospace" } }}
            >
                {code.replace(/\n$/, '')}
            </SyntaxHighlighter>
        </div>
    );
};

const INLINE_RE = /(`[^`\n]+`)|(@[A-Za-z0-9_.-]{2,40})|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

const InlineText = ({ text, selfName }) => {
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(INLINE_RE)) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        const [full, code, mention, url] = m;
        const key = `${m.index}-${full}`;
        if (code) parts.push(<code key={key} className="rc-inline-code">{code.slice(1, -1)}</code>);
        else if (mention) {
            const self = selfName && mention.slice(1).toLowerCase() === selfName.toLowerCase();
            parts.push(<span key={key} className={`rc-mention ${self ? 'self' : ''}`}>{mention}</span>);
        } else if (url) parts.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer">{url}</a>);
        last = m.index + full.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
};

const MessageText = ({ text, selfName }) => {
    const blocks = [];
    const re = /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(```|$)/g;
    let last = 0;
    for (const m of String(text || '').matchAll(re)) {
        if (m.index > last) blocks.push({ type: 'text', value: text.slice(last, m.index) });
        blocks.push({ type: 'code', lang: m[1], value: m[2] });
        last = m.index + m[0].length;
        if (!m[0]) break;
    }
    if (last < String(text || '').length) blocks.push({ type: 'text', value: text.slice(last) });
    return blocks.map((b, i) => (b.type === 'code'
        ? <CodeBlock key={i} lang={b.lang} code={b.value} />
        : <span key={i} className="rc-text"><InlineText text={b.value} selfName={selfName} /></span>));
};

/* ---------- composer: Enter to send, Shift+Enter for a new line, @ to mention, </> for code ---------- */

const Composer = ({ onSend, members, currentUser, placeholder, autoFocus }) => {
    const [text, setText] = useState('');
    const [mention, setMention] = useState(null); // { start, query, index }
    const ref = useRef(null);

    const suggestions = useMemo(() => {
        if (!mention) return [];
        return members
            .filter(u => u?.username && String(u._id) !== String(currentUser?._id) && u.username.toLowerCase().startsWith(mention.query))
            .slice(0, 6);
    }, [mention, members, currentUser]);

    // Grow with the text, up to a limit
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, [text]);

    const detectMention = (value, caret) => {
        const m = value.slice(0, caret).match(/(^|[^\w@])@([A-Za-z0-9_.-]{0,40})$/);
        setMention(m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase(), index: 0 } : null);
    };

    const setTextAndCaret = (value, caret) => {
        setText(value);
        requestAnimationFrame(() => {
            const el = ref.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    };

    const pick = (user) => {
        const caret = ref.current.selectionStart;
        const insert = `@${user.username} `;
        setTextAndCaret(text.slice(0, mention.start) + insert + text.slice(caret), mention.start + insert.length);
        setMention(null);
    };

    const insertCode = () => {
        const el = ref.current;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = text.slice(start, end);
        const before = start > 0 && !text.slice(0, start).endsWith('\n') ? '\n' : '';
        const block = `${before}\`\`\`js\n${selected}\n\`\`\`\n`;
        // Caret goes inside the block (after the selection, if any)
        setTextAndCaret(text.slice(0, start) + block + text.slice(end), start + before.length + 6 + selected.length);
    };

    const send = () => {
        const body = text.trim();
        if (!body || body.length > MAX_LENGTH) return;
        onSend(body);
        setText('');
        setMention(null);
    };

    const onKeyDown = (e) => {
        if (mention && suggestions.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setMention(m => ({ ...m, index: (m.index + step + suggestions.length) % suggestions.length }));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick(suggestions[mention.index] || suggestions[0]);
                return;
            }
            if (e.key === 'Escape') { setMention(null); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            // Inside an unfinished ``` block, Enter adds a line instead of sending
            const fences = (text.slice(0, e.target.selectionStart).match(/```/g) || []).length;
            if (fences % 2 === 1) return;
            e.preventDefault();
            send();
        }
    };

    const over = text.length > MAX_LENGTH;

    return (
        <div className="rc-composer">
            {mention && suggestions.length > 0 && (
                <ul className="rc-suggest" role="listbox" aria-label="Mention someone">
                    {suggestions.map((u, i) => (
                        <li
                            key={u._id}
                            role="option"
                            aria-selected={i === mention.index}
                            className={i === mention.index ? 'active' : ''}
                            onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                        >
                            <span className="rc-dot" style={{ background: colorFor(u._id) }} />@{u.username}
                        </li>
                    ))}
                </ul>
            )}
            <div className="rc-input-row">
                <button type="button" className="rc-tool" onClick={insertCode} title="Insert a code block (```)">{'</>'}</button>
                <textarea
                    ref={ref}
                    rows={1}
                    value={text}
                    autoFocus={autoFocus}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(e) => { setText(e.target.value); detectMention(e.target.value, e.target.selectionStart); }}
                    onClick={(e) => detectMention(text, e.target.selectionStart)}
                    onKeyDown={onKeyDown}
                    onBlur={() => setTimeout(() => setMention(null), 100)}
                />
                <button type="button" className="rc-send" onClick={send} disabled={!text.trim() || over} title="Send (Enter)">➤</button>
            </div>
            <div className="rc-hint">
                {over
                    ? <span style={{ color: 'var(--gh-f85149)' }}>{text.length}/{MAX_LENGTH} characters, too long to send</span>
                    : <>Enter to send · Shift+Enter new line · <b>@</b> mention · <b>```</b> code</>}
            </div>
        </div>
    );
};

/* ---------- one message ---------- */

const MessageRow = ({ message, currentUser, onReply, compact }) => {
    if (isSystem(message)) {
        return <div className="rc-system">{message.text}</div>;
    }
    const mine = String(message.sender?._id) === String(currentUser?._id);
    const mentionsMe = (message.mentions || []).some(id => String(id) === String(currentUser?._id));
    return (
        <div className={`rc-msg ${mentionsMe ? 'mentioned' : ''}`}>
            <div className="rc-msg-head">
                <span className="rc-author" style={{ color: mine ? 'var(--gh-f0883e)' : colorFor(message.sender?._id) }}>{mine ? 'You' : message.sender?.username || 'Unknown'}</span>
                <span className="rc-time" title={message.createdAt ? new Date(message.createdAt).toLocaleString() : ''}>{formatTime(message.createdAt)}</span>
                {onReply && message._id && <button className="rc-reply-btn" onClick={() => onReply(message)} title="Reply in thread">↩ Reply</button>}
            </div>
            <div className="rc-body"><MessageText text={message.text} selfName={currentUser?.username} /></div>
            {!compact && message.replyCount > 0 && (
                <button className="rc-thread-link" onClick={() => onReply(message)}>
                    💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                    {message.lastReplyAt && <span> · last {formatTime(message.lastReplyAt)}</span>}
                </button>
            )}
        </div>
    );
};

/* ---------- thread panel ---------- */

const Thread = ({ roomId, parent, currentUser, members, onBack }) => {
    const [data, setData] = useState({ parent, replies: [] });
    const [error, setError] = useState('');
    const endRef = useRef(null);

    useEffect(() => {
        axios.get(`/api/rooms/${roomId}/messages/${parent._id}/replies`)
            .then(res => setData(res.data))
            .catch(err => setError(err.response?.data?.msg || err.message));
        const onMessage = (msg) => {
            if (String(msg.parent) !== String(parent._id)) return;
            setData(d => (d.replies.some(r => r._id === msg._id) ? d : { ...d, replies: [...d.replies, msg] }));
        };
        socket.on('message', onMessage);
        return () => socket.off('message', onMessage);
    }, [roomId, parent._id]);

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [data.replies.length]);

    return (
        <div className="rc-thread">
            <div className="rc-thread-head">
                <button onClick={onBack} aria-label="Back to the chat">←</button>
                <span>Thread</span>
            </div>
            <div className="rc-log">
                <MessageRow message={data.parent} currentUser={currentUser} compact />
                <div className="rc-divider">{data.replies.length} {data.replies.length === 1 ? 'reply' : 'replies'}</div>
                {error && <div className="rc-system" style={{ color: 'var(--gh-f85149)' }}>{error}</div>}
                {data.replies.map(r => <MessageRow key={r._id} message={r} currentUser={currentUser} compact />)}
                <div ref={endRef} />
            </div>
            <Composer
                members={members}
                currentUser={currentUser}
                placeholder="Reply in thread…"
                autoFocus
                onSend={(text) => socket.emit('chatMessage', { roomId, text, parentId: parent._id })}
            />
        </div>
    );
};

/* ---------- the chat column ---------- */

const RoomChat = ({ roomId, roomName, messages, setMessages, members, currentUser }) => {
    const [thread, setThread] = useState(null);
    const endRef = useRef(null);
    const logRef = useRef(null);

    // Reply counts update live
    useEffect(() => {
        const onThread = ({ parentId, replyCount, lastReplyAt }) => {
            setMessages(list => list.map(m => (String(m._id) === parentId ? { ...m, replyCount, lastReplyAt } : m)));
        };
        socket.on('message-thread', onThread);
        return () => socket.off('message-thread', onThread);
    }, [setMessages]);

    // Stick to the bottom unless the reader scrolled up to read history
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        const last = messages[messages.length - 1];
        if (nearBottom || String(last?.sender?._id) === String(currentUser?._id)) endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, currentUser]);

    if (thread) {
        return <Thread roomId={roomId} parent={thread} currentUser={currentUser} members={members} onBack={() => setThread(null)} />;
    }

    return (
        <div className="rc-chat">
            <div className="rc-log" ref={logRef}>
                <div className="rc-system">Connected to {roomName}. Mention teammates with @, share code with ```.</div>
                {messages.map((m, i) => <MessageRow key={m._id || `sys-${i}`} message={m} currentUser={currentUser} onReply={setThread} />)}
                <div ref={endRef} />
            </div>
            <Composer
                members={members}
                currentUser={currentUser}
                placeholder={`Message ${roomName}`}
                onSend={(text) => socket.emit('chatMessage', { roomId, text })}
            />
        </div>
    );
};

export default RoomChat;
