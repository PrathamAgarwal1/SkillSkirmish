// client/src/components/Header.jsx
import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import './Header.css';

const Header = () => {
  const [username, setUsername] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/user/profile');
        setUsername(res.data.username);
      } catch (err) {
        setUsername(''); // Not logged in
      }
    };

    fetchProfile();
  }, []);

  return (
    <header className="header">
      <div className="header-left">🎮 Game Portal</div>
      <div className="header-right">
        {username ? `👤 ${username}` : 'Not logged in'}
      </div>
    </header>
  );
};

export default Header;
