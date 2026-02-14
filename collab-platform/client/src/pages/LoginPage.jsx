import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const LoginPage = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const { login, isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();

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