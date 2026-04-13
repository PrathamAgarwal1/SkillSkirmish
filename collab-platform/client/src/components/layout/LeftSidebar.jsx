import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { VscHome, VscAccount, VscTerminal, VscCommentDiscussion, VscOrganization, VscSignOut } from "react-icons/vsc";
import AuthContext from '../../context/AuthContext';
import './LeftSidebar.css';

const LeftSidebar = () => {
    const { isAuthenticated, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <nav className="left-sidebar">
            <div className="sidebar-top">
                <NavLink to={isAuthenticated ? '/dashboard' : '/'} className={({ isActive }) => (isActive ? 'sidebar-icon active' : 'sidebar-icon')} title="Home">
                    <VscHome size={24} />
                </NavLink>

                {isAuthenticated && (
                    <>
                        <NavLink to="/dashboard" className={({ isActive }) => (isActive && window.location.pathname === '/dashboard' ? 'sidebar-icon active' : 'sidebar-icon')} title="Matchmaking / Projects">
                            <VscOrganization size={24} />
                        </NavLink>
                        
                        <NavLink to="/forum" className={({ isActive }) => (isActive ? 'sidebar-icon active' : 'sidebar-icon')} title="Discussions">
                            <VscCommentDiscussion size={24} />
                        </NavLink>
                    </>
                )}
            </div>

            <div className="sidebar-bottom">
                {isAuthenticated ? (
                    <>
                        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'sidebar-icon active' : 'sidebar-icon')} title="Profile">
                            <VscAccount size={24} />
                        </NavLink>
                        <div className="sidebar-icon logout" onClick={handleLogout} title="Log Out">
                            <VscSignOut size={24} />
                        </div>
                    </>
                ) : (
                    <NavLink to="/login" className="sidebar-icon" title="Login">
                        <VscAccount size={24} />
                    </NavLink>
                )}
            </div>
        </nav>
    );
};

export default LeftSidebar;
