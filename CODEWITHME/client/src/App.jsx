// App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Challenges from './challenges';
import Home from './pages/home/Home';
import AdminQuiz from './pages/quiz/AdminQuiz';
import QuizPlay from './pages/quiz/QuizPlay';

function App() {
  const [loggedInUser, setLoggedInUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {~
      setLoggedInUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home user={loggedInUser} />} />
        <Route path="/challenges" element={<Challenges />} />
        <Route path="/admin/quiz" element={<AdminQuiz />} />
        <Route path="/quiz/play" element={<QuizPlay />} />
      </Routes>
    </Router>
  );
}
export default App;
