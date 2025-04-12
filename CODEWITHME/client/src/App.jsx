// App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/login/Login';
import Signup from './pages/login/Signup';
import Home from './pages/home/Home';
import AdminQuiz from './pages/quiz/AdminQuiz';
import QuizPlay from './pages/quiz/QuizPlay';

function App() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setLoggedInUser(JSON.parse(storedUser));
    }
  }, []);
  
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setLoggedInUser={setLoggedInUser} />} />
        <Route path="/signup" element={<Signup setLoggedInUser={setLoggedInUser} />} />
        <Route path="/home" element={<Home loggedInUser={loggedInUser} />} />
        <Route path="/admin/quiz" element={<AdminQuiz loggedInUser={loggedInUser} />} />
        <Route path="/challenges" element={<QuizPlay loggedInUser={loggedInUser} />} />
        <Route path="/game" element={<Navigate to="/challenges" replace />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
