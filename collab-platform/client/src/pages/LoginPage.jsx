import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { takeDestination } from '../utils/afterLogin';
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
                navigate(`/rooms/${inviteRoomId}`);
            } else {
                navigate(takeDestination());
            }
        }
    }, [isAuthenticated, navigate]);

    const { email, password } = formData;
    const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async e => {
        e.preventDefault();
        setError(null);
        try {
            await login(formData);
        } catch (err) {
            setError(err.message);
        }
    };

    // Redirect to backend Google auth route (full page redirect)
    const handleGoogleLogin = () => {
        const rawUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
        const backendUrl = rawUrl.replace(/\/+$/, '');
        window.location.href = `${backendUrl}/api/auth/google/login`;
    };

    return (
        <div className="auth-wrap">
            <div className="ui-card auth-card">
                <h1>Log in</h1>
                <p className="ui-muted">Welcome back. Pick up where you left off.</p>

                {error && <div className="auth-error" role="alert">{error}</div>}

                <button type="button" className="ui-btn auth-google" onClick={handleGoogleLogin}>
                    <FcGoogle size={20} /> Continue with Google
                </button>
                <div className="auth-or"><span>or</span></div>

                <form onSubmit={onSubmit}>
                    <label className="ui-field">
                        <span>Email</span>
                        <input className="ui-input" type="email" name="email" value={email} onChange={onChange} placeholder="you@example.com" autoComplete="email" required />
                    </label>
                    <label className="ui-field">
                        <span>Password</span>
                        <input className="ui-input" type="password" name="password" value={password} onChange={onChange} autoComplete="current-password" required />
                    </label>
                    <button className="ui-btn primary auth-submit" type="submit">Log in</button>
                </form>

                <p className="auth-switch">New here? <Link to="/register" className="ui-link">Create an account</Link></p>
            </div>
        </div>
    );
};
export default LoginPage;
