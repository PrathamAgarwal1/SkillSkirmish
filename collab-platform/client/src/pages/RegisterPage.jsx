import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import AuthContext from '../context/AuthContext';

const RegisterPage = () => {
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const { register } = useContext(AuthContext);
    const navigate = useNavigate();

    const { username, email, password } = formData;
    const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async e => {
        e.preventDefault();
        await register(formData);
        navigate('/');
    };

    // Redirect to backend Google auth route (full page redirect)
    const handleGoogleLogin = () => {
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
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
                    <span>register.sh</span>
                </div>
                <div className="term-body" style={{ padding: '2rem' }}>
                    <h2 style={{
                        color: 'var(--text-bright)', fontSize: '1.5rem', marginBottom: '0.5rem',
                        fontFamily: 'var(--font-mono)', letterSpacing: '1px'
                    }}>
                        <span style={{ color: 'var(--term-green)' }}>$</span> register
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
                        create a new developer account
                    </p>

                    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div>
                            <label style={{
                                display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem',
                                color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                            }}>USERNAME</label>
                            <input className="term-input" type="text" name="username"
                                value={username} onChange={onChange} placeholder="devuser" required />
                        </div>
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
                                value={password} onChange={onChange} placeholder="••••••••" required minLength="6" />
                        </div>

                        <button className="btn-term-primary" type="submit" style={{
                            marginTop: '0.5rem', padding: '0.8rem', fontSize: '0.9rem',
                            letterSpacing: '1px', borderRadius: 'var(--radius-sm)'
                        }}>
                            CREATE ACCOUNT →
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
                        Already have an account? <Link to="/login" style={{ color: 'var(--term-blue)', textDecoration: 'none' }}>login</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default RegisterPage;