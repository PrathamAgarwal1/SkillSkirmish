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

    // An expired/invalid token makes every API call fail with 401 — log out instead of
    // leaving the UI in a "logged in but nothing works" state.
    useEffect(() => {
        const id = axios.interceptors.response.use(
            (res) => res,
            (err) => {
                const url = err.config?.url || '';
                if (err.response?.status === 401 && localStorage.getItem('token') && !url.includes('/api/auth/login')) {
                    logout();
                }
                return Promise.reject(err);
            }
        );
        return () => axios.interceptors.response.eject(id);
    }, [logout]);

    // Stores the token and loads the user. Throws a readable Error on failure so the
    // login/register pages can show it (previously failures were silently swallowed).
    const authenticate = async (endpoint, formData) => {
        try {
            const res = await axios.post(endpoint, formData);
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setAuthToken(res.data.token);
            await loadUser();
        } catch (err) {
            logout();
            throw new Error(err.response?.data?.msg || 'Could not reach the server. Please try again.');
        }
    };

    const register = (formData) => authenticate('/api/auth/register', formData);

    const login = (formData) => authenticate('/api/auth/login', formData);

    // Google Auth0 login — called by GoogleCallbackPage with the JWT from the server
    const googleLogin = async (jwtToken) => {
        try {
            localStorage.setItem('token', jwtToken);
            setToken(jwtToken);
            setAuthToken(jwtToken);
            await loadUser();
        } catch (err) {
            console.error('Google login error:', err);
            logout();
        }
    };

    return (
        <AuthContext.Provider value={{ token, isAuthenticated, user, loading, register, login, googleLogin, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;