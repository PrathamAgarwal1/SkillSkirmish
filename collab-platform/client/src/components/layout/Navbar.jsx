// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { useAppearance } from '../../appearance/context';
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

/** Quick switch between classic and cozy (keeps the user's other appearance settings). */
function ThemeSwitch() {
    const { appearance, save } = useAppearance();
    const cozy = (appearance?.preset || 'classic') !== 'classic';
    const toggle = () => save({ ...(appearance || {}), preset: cozy ? 'classic' : 'cozy', colors: {}, palette: {} }).catch(() => {});
    return (
        <button className="nav-theme" onClick={toggle} aria-label={cozy ? 'Switch to the classic theme' : 'Switch to the cozy theme'} title={cozy ? 'Classic theme' : 'Cozy theme'}>
            {cozy ? '☕' : '🌙'}
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
                        <NavLink to="/appearance" className="nav-theme" aria-label="Customize the look" title="Customize the look">🎨</NavLink>
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
