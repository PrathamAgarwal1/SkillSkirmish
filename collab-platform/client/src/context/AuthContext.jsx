import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import setAuthToken from '../utils/setAuthToken';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setAuthToken(null);
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
    }, []);

    const loadUser = useCallback(async () => {
        try {
            const res = await axios.get('/api/auth'); // Relative URL
            setUser(res.data);
            setIsAuthenticated(true);
        } catch (err) {
            console.error("Token validation failed:", err.response ? err.response.data.msg : err.message);
            logout();
        } finally {
            setLoading(false);
        }
    }, [logout]);

    useEffect(() => {
        if (localStorage.token) {
            setAuthToken(localStorage.token);
            loadUser();
        } else {
            setLoading(false);
        }
    }, [loadUser]);

    const register = async (formData) => {
        try {
            const res = await axios.post('/api/auth/register', formData); // Relative URL
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setAuthToken(res.data.token);
            await loadUser();
        } catch (err) {
            console.error(err.response.data);
            logout();
        }
    };

    const login = async (formData) => {
        try {
            const res = await axios.post('/api/auth/login', formData); // Relative URL
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setAuthToken(res.data.token);
            await loadUser();
        } catch (err) {
            console.error(err.response.data);
            logout();
        }
    };

    return (
        <AuthContext.Provider value={{ token, isAuthenticated, user, loading, register, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;