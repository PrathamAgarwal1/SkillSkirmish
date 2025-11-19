// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

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
        return <nav className="navbar"><h1>CodeCollab</h1></nav>;
    }

    return (
        <nav className="navbar">
            <h1>
                <Link to="/">CodeCollab</Link>
            </h1>
            <div className="nav-links">
                {isAuthenticated ? authLinks : guestLinks}
            </div>
        </nav>
    );
};

export default Navbar;