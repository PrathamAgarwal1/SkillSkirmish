// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

import logo from '../../assets/logo.png';

const Navbar = () => {
    // Ideally, your AuthContext should also provide a 'loading' state
    const { isAuthenticated, logout, loading } = useContext(AuthContext);

    const authLinks = (
        <ul>
            {/* --- FIXED: ADDED FORUM LINK HERE FOR LOGGED IN USERS --- */}
            <li>
                <Link to="/forum" className="nav-link" style={{ color: 'var(--accent-primary)' }}>
                    Forum & Matchmaking
                </Link>
            </li>
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/profile">Profile</Link></li>
            <li><a onClick={logout} href="#!">Logout</a></li>
        </ul>
    );

    const guestLinks = (
        <ul>
            <li><Link to="/register">Register</Link></li>
            <li><Link to="/login">Login</Link></li>
            {/* You can keep it here too if you want guests to see it, 
                but usually matchmaking is for logged in users */}
        </ul>
    );

    // Prevent flashing incorrect links while checking auth status
    if (loading) {
        return <nav className="navbar"><img src={logo} alt="CodeCollab" style={{ height: '40px' }} /></nav>;
    }

    return (
        <nav className="navbar" style={{
            background: 'var(--bg-input)',
            borderBottom: '1px solid var(--border-subtle)',
            fontFamily: 'var(--font-mono)',
            height: '60px'
        }}>
            <h1 style={{ fontSize: '1.2rem', margin: 0 }}>
                <Link to="/" style={{ color: 'var(--term-green)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={logo} alt="CodeCollab" style={{ height: '35px' }} />
                    <span style={{ color: 'var(--text-muted)' }}>CodeCollab</span>
                </Link>
            </h1>
            <div className="nav-links">
                {isAuthenticated ? (
                    <ul style={{ display: 'flex', gap: '1.5rem', margin: 0, padding: 0, listStyle: 'none' }}>
                        <li><Link to="/dashboard" style={{ color: 'var(--text-main)' }}>./dashboard</Link></li>
                        <li><Link to="/forum" style={{ color: 'var(--text-main)' }}>./forum</Link></li>
                        <li><Link to="/profile" style={{ color: 'var(--text-main)' }}>./profile</Link></li>
                        <li><a onClick={logout} href="#!" style={{ color: 'var(--term-red)' }}>exit</a></li>
                    </ul>
                ) : (
                    <ul style={{ display: 'flex', gap: '1.5rem', margin: 0, padding: 0, listStyle: 'none' }}>
                        <li><Link to="/register" style={{ color: 'var(--text-main)' }}>./register</Link></li>
                        <li><Link to="/login" style={{ color: 'var(--term-blue)' }}>./login</Link></li>
                    </ul>
                )}
            </div>
        </nav>
    );
};

export default Navbar;