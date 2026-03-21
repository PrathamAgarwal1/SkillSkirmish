import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import AuthContext from '../context/AuthContext';

const LoginPage = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState(null);
    const { login, isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();

    // Check for error from Google auth redirect
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const errorMsg = params.get('error');
        if (errorMsg) {
            setError(errorMsg);
        }
    }, [location]);

    useEffect(() => {
        if (isAuthenticated) {
            const inviteRoomId = sessionStorage.getItem('inviteRoomId');
            if (inviteRoomId) {
                sessionStorage.removeItem('inviteRoomId');
                navigate(`/room/${inviteRoomId}`);
            } else {
                navigate('/dashboard');
            }
        }
    }, [isAuthenticated, navigate]);

    const { email, password } = formData;
    const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async e => {
        e.preventDefault();
        await login(formData);
    };

    // Redirect to backend Google auth route (full page redirect)
    const handleGoogleLogin = () => {
        const rawUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
        const backendUrl = rawUrl.replace(/\/+$/, '');
        window.location.href = `${backendUrl}/api/auth/google/login`;
    };

    return (
        <div style={{
            minHeight: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', backgroundColor: 'var(--bg-deep)', padding: '2rem'
        }}>
            <div className="term-card" style={{ width: '420px', maxWidth: '95%' }}>
                <div className="term-header">
                    <div className="window-dots">
                        <div className="dot dot-red"></div>
                        <div className="dot dot-yellow"></div>
                        <div className="dot dot-green"></div>
                    </div>
                    <span>login.sh</span>
                </div>
                <div className="term-body" style={{ padding: '2rem' }}>
                    <h2 style={{
                        color: 'var(--text-bright)', fontSize: '1.5rem', marginBottom: '0.5rem',
                        fontFamily: 'var(--font-mono)', letterSpacing: '1px'
                    }}>
                        <span style={{ color: 'var(--term-green)' }}>$</span> login
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
                        authenticate to access your workspace
                    </p>

                    {/* Error message from Google auth */}
                    {error && (
                        <div style={{
                            padding: '0.7rem 1rem', marginBottom: '1.2rem', borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'rgba(255, 80, 80, 0.1)', border: '1px solid rgba(255, 80, 80, 0.3)',
                            color: 'var(--term-red)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)'
                        }}>
                            ✗ {error}
                        </div>
                    )}

                    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div>
                            <label style={{
                                display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem',
                                color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                            }}>EMAIL</label>
                            <input className="term-input" type="email" name="email"
                                value={email} onChange={onChange} placeholder="user@domain.com" required />
                        </div>
                        <div>
                            <label style={{
                                display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem',
                                color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                            }}>PASSWORD</label>
                            <input className="term-input" type="password" name="password"
                                value={password} onChange={onChange} placeholder="••••••••" required />
                        </div>

                        <button className="btn-term-primary" type="submit" style={{
                            marginTop: '0.5rem', padding: '0.8rem', fontSize: '0.9rem',
                            letterSpacing: '1px', borderRadius: 'var(--radius-sm)'
                        }}>
                            AUTHENTICATE →
                        </button>
                    </form>

                    {/* Divider */}
                    <div style={{
                        display: 'flex', alignItems: 'center', margin: '1.5rem 0',
                        gap: '0.8rem', fontFamily: 'var(--font-mono)'
                    }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '2px' }}>OR</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                    </div>

                    {/* Google Login Button */}
                    <button
                        onClick={handleGoogleLogin}
                        style={{
                            width: '100%', padding: '0.8rem', fontSize: '0.85rem',
                            fontFamily: 'var(--font-mono)', letterSpacing: '0.5px',
                            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-bright)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '0.6rem',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.borderColor = 'var(--term-blue)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        }}
                    >
                        <FcGoogle size={20} />
                        Continue with Google
                    </button>

                    <div style={{
                        marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem',
                        color: 'var(--text-muted)', fontFamily: 'var(--font-mono)'
                    }}>
                        No account? <Link to="/register" style={{ color: 'var(--term-blue)', textDecoration: 'none' }}>register</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default LoginPage;