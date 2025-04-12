import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminQuiz.css';
import { useNavigate } from 'react-router-dom';

const AdminQuiz = () => {
  const [questions, setQuestions] = useState([]);
  const [formData, setFormData] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    hint: '',
    difficulty: ''
  });
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get('/api/quiz');
      setQuestions(res.data);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    }
  };

  const handleChange = (e, index) => {
    if (e.target.name === 'options') {
      const newOptions = [...formData.options];
      newOptions[index] = e.target.value;
      setFormData({ ...formData, options: newOptions });
    } else {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      await axios.post('/api/quiz', formData);
      fetchQuestions();
      setFormData({
        question: '',
        options: ['', '', '', ''],
        correctAnswer: '',
        hint: '',
        difficulty: ''
      });
    } catch (error) {
      console.error('Failed to add question:', error);
      setErrorMessage('Failed to add question');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/quiz/${id}`);
      fetchQuestions();
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  return (
    <div className="admin-quiz-container">
      <h2>Admin Quiz Panel</h2>
      <button className="back-home-btn" onClick={() => navigate('/')}>Back to Home</button>

      <form className="quiz-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="question"
          value={formData.question}
          onChange={handleChange}
          placeholder="Enter question"
          required
        />
        {formData.options.map((option, index) => (
          <input
            key={index}
            type="text"
            name="options"
            value={option}
            onChange={(e) => handleChange(e, index)}
            placeholder={`Option ${index + 1}`}
            required
          />
        ))}
        <input
          type="text"
          name="correctAnswer"
          value={formData.correctAnswer}
          onChange={handleChange}
          placeholder="Correct answer"
          required
        />
        <input
          type="text"
          name="hint"
          value={formData.hint}
          onChange={handleChange}
          placeholder="Hint"
        />
        <select
          name="difficulty"
          value={formData.difficulty}
          onChange={handleChange}
          required
        >
          <option value="">Select Difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        <button type="submit">Add Question</button>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </form>

      <div className="questions-list">
        <h3>All Questions</h3>
        {questions.map((q) => (
          <div key={q._id} className="question-card">
            <p><strong>Q:</strong> {q.question}</p>
            <ul>
              {q.options.map((opt, idx) => (
                <li key={idx}>{opt}</li>
              ))}
            </ul>
            <p><strong>Answer:</strong> {q.correctAnswer}</p>
            <p><strong>Hint:</strong> {q.hint}</p>
            <p><strong>Difficulty:</strong> {q.difficulty}</p>
            <button onClick={() => handleDelete(q._id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminQuiz;
