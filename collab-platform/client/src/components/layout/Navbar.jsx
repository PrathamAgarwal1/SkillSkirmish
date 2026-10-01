// src/components/layout/Navbar.jsx
import React, { useContext, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

import Logo from './Logo';

const LINKS = [
    { to: '/dashboard', label: 'Home' },
    { to: '/battle', label: 'Battle' },
    { to: '/forum', label: 'Discover' },
    { to: '/friends', label: 'Friends' },
    { to: '/gallery', label: 'Gallery' }
];

const itemClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;

/** Switches between the classic (dark terminal) and cozy (warm, late-night café) themes. */
function ThemeSwitch() {
    const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'classic');
    const next = theme === 'cozy' ? 'classic' : 'cozy';
    const toggle = () => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('ss-theme', next); } catch { /* storage blocked */ }
        setTheme(next);
    };
    return (
        <button className="nav-theme" onClick={toggle} aria-label={`Switch to the ${next} theme`} title={`Switch to the ${next} theme`}>
            {theme === 'cozy' ? '☕' : '🌙'}
        </button>
    );
}

const Navbar = () => {
    const { isAuthenticated, logout, loading, user } = useContext(AuthContext);

    if (loading) {
        return <nav className="navbar-fixed" style={{ justifyContent: 'center' }}><Logo size="small" /></nav>;
    }

    return (
        <nav className="navbar-fixed" aria-label="Main">
            <Link to={isAuthenticated ? '/dashboard' : '/'} style={{ textDecoration: 'none' }} aria-label="SkillSkirmish home">
                <Logo size="small" />
            </Link>

            {isAuthenticated ? (
                <>
                    <ul className="nav-main">
                        {LINKS.map(l => (
                            <li key={l.to}><NavLink to={l.to} className={itemClass}>{l.label}</NavLink></li>
                        ))}
                    </ul>
                    <div className="nav-user">
                        <ThemeSwitch />
                        <NavLink to="/profile" end className={({ isActive }) => `nav-profile${isActive ? ' active' : ''}`} aria-label="Your profile">
                            <span className="nav-avatar" aria-hidden="true">{(user?.username || '?').slice(0, 1).toUpperCase()}</span>
                            <span className="nav-username">{user?.username || 'Profile'}</span>
                        </NavLink>
                        <button onClick={logout} className="nav-logout">Log out</button>
                    </div>
                </>
            ) : (
                <ul className="nav-main nav-guest">
                    <li><NavLink to="/gallery" className={itemClass}>Gallery</NavLink></li>
                    <li><NavLink to="/login" className={itemClass}>Log in</NavLink></li>
                    <li><Link to="/register" className="btn" style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>Sign up</Link></li>
                </ul>
            )}
        </nav>
    );
};

export default Navbar;
