// pages/HomePage.jsx — the landing page: a cozy late-night desk, what you can do here, pick your vibe.
import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import { useAppearance } from '../appearance/context';
import { PRESETS } from '../appearance/presets';
import { Mascot, Prop } from '../appearance/art';
import './Landing.css';

const CAT = { kind: 'cat', colors: { body: '#f0a875', shade: '#d98a5a', accent: '#f5c2c7' } };
const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The hero illustration: a desk at night with a lamp, laptop, the user's prop and the napping mascot. */
function DeskScene() {
    const { settings } = useAppearance();
    const mascot = settings.mascot && settings.mascot.kind !== 'none' ? settings.mascot : CAT;
    const prop = settings.prop || { kind: 'mug' };
    return (
        <div className="ld-scene" aria-hidden="true">
            <svg className="ld-room" viewBox="0 0 520 400">
                <defs>
                    <linearGradient id="ld-sky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#0d1028" />
                        <stop offset="1" stopColor="#2a1f45" />
                    </linearGradient>
                    <radialGradient id="ld-lamp" cx="0.5" cy="0" r="1">
                        <stop offset="0" stopColor="var(--ui-signal)" stopOpacity="0.45" />
                        <stop offset="1" stopColor="var(--ui-signal)" stopOpacity="0" />
                    </radialGradient>
                </defs>
                {/* window */}
                <rect x="40" y="26" width="190" height="150" rx="16" fill="url(#ld-sky)" stroke="var(--border-subtle)" strokeWidth="6" />
                <path d="M135 26v150M40 101h190" stroke="var(--border-subtle)" strokeWidth="4" />
                <circle cx="190" cy="60" r="16" fill="#f6e7c1" />
                <circle cx="198" cy="54" r="14" fill="url(#ld-sky)" />
                {[[64, 48], [96, 70], [76, 128], [160, 132], [112, 44], [206, 120], [60, 92]].map(([x, y], i) => (
                    <circle key={i} className="ld-star" style={{ animationDelay: `${i * 0.6}s` }} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.5} fill="#fff6dc" />
                ))}
                {/* lamp */}
                <path d="M420 300 L420 238 L372 150" stroke="var(--text-muted)" strokeWidth="7" strokeLinecap="round" fill="none" />
                <path d="M340 128 L398 118 L392 160 Z" fill="var(--ui-signal)" />
                <path className="ld-glow" d="M346 152 L392 156 L470 330 L250 330 Z" fill="url(#ld-lamp)" />
                <ellipse cx="420" cy="302" rx="34" ry="8" fill="var(--text-muted)" />
                {/* desk */}
                <rect x="10" y="318" width="500" height="22" rx="10" fill="#7a5238" />
                <rect x="10" y="318" width="500" height="7" rx="4" fill="#9a6a49" />
                <rect x="40" y="338" width="16" height="62" fill="#5e3f2b" /><rect x="464" y="338" width="16" height="62" fill="#5e3f2b" />
                {/* laptop */}
                <rect x="190" y="196" width="190" height="118" rx="10" fill="#2a2633" />
                <rect x="198" y="204" width="174" height="102" rx="6" fill="var(--bg-dark)" />
                <g className="ld-code">
                    <rect x="210" y="216" width="40" height="6" rx="3" fill="var(--ui-link)" />
                    <rect x="256" y="216" width="70" height="6" rx="3" fill="var(--text-main)" opacity="0.7" />
                    <rect x="222" y="230" width="56" height="6" rx="3" fill="var(--ui-success)" />
                    <rect x="284" y="230" width="34" height="6" rx="3" fill="var(--ui-tab-active)" />
                    <rect x="222" y="244" width="90" height="6" rx="3" fill="var(--text-main)" opacity="0.5" />
                    <rect x="210" y="258" width="24" height="6" rx="3" fill="var(--ui-link)" />
                    <rect x="222" y="272" width="64" height="6" rx="3" fill="var(--ui-success)" />
                    <rect className="ld-caret" x="292" y="270" width="3" height="10" fill="var(--ui-signal)" />
                </g>
                <path d="M176 314 h218 l-10 8 h-198 z" fill="#3a3445" />
            </svg>
            <div className="ld-mascot"><Mascot mascot={mascot} z={settings.colors.link} width={150} height={100} /></div>
            <div className="ld-mug"><Prop prop={prop} size={74} /></div>
        </div>
    );
}

