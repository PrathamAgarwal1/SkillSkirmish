// src/pages/GoogleCallbackPage.jsx
// Handles the redirect from Auth0 after Google authentication.
// Extracts the JWT token from URL params, stores it, and redirects to dashboard.

import React, { useEffect, useContext, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const GoogleCallbackPage = () => {
    const { googleLogin, isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState(null);
    const hasProcessed = useRef(false);

    // Process the token from URL on mount (only once)
    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const errorMsg = params.get('error');

        if (errorMsg) {
            setError(errorMsg);
            setTimeout(() => navigate('/login'), 3000);
            return;
        }

        if (token) {
            // Store token and load user via AuthContext
            googleLogin(token);
        } else {
            setError('No authentication token received.');
            setTimeout(() => navigate('/login'), 3000);
        }
    }, [location, googleLogin, navigate]);

    // Redirect to dashboard once authentication is confirmed
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

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
                    <span>google-auth.sh</span>
                </div>
                <div className="term-body" style={{ padding: '2rem', textAlign: 'center' }}>
                    {error ? (
                        <>
                            <p style={{ color: 'var(--term-red)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                                ✗ {error}
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
                                Redirecting to login...
                            </p>
                        </>
                    ) : (
                        <>
                            <p style={{
                                color: 'var(--term-green)', fontFamily: 'var(--font-mono)',
                                fontSize: '0.9rem', marginBottom: '1rem'
                            }}>
                                ✓ Google authentication successful
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                Loading your workspace...
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GoogleCallbackPage;
