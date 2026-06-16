import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import Logo from '../components/layout/Logo';

const HomePage = () => {
    const { isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState('');

    // Stats counter animation state
    const [counts, setCounts] = useState({ lines: 0 });

    useEffect(() => {
        let isMounted = true;
        let timer = null;

        const fetchStats = async () => {
            try {
                const res = await axios.get('/api/dashboard/public-stats');
                if (!isMounted) return;

                const targetLines = res.data.lines || 0;

                const duration = 1500; // 1.5 seconds animation
                const frameRate = 1000 / 60; // 60 fps
                const totalFrames = Math.round(duration / frameRate);
                let frame = 0;

                timer = setInterval(() => {
                    if (!isMounted) {
                        clearInterval(timer);
                        return;
                    }
                    frame++;
                    const progress = frame / totalFrames;
                    
                    // easeOutQuad
                    const easeOutQuad = x => x * (2 - x);
                    const currentProgress = easeOutQuad(progress);

                    setCounts({
                        lines: Math.round(targetLines * currentProgress)
                    });

                    if (frame >= totalFrames) {
                        clearInterval(timer);
                        setCounts({ lines: targetLines });
                    }
                }, frameRate);

            } catch (err) {
                console.error('Error fetching public stats:', err);
            }
        };

        fetchStats();
        return () => {
            isMounted = false;
            if (timer) clearInterval(timer);
        };
    }, []);

    const handleInviteLinkJoin = async (e) => {
        e.preventDefault();
        if (!inviteLink.trim()) {
            setInviteError('Please enter an invite link');
            return;
        }

        setInviteLoading(true);
        setInviteError('');

        try {
            let roomId = inviteLink.trim();
            if (roomId.includes('room/')) {
                roomId = roomId.split('room/')[1];
            }

            const response = await axios.get(`/api/rooms/${roomId}`);

            if (response.data) {
                if (isAuthenticated) {
                    navigate(`/rooms/${roomId}`);
                } else {
                    sessionStorage.setItem('inviteRoomId', roomId);
                    navigate('/login');
                }
            }
        } catch (err) {
            setInviteError(err.response?.data?.msg || 'Invalid invite link or room not found');
            console.error('Failed to join room via invite:', err);
        } finally {
            setInviteLoading(false);
        }
    };

    return (
        <div className="homepage">

            {/* --- HERO SECTION --- */}
            <div className="hero-wrapper">
                <div className="hero-grid-bg"></div>

                <div className="container hero-container">
                    {/* Left: Text Content */}
                    <div className="hero-text-content">
                        <div className="hero-badge">
                            <span></span> v2.0 is Live
                        </div>
                        <h1 className="hero-title">
                            Skill<span className="gradient-text">Skirmish</span>
                        </h1>
                        <p className="hero-subtitle">
                            The real-time collaboration platform for developers.
                            Instant IDEs, voice channels, and AI-powered skill tracking—all in your browser.
                        </p>

                        <div className="hero-actions">
                            {isAuthenticated ? (
                                <>
                                    <Link to="/dashboard" className="btn" style={{ fontFamily: 'var(--font-mono)' }}>
                                        ./dashboard
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </Link>
                                    <button onClick={() => setShowInviteModal(true)} className="btn btn-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                                        ./join-room
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link to="/register" className="btn" style={{ fontFamily: 'var(--font-mono)' }}>
                                        ./init --new-project
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </Link>
                                    <Link to="/login" className="btn btn-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                                        ./login
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: Visual/Code Window */}
                    <div className="hero-visual">
                        <div className="floating-card fc-1">
                            <div className="user-avatar" style={{ background: 'url(https://github.com/github.png) center/cover' }}></div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#8b949e' }}>@alex just joined</div>
                                <div style={{ fontSize: '0.9rem', color: '#fff' }}>Ready to pair? 🚀</div>
                            </div>
                        </div>

                        <div className="code-window">
                            <div className="window-header">
                                <span className="dot red"></span>
                                <span className="dot yellow"></span>
                                <span className="dot green"></span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#8b949e' }}>main.js</span>
                            </div>
                            <div className="window-body">
                                <span className="code-line"><span className="cl-1">import</span> <span className="cl-2">socket</span> <span className="cl-1">from</span> <span className="cl-3">'./socket'</span>;</span>
                                <span className="code-line">&nbsp;</span>
                                <span className="code-line"><span className="cl-1">const</span> <span className="cl-2">App</span> = () =&gt; &#123;</span>
                                <span className="code-line">&nbsp;&nbsp;<span className="cl-4">useEffects</span>(() =&gt; &#123;</span>
                                <span className="code-line">&nbsp;&nbsp;&nbsp;&nbsp;<span className="cl-2">socket</span>.<span className="cl-2">emit</span>(<span className="cl-3">'join-room'</span>, ROOM_ID);</span>
                                <span className="code-line">&nbsp;&nbsp;&#125;, []);</span>
                                <span className="code-line">&nbsp;</span>
                                <span className="code-line">&nbsp;&nbsp;<span className="cl-1">return</span> <span className="cl-3">&lt;SkillSkirmish /&gt;</span>;</span>
                                <span className="code-line">&#125;;</span>
                            </div>
                        </div>

                        <div className="floating-card fc-2">
                            <div style={{ width: '40px', height: '40px', background: '#238636', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#8b949e' }}>All tests passed</div>
                                <div style={{ fontSize: '0.9rem', color: '#fff' }}>Deployed to Prod</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- STATS SECTION --- */}
            <div className="stats-section">
                <div className="container stats-grid">
                    <div className="stat-item">
                        <h3>{counts.lines.toLocaleString()}+</h3>
                        <p>Lines of Code</p>
                    </div>
                </div>
            </div>

            {/* --- FEATURES SECTION --- */}
            <section className="features-section">
                <div className="container">
                    <div className="section-header">
                        <h2>Everything you need to <span className="gradient-text">build together</span></h2>
                        <p>Stop juggling five different tools. Skill Skirmish brings your editor, communication, and deployment into one unified workflow.</p>
                    </div>

                    <div className="feature-cards">
                        <div className="feature-card">
                            <div className="feature-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <h3>Collaborative IDE</h3>
                            <p>Real-time multiplayer editing with syntax highlighting, intelligent autocomplete, and multi-file support. Feels just like VS Code.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H19C19.5304 5 20.0391 5.21071 20.4142 5.58579C20.7893 5.96086 21 6.46957 21 7V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <h3>Integrated Communication</h3>
                            <p>Voice channels and persistent chat rooms attached to every project. Discuss the code right where you write it.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <h3>AI Skill Tracking</h3>
                            <p>Our algorithms analyze your coding patterns to visualize your skill growth over time. Gamify your development journey.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="site-footer">
                <div className="container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <h2>Skill Skirmish</h2>
                            <p style={{ color: '#8b949e', maxWidth: '300px' }}>
                                Empowering developers to build the future, together. Open source, secure, and always free for open projects.
                            </p>
                        </div>
                        <div className="footer-links">
                            <div className="footer-col">
                                <h4>Platform</h4>
                                <ul>
                                    <li><Link to="/features">Features</Link></li>
                                    <li><Link to="/pricing">Pricing</Link></li>
                                    <li><Link to="/enterprise">Enterprise</Link></li>
                                </ul>
                            </div>
                            <div className="footer-col">
                                <h4>Community</h4>
                                <ul>
                                    <li><Link to="/forum">Forum</Link></li>
                                    <li><a href="https://discord.gg" target="_blank" rel="noopener noreferrer">Discord</a></li>
                                    <li><a href="https://github.com" target="_blank" rel="noopener noreferrer">Open Source</a></li>
                                </ul>
                            </div>
                            <div className="footer-col">
                                <h4>Company</h4>
                                <ul>
                                    <li><Link to="/about">About Us</Link></li>
                                    <li><Link to="/careers">Careers</Link></li>
                                    <li><Link to="/contact">Contact</Link></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        &copy; {new Date().getFullYear()} Skill Skirmish Inc. All rights reserved.
                    </div>
                </div>
            </footer>

            {/* --- INVITE MODAL --- */}
            {showInviteModal && (
                <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Join a Room</h2>
                        <form onSubmit={handleInviteLinkJoin}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c9d1d9', fontSize: '0.9rem' }}>
                                    Enter Invite Link or Room ID
                                </label>
                                <input
                                    type="text"
                                    value={inviteLink}
                                    onChange={(e) => {
                                        setInviteLink(e.target.value);
                                        setInviteError('');
                                    }}
                                    placeholder="e.g. https://codecolab.com/room/abc-123 or abc-123"
                                    autoFocus
                                />
                            </div>

                            {inviteError && (
                                <div style={{
                                    marginBottom: '1rem',
                                    padding: '0.8rem',
                                    background: 'rgba(248, 81, 73, 0.15)',
                                    border: '1px solid #f85149',
                                    borderRadius: '6px',
                                    color: '#ff7b72',
                                    fontSize: '0.9rem'
                                }}>
                                    {inviteError}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowInviteModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={inviteLoading}
                                    className="btn"
                                >
                                    {inviteLoading ? 'Joining...' : 'Join Room'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomePage;