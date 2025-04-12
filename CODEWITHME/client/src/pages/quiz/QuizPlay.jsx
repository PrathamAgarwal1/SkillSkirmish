import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './QuizPlay.css';
import { useNavigate } from 'react-router-dom';

const QuizPlay = () => {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60); // 20 minutes
  const [quizEnded, setQuizEnded] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await axios.get('/api/quiz', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setQuestions(res.data);
      } catch (err) {
        console.error('Error fetching questions', err);
      }
    };

    fetchQuestions();
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleEndQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAnswer = (option) => {
    if (quizEnded) return;

    const currentQ = questions[current];

    if (option === currentQ.correctAnswer) {
      let points = 10;
      if (usedHint) {
        points -= 2;
      }
      setStreak(prev => prev + 1);
      if (streak >= 2) {
        points += 5;
      }
      const newScore = score + points;
      setScore(newScore);
      setMessage(`✅ Correct! +${points} points`);
      if (newScore >= 50) {
        setQuizEnded(true);
        setMessage('🎉 You reached 50 points for today!');
        return;
      }
    } else {
      setStreak(0);
      setScore(prev => prev - 5);
      setMessage('❌ Wrong answer. -5 points');
    }

    setUsedHint(false);
    setSelected(null);
    setCurrent(prev => (prev + 1) % questions.length);
  };

  const handleHint = () => {
    setUsedHint(true);
    setMessage(`💡 Hint: ${questions[current]?.hint}`);
  };

  const handleEndQuiz = () => {
    setQuizEnded(true);
    setMessage('⏱️ Time\'s up or quiz ended!');
  };

  const formatTime = () => {
    const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const seconds = (timeLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleBackHome = () => {
    navigate('/');
  };

  if (!token) {
    return <div className="quiz-container"><p>Please log in to play the quiz.</p></div>;
  }

  if (!questions.length) {
    return <div className="quiz-container"><p>Loading questions...</p></div>;
  }

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h2>🧠 Code Quiz Show</h2>
        <div className="quiz-meta">
          <span>Score: {score}</span>
          <span>Streak: {streak}</span>
          <span>⏰ {formatTime()}</span>
        </div>
      </div>

      {!quizEnded ? (
        <div className="quiz-box">
          <h3>Q{current + 1}: {questions[current].question}</h3>
          <div className="options">
            {questions[current].options.map((option, index) => (
              <button
                key={index}
                className="option-btn"
                onClick={() => handleAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="quiz-actions">
            <button onClick={handleHint} className="hint-btn">Show Hint</button>
            <button onClick={handleEndQuiz} className="end-btn">End Quiz</button>
          </div>
          <p className="quiz-message">{message}</p>
        </div>
      ) : (
        <div className="quiz-end">
          <h3>{message}</h3>
          <p>Your final score: {score}</p>
          <button onClick={handleBackHome} className="home-btn">Back to Home</button>
        </div>
      )}
    </div>
  );
};

export default QuizPlay;
