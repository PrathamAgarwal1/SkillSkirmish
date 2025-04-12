import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const [user, setUser] = useState({ username: 'Guest' }); // Set a default username
  const navigate = useNavigate();

  const handleLogout = () => {
    // If there's no login/signup, you can simply reset user state here.
    setUser(null);
    // Redirect or refresh the page
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
                {/* Assuming you no longer have an admin check */}
              </span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <span>Not logged in</span> // No login/signup buttons
          )}
        </div>
      </header>

      <div className="home-content">
        <h1>Welcome to the Coding Game Portal</h1>

        {user && (
          <div className="button-group">
            <button onClick={() => navigate('/quiz/play')}>Play Quiz</button>
            {/* You can remove the admin-specific button if no admin check */}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
