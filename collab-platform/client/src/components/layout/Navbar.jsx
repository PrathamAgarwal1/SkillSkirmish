// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

import Logo from './Logo';

const Navbar = () => {
    const { isAuthenticated, logout, loading } = useContext(AuthContext);

    if (loading) {
        return <nav className="navbar-fixed" style={{ justifyContent: 'center' }}><Logo size="small" /></nav>;
    }

    return (
        <nav className="navbar-fixed">
            <Link to="/" style={{ textDecoration: 'none' }}>
                <Logo size="small" />
            </Link>

            <div className="nav-links">
                {isAuthenticated ? (
                    <ul style={{ display: 'flex', gap: '2rem', margin: 0, padding: 0, listStyle: 'none', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
                        <li><Link to="/dashboard" className="nav-link" style={{ color: 'var(--text-main)' }}>./dashboard</Link></li>
                        <li><Link to="/forum" className="nav-link" style={{ color: 'var(--text-main)' }}>./forum</Link></li>
                        <li><Link to="/profile" className="nav-link" style={{ color: 'var(--text-main)' }}>./profile</Link></li>
                        <li>
                            <button onClick={logout} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                                ./logout
                            </button>
                        </li>
                    </ul>
                ) : (
                    <ul style={{ display: 'flex', gap: '1.5rem', margin: 0, padding: 0, listStyle: 'none', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
                        <li><Link to="/login" className="nav-link" style={{ color: 'var(--term-blue)' }}>./login</Link></li>
                        <li><Link to="/register" className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>./init --user</Link></li>
                    </ul>
                )}
            </div>
        </nav>
    );
};

export default Navbar;