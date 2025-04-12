import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Home.css';

const Home = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchUser = async () => {
      try {
        const res = await axios.get('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data);
      } catch (err) {
        console.error('Error fetching user profile', err);
      }
    };

    fetchUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/');
  };

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="logo">Game Portal</div>
        <div className="user-section">
          {user ? (
            <>
              <span className="user-info">
                Welcome, {user.username}
                {user.isAdmin && <span className="admin-tag">Admin</span>}
              </span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')}>Login</button>
              <button onClick={() => navigate('/signup')}>Signup</button>
            </>
          )}
        </div>
      </header>

      <div className="home-content">
        <h1>Welcome to the Coding Game Portal</h1>

        {user && (
          <div className="button-group">
            <button onClick={() => navigate('/challenges')}>Go to Challenges</button>
            {user.isAdmin && (
              <button onClick={() => navigate('/admin/quiz')}>Admin Panel</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
