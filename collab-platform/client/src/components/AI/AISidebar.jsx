import React, { useState, useRef, useCallback, useContext, useEffect } from 'react';
import axios from 'axios';
import ChatWindow from './ChatWindow';
import AuthContext from '../../context/AuthContext';
import './AISidebar.css';

const AISidebar = () => {
    const { isAuthenticated } = useContext(AuthContext);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Draggable + Resizable state
    const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 60 });
    const [size, setSize] = useState({ width: 400, height: 520 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);

    const windowRef = useRef(null);
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const popoutWindowRef = useRef(null);

    /* --- Add Explanation (called from Editor) --- */
    const addExplanation = useCallback((code, language) => {
        setIsOpen(true);
        setIsMinimized(false);
        const userMessage = {
            role: 'user',
            content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        axios.post('/api/ai/explain', { code, language })
            .then(res => {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: res.data.explanation
                }]);
            })
            .catch(err => {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `⚠️ **Error:** ${err.response?.data?.msg || 'Failed to explain code.'}`
                }]);
            })
            .finally(() => setIsLoading(false));
    }, []);

    // Expose globally for editor integration
    useEffect(() => {
        if (!isAuthenticated) return;
        window.__aiSidebar = { addExplanation, open: () => { setIsOpen(true); setIsMinimized(false); } };
        return () => { delete window.__aiSidebar; };
    }, [addExplanation, isAuthenticated]);

    /* --- Drag Logic --- */
    const handleDragStart = (e) => {
        if (e.target.closest('.ai-header-actions')) return;
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = useCallback((e) => {
        if (isDragging) {
            const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y));
            setPosition({ x: newX, y: newY });
        }
        if (isResizing) {
            const deltaX = e.clientX - resizeStartRef.current.x;
            const deltaY = e.clientY - resizeStartRef.current.y;
            const newWidth = Math.max(280, resizeStartRef.current.width + deltaX);
            const newHeight = Math.max(250, resizeStartRef.current.height + deltaY);
            setSize({ width: newWidth, height: newHeight });
        }
    }, [isDragging, isResizing, dragOffset]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.userSelect = '';
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    /* --- Resize Logic --- */
    const handleResizeStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height
        };
    };

    /* --- Pop Out to Fully Functional New Window --- */
    const handlePopOut = () => {
        const serializedMessages = JSON.stringify(messages);
        const token = localStorage.getItem('token') || '';
        // Use full server URL since pop-out window is about:blank (no Vite proxy)
        const serverUrl = (import.meta.env.VITE_SERVER_URL || 'http://localhost:5000') + '/api/ai/chat';

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Assistant</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Outfit:wght@600;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{--bg:#0d1117;--bg2:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--blue:#58a6ff;--green:#3fb950;--purple:#bc8cff;--pink:#ff7b72;}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;height:100vh;display:flex;flex-direction:column;}
#header{padding:12px 16px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;}
#header h2{font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;color:#fff;}
#messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}
#messages::-webkit-scrollbar{width:6px;}
#messages::-webkit-scrollbar-track{background:transparent;}
#messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
.msg{display:flex;flex-direction:column;max-width:90%;animation:fadeIn .25s ease;}
.msg.user{align-self:flex-end;}
.msg.assistant{align-self:flex-start;}
.msg-label{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}
.msg.user .msg-label{color:var(--blue);text-align:right;}
.msg.assistant .msg-label{color:var(--green);}
.msg-body{padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;}
.msg.user .msg-body{background:linear-gradient(135deg,rgba(88,166,255,0.15),rgba(88,166,255,0.25));border:1px solid rgba(88,166,255,0.3);border-bottom-right-radius:2px;}
.msg.assistant .msg-body{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-bottom-left-radius:2px;}
.msg-body code{background:rgba(110,118,129,0.15);color:var(--blue);padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:12px;}
.msg-body strong{color:var(--purple);}
#input-area{padding:12px 14px;border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0;display:flex;gap:8px;align-items:flex-end;}
#input-area textarea{flex:1;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:8px 12px;font-size:12.5px;font-family:'Inter',sans-serif;resize:none;min-height:38px;max-height:120px;line-height:1.4;outline:none;transition:border-color .2s;}
#input-area textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(88,166,255,0.1);}
#input-area textarea::placeholder{color:var(--muted);opacity:.6;}
#send-btn{width:38px;height:38px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;background:linear-gradient(135deg,var(--blue),#2f81f7);color:#fff;flex-shrink:0;transition:all .2s;}
#send-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 16px rgba(88,166,255,0.35);}
#send-btn:disabled{opacity:.3;cursor:not-allowed;}
.typing{display:flex;align-items:center;gap:8px;padding:10px 14px;color:var(--green);font-family:'JetBrains Mono',monospace;font-size:11px;}
.dots{display:flex;gap:3px;}
.dots span{width:5px;height:5px;background:var(--green);border-radius:50%;animation:bounce 1.4s ease-in-out infinite;}
.dots span:nth-child(2){animation-delay:.2s;}
.dots span:nth-child(3){animation-delay:.4s;}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
@keyframes bounce{0%,80%,100%{transform:scale(.6);opacity:.4;}40%{transform:scale(1);opacity:1;}}
</style>
</head>
<body>
<div id="header"><span style="font-size:18px">🤖</span><h2>AI Assistant</h2></div>
<div id="messages"></div>
<div id="input-area">
<textarea id="chat-input" placeholder="Ask about code... (Enter to send)" rows="1"></textarea>
<button id="send-btn" title="Send">&#10148;</button>
</div>
<script>
const TOKEN = ${JSON.stringify(token)};
const API = '${serverUrl}';
let msgs = ${serializedMessages};
let loading = false;
const box = document.getElementById('messages');
const inp = document.getElementById('chat-input');
const btn = document.getElementById('send-btn');
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function render(){
    box.innerHTML='';
    msgs.forEach(m=>{const d=document.createElement('div');d.className='msg '+m.role;d.innerHTML='<div class="msg-label">'+(m.role==='user'?'You':'\\u2728 AI Assistant')+'</div><div class="msg-body">'+esc(m.content)+'</div>';box.appendChild(d);});
    if(loading){const t=document.createElement('div');t.className='typing';t.innerHTML='<div class="dots"><span></span><span></span><span></span></div><span>AI is thinking...</span>';box.appendChild(t);}
    box.scrollTop=box.scrollHeight;
}
async function send(){
    const t=inp.value.trim();if(!t||loading)return;
    msgs.push({role:'user',content:t});inp.value='';inp.style.height='auto';loading=true;btn.disabled=true;render();
    try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':TOKEN},body:JSON.stringify({messages:msgs.slice(-20)})});const d=await r.json();msgs.push({role:r.ok?'assistant':'assistant',content:r.ok?d.response:'Error: '+(d.msg||'Failed')});}
    catch(e){msgs.push({role:'assistant',content:'Error: '+e.message});}
    loading=false;btn.disabled=false;render();inp.focus();
}
inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,120)+'px';});
btn.addEventListener('click',send);
render();inp.focus();
</script>
</body>
</html>`;

        const newWindow = window.open('', '_blank', 'width=480,height=640,scrollbars=yes');
        if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
            popoutWindowRef.current = newWindow;
        }
    };

    /* --- Send Message --- */
    const handleSendMessage = async (text) => {
        const userMessage = { role: 'user', content: text };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setIsLoading(true);

        try {
            const contextMessages = updatedMessages.slice(-20).map(m => ({
                role: m.role,
                content: m.content
            }));
            const response = await axios.post('/api/ai/chat', { messages: contextMessages });
            setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
        } catch (err) {
            const errorMsg = err.response?.data?.msg || 'Failed to get response. Please try again.';
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ **Error:** ${errorMsg}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearChat = () => setMessages([]);

    // AFTER all hooks — conditional return
    if (!isAuthenticated) return null;

    return (
        <>
            {/* Floating AI Button */}
            <button
                className={`ai-floating-btn ${isOpen ? 'sidebar-open' : ''}`}
                onClick={() => { setIsOpen(!isOpen); if (!isOpen) setIsMinimized(false); }}
                title={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
            >
                {isOpen ? '✕' : '🤖'}
            </button>

            {/* Floating Window */}
            {isOpen && (
                <div
                    ref={windowRef}
                    className={`ai-floating-window ${isMinimized ? 'minimized' : ''}`}
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px)`,
                        width: isMinimized ? '280px' : `${size.width}px`,
                        height: isMinimized ? '44px' : `${size.height}px`,
                        transition: (isDragging || isResizing) ? 'none' : 'width 0.2s, height 0.2s',
                        cursor: isDragging ? 'grabbing' : 'default',
                    }}
                >
                    {/* Title Bar — drag handle */}
                    <div
                        className="ai-window-titlebar"
                        onMouseDown={handleDragStart}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                        <span className="ai-window-title">
                            🤖 AI Assistant
                        </span>
                        <div className="ai-header-actions">
                            <button className="ai-header-btn" onClick={handlePopOut} title="Pop out to new window">
                                ↗
                            </button>
                            <button className="ai-header-btn" onClick={handleClearChat} title="Clear chat">
                                🗑
                            </button>
                            <button className="ai-header-btn" onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? 'Expand' : 'Minimize'}>
                                {isMinimized ? '□' : '—'}
                            </button>
                            <button className="ai-header-btn ai-close-btn" onClick={() => setIsOpen(false)} title="Close">
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Chat Body (hidden when minimized) */}
                    {!isMinimized && (
                        <>
                            <ChatWindow
                                messages={messages}
                                onSendMessage={handleSendMessage}
                                isLoading={isLoading}
                            />

                            {/* Resize Handle — bottom-right corner */}
                            <div
                                className="ai-resize-handle"
                                onMouseDown={handleResizeStart}
                                title="Drag to resize"
                            />
                        </>
                    )}
                </div>
            )}
        </>
    );
};

export default AISidebar;