function BuildMock() {
    return (
        <div className="ld-mock ld-ide">
            <div className="ld-mock-bar"><i /><i /><i /><span>app.py</span></div>
            <pre>
                <span className="k">def</span> <span className="f">greet</span>(name):{'\n'}
                {'    '}<span className="k">return</span> <span className="s">f"hi {'{'}name{'}'}"</span><span className="ld-cur riya"><b>riya</b></span>{'\n'}
                {'\n'}
                <span className="f">print</span>(greet(<span className="s">"you"</span>))<span className="ld-cur you"><b>you</b></span>
            </pre>
            <div className="ld-voice"><span className="ld-dot" /> 3 in voice · General</div>
        </div>
    );
}

function BattleMock() {
    return (
        <div className="ld-mock ld-quiz">
            <div className="ld-quiz-head"><span>Round 3 of 7</span><span className="ld-timer"><i /></span></div>
            <pre className="ld-q">console.log([1, 2, 3].map(x =&gt; x * 2))</pre>
            <div className="ld-opts">
                <span>[1, 2, 3]</span>
                <span className="right">[2, 4, 6] ✓</span>
                <span>6</span>
                <span>undefined</span>
            </div>
            <div className="ld-score">You <b>+480</b> · riya +310</div>
        </div>
    );
}

function GrowMock() {
    return (
        <div className="ld-mock ld-grow">
            <div className="ld-rank"><span className="ld-badge">Specialist</span><span className="ld-num">1512</span><span className="ld-up">▲ 18</span></div>
            <svg viewBox="0 0 220 80" className="ld-spark">
                <polyline points="0,70 30,64 60,66 90,52 120,48 150,36 180,30 220,14" fill="none" stroke="var(--ui-link)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="220" cy="14" r="4" fill="var(--ui-link)" />
            </svg>
            <div className="ld-skills"><span>Python</span><span>React</span><span>SQL</span></div>
        </div>
    );
}

