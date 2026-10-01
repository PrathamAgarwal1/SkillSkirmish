import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { takeDestination } from '../utils/afterLogin';
import { FcGoogle } from 'react-icons/fc';
import AuthContext from '../context/AuthContext';

const RegisterPage = () => {
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { register } = useContext(AuthContext);
    const navigate = useNavigate();

    const { username, email, password } = formData;
    const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async e => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await register(formData);
            navigate(takeDestination());
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
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
                <h1>Create your account</h1>
                <p className="ui-muted">Build with others, battle, and track your skills.</p>

                <button type="button" className="ui-btn auth-google" onClick={handleGoogleLogin}>
                    <FcGoogle size={20} /> Continue with Google
                </button>
                <div className="auth-or"><span>or</span></div>

                <form onSubmit={onSubmit}>
                    <label className="ui-field">
                        <span>Username</span>
                        <input className="ui-input" type="text" name="username" value={username} onChange={onChange} placeholder="devuser" required
                            minLength="3" maxLength="30" pattern="[a-zA-Z0-9_.\-]+" autoComplete="username" />
                        <small>3–30 characters: letters, numbers, _ . -</small>
                    </label>
                    <label className="ui-field">
                        <span>Email</span>
                        <input className="ui-input" type="email" name="email" value={email} onChange={onChange} placeholder="you@example.com" autoComplete="email" required />
                    </label>
                    <label className="ui-field">
                        <span>Password</span>
                        <input className="ui-input" type="password" name="password" value={password} onChange={onChange} required minLength="8" autoComplete="new-password" />
                        <small>At least 8 characters</small>
                    </label>

                    {error && <div className="auth-error" role="alert">{error}</div>}

                    <button className="ui-btn primary auth-submit" type="submit" disabled={submitting}>{submitting ? 'Creating your account…' : 'Create account'}</button>
                </form>

                <p className="auth-switch">Already have an account? <Link to="/login" className="ui-link">Log in</Link></p>
            </div>
        </div>
    );
};
export default RegisterPage;
