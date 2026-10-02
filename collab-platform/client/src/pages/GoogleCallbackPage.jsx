// src/pages/GoogleCallbackPage.jsx
// Handles the redirect from Auth0 after Google authentication.
// Extracts the JWT token from URL params, stores it, and redirects to dashboard.

import React, { useEffect, useContext, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { takeDestination } from '../utils/afterLogin';
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
            navigate(takeDestination(), { replace: true });
        }
    }, [isAuthenticated, navigate]);

    return (
        <div className="auth-wrap">
            <div className="ui-card auth-card" style={{ textAlign: 'center' }} role="status">
                {error ? (
                    <>
                        <h1 style={{ fontSize: 20 }}>Google sign-in didn't work</h1>
                        <p className="auth-error" style={{ marginTop: 12 }}>{error}</p>
                        <p className="ui-muted">Taking you back to the login page…</p>
                    </>
                ) : (
                    <>
                        <h1 style={{ fontSize: 20 }}>Signed in with Google</h1>
                        <p className="ui-muted" style={{ marginTop: 8 }}>Loading your workspace…</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default GoogleCallbackPage;