const HomePage = () => {
    const { isAuthenticated } = useContext(AuthContext);
    const { settings, preview, appearance } = useAppearance();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState('');

    useEffect(() => {
        axios.get('/api/dashboard/public-stats').then(r => setStats(r.data)).catch(() => {});
    }, []);

    const handleInviteLinkJoin = async (e) => {
        e.preventDefault();
        if (!inviteLink.trim()) { setInviteError('Paste an invite link or room ID'); return; }
        setInviteLoading(true);
        setInviteError('');
        try {
            let roomId = inviteLink.trim();
            if (roomId.includes('rooms/')) roomId = roomId.split('rooms/')[1];
            else if (roomId.includes('room/')) roomId = roomId.split('room/')[1];
            roomId = roomId.replace(/[^a-f0-9]/gi, '').slice(0, 24);
            const response = await axios.get(`/api/rooms/${roomId}`);
            if (response.data) {
                if (isAuthenticated) navigate(`/rooms/${roomId}`);
                else { sessionStorage.setItem('inviteRoomId', roomId); navigate('/login'); }
            }
        } catch (err) {
            setInviteError(err.response?.data?.msg || "That link didn't work. Check it and try again.");
        } finally {
            setInviteLoading(false);
        }
    };

    const tryPreset = (id) => preview({ ...(appearance || {}), preset: id, colors: {}, palette: {} });
    const statLine = stats && stats.devs > 0 ? [
        `${fmt(stats.devs)} developer${stats.devs === 1 ? '' : 's'}`,
        stats.projects ? `${fmt(stats.projects)} projects` : null,
        stats.lines ? `${fmt(stats.lines)} lines of code written here` : null
    ].filter(Boolean) : null;

    return (
        <div className="ld">
            <section className="ld-hero">
                <div className="ld-hero-text">
                    <span className="ld-pill">☕ cozy coding, together</span>
                    <h1>Code together.<br />Battle friends.<br /><span className="ld-accent">Get better.</span><span className="ui-cursor" aria-hidden="true" /></h1>
                    <p className="ld-sub">
                        A warm little corner of the internet for developers: shared editors and voice rooms,
                        live code battles with friends, and skill ratings that grow with you. All in your browser.
                    </p>
                    <div className="ld-ctas">
                        {isAuthenticated ? (
                            <>
                                <Link to="/dashboard" className="ui-btn primary ld-big">Open your home</Link>
                                <button className="ui-btn ld-big" onClick={() => setShowInviteModal(true)}>Join a room</button>
                            </>
                        ) : (
                            <>
                                <Link to="/register" className="ui-btn primary ld-big">Get started free</Link>
                                <Link to="/login" className="ui-btn ld-big">Log in</Link>
                            </>
                        )}
                    </div>
                    <p className="ld-note">Free · Runs in your browser · Python, JavaScript, C++, C, SQL and more</p>
                </div>
                <DeskScene />
            </section>

            <section className="ld-features">
                <div className="ld-feature">
                    <div>
                        <span className="ld-kicker">01 · build</span>
                        <h2>Build with friends in a shared room</h2>
                        <p>Every room has a real-time editor, a terminal, voice and video, and chat. Write code together, run it, and publish it with a link anyone can open.</p>
                    </div>
                    <BuildMock />
                </div>
                <div className="ld-feature flip">
                    <div>
                        <span className="ld-kicker">02 · battle</span>
                        <h2>Settle it with a battle</h2>
                        <p>Quiz duels, debug races, CSS battles, CodeGuessr and algorithm fights. Same challenge, same clock. Fastest correct answer wins, and every mode has its own rating.</p>
                    </div>
                    <BattleMock />
                </div>
                <div className="ld-feature">
                    <div>
                        <span className="ld-kicker">03 · grow</span>
                        <h2>Watch your skills grow</h2>
                        <p>Short assessments that adapt to your level put a rating on each skill. Battles move it too, so your profile shows what you can actually do.</p>
                    </div>
                    <GrowMock />
                </div>
            </section>

            <section className="ld-vibes">
                <h2>Make it yours</h2>
                <p>Pick a vibe and the whole site changes, right now. After you sign up you can tweak every colour, the mascot and the fonts.</p>
                <div className="ld-vibe-row">
                    {Object.entries(PRESETS).map(([id, p]) => (
                        <button key={id} className={`ld-vibe${settings.preset === id ? ' on' : ''}`} onClick={() => tryPreset(id)} aria-pressed={settings.preset === id}
                            style={{ background: p.colors.surface, color: p.colors.text, borderColor: settings.preset === id ? p.colors.signal : p.colors.border }}>
                            <span className="ld-vibe-dots">{['accent', 'link', 'signal'].map(k => <i key={k} style={{ background: p.colors[k] }} />)}</span>
                            {p.name}
                        </button>
                    ))}
                </div>
            </section>

            {statLine && <section className="ld-stats">{statLine.map(s => <span key={s}>{s}</span>)}</section>}

            <section className="ld-final">
                <h2>Pull up a chair.</h2>
                <p>Grab a coffee, invite a friend, and write something fun tonight.</p>
                {isAuthenticated
                    ? <Link to="/dashboard" className="ui-btn primary ld-big">Open your home</Link>
                    : <Link to="/register" className="ui-btn primary ld-big">Create your account</Link>}
            </section>

            <footer className="ld-footer">
                <span>SkillSkirmish</span>
                <nav>
                    <Link to="/gallery">Gallery</Link>
                    <Link to="/battle">Battles</Link>
                    {!isAuthenticated && <Link to="/login">Log in</Link>}
                    {!isAuthenticated && <Link to="/register">Sign up</Link>}
                </nav>
                <span className="ld-made">made with ☕ and a lot of late nights</span>
            </footer>

            {showInviteModal && (
                <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowInviteModal(false)}>
                    <form className="ui-modal" onSubmit={handleInviteLinkJoin} role="dialog" aria-modal="true" aria-labelledby="join-title">
                        <h2 id="join-title">Join a room</h2>
                        <label className="ui-field">
                            <span>Invite link or room ID</span>
                            <input className="ui-input" value={inviteLink} onChange={(e) => { setInviteLink(e.target.value); setInviteError(''); }} placeholder="https://…/#/rooms/abc123" autoFocus />
                        </label>
                        {inviteError && <div className="auth-error">{inviteError}</div>}
                        <div className="ui-modal-actions">
                            <button type="button" className="ui-btn ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                            <button type="submit" className="ui-btn primary" disabled={inviteLoading}>{inviteLoading ? 'Joining…' : 'Join'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default HomePage;
