// src/components/routing/PrivateRoute.jsx
import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

const PrivateRoute = ({ children }) => {
    const { isAuthenticated, loading } = useContext(AuthContext); // <-- Get loading state

    // While verifying the token, show a loading message
    if (loading) {
        return <div className="container">Loading...</div>;
    }

    // After loading, if not authenticated, redirect to login
    return isAuthenticated ? children : <Navigate to="/login" />;
};

export default PrivateRoute;