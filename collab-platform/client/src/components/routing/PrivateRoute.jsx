// src/components/routing/PrivateRoute.jsx
import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { rememberDestination } from '../../utils/afterLogin';
import AuthContext from '../../context/AuthContext';

const PrivateRoute = ({ children }) => {
    const { isAuthenticated, loading } = useContext(AuthContext); // <-- Get loading state
    const location = useLocation();

    // While verifying the token, show a loading message
    if (loading) {
        return <div className="container">Loading...</div>;
    }

    // After loading, if not authenticated, redirect to login
    if (isAuthenticated) return children;
    // Come back here after signing in
    rememberDestination(location.pathname + location.search);
    return <Navigate to="/login" />;
};

export default PrivateRoute;