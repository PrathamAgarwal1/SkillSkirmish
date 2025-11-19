// AIAssessmentModal.jsx (corrected)
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const AIAssessmentModal = ({ onClose, userSkills }) => {
  const [chat, setChat] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [sessionState, setSessionState] = useState('idle'); // idle, active, finished
  const [selectedSkill, setSelectedSkill] = useState(userSkills && userSkills.length > 0 ? userSkills[0].name : '');
  const [progress, setProgress] = useState({ current: 0, total: 10 });
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [questionForRetry, setQuestionForRetry] = useState(null);
  const [assessmentResults, setAssessmentResults] = useState([]);
  const startEloRef = useRef(1200);

  useEffect(() => {
    if (!selectedSkill && userSkills && userSkills.length > 0) {
      setSelectedSkill(userSkills[0].name);
    }
  }, [userSkills, selectedSkill]);

  // show final summary — server already updates elo per question
  const handleAssessmentComplete = (results, finalServerData) => {
    const correctCount = results.filter(r => r.correct).length;
    const avgScore = Math.round(results.reduce((acc, r) => acc + (r.scorePercentage || 0), 0) / Math.max(1, results.length));
    const serverElo = finalServerData?.eloAfter ?? null;

    const summaryText = serverElo
      ? `Assessment complete! Correct: ${correctCount}/${results.length}. Avg score: ${avgScore}%. New ELO: ${serverElo}.`
      : `Assessment complete! Correct: ${correctCount}/${results.length}. Avg score: ${avgScore}%.`;

    setChat(prev => [...prev, { type: 'bot', text: summaryText }]);
    setSessionState('finished');
    setIsLoading(false);
  };

  const handleStart = async () => {
    if (!selectedSkill) return;

    setIsLoading(true);
    setChat([]);
    setAssessmentResults([]);
    setCurrentQuestion(null);
    setWrittenAnswer('');
    setQuestionForRetry(null);

    // starting ELO from props
    const skillData = userSkills?.find(s => s.name === selectedSkill);
    startEloRef.current = skillData?.elo || 1200;

    try {
      const res = await axios.post('/api/assessment/start', { skill: selectedSkill });
      const { question, options, type, difficulty, startElo } = res.data;

      setChat([{ type: 'bot', text: `Testing ${selectedSkill}. Starting ELO: ${startEloRef.current}. Question 1 of ${progress.total}:` }]);
      setCurrentQuestion({ question, options: options || [], type, difficulty: difficulty || 'Medium' });
      setQuestionForRetry({ question, options: options || [], type, difficulty });
      setProgress({ current: 1, total: progress.total });
      setSessionState('active');
    } catch (err) {
      console.error('Error starting assessment:', err);
      const errorMsg = err?.response?.data?.msg || 'Failed to start assessment.';
      setChat([{ type: 'bot', text: `Error: ${errorMsg}` }]);
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  const processNextStep = (resData, currentResults) => {
    const { sessionOver, nextQuestion } = resData || {};

    if (sessionOver) {
      // pass final server data (resData contains eloAfter etc.)
      handleAssessmentComplete(currentResults, resData);
      return;
    }

    // Advance progress safely (do not exceed total)
    const newProgress = Math.min(progress.total, (progress.current || 0) + 1);
    setProgress(prev => ({ ...prev, current: newProgress }));

    setTimeout(() => {
      setChat(prev => [...prev, { type: 'bot', text: `Here's question ${newProgress} of ${progress.total}:` }]);

      if (nextQuestion) {
        setCurrentQuestion({
          question: nextQuestion.question,
          options: nextQuestion.options || [],
          type: nextQuestion.type,
          difficulty: nextQuestion.difficulty || 'Medium'
        });
        setQuestionForRetry({
          question: nextQuestion.question,
          options: nextQuestion.options || [],
          type: nextQuestion.type,
          difficulty: nextQuestion.difficulty || 'Medium'
        });
      } else {
        // No next question — this should not happen unless sessionOver; keep safe
        setCurrentQuestion(null);
      }

      setIsLoading(false);
    }, 800);
  };

  const handleSendAnswer = async (answer) => {
    if (isLoading) return;
    if (!currentQuestion) return;

    setIsLoading(true);
    setChat(prev => [...prev, { type: 'user', text: answer }]);

    try {
      const res = await axios.post('/api/assessment/submit', { userAnswer: answer });
      const { scorePercentage, correctAnswer, feedback, eloAfter } = res.data || {};

      // Subjective feedback
      if (currentQuestion.type === 'subjective' || currentQuestion.type === 'written') {
        const msg = scorePercentage === 100 ? 'Excellent — full credit!' : `You scored ${scorePercentage}%. ${feedback || ''}`;
        setChat(prev => [...prev, { type: 'bot', text: msg }]);
      } else {
        // MCQ
        const isCorrect = scorePercentage === 100;
        const msg = isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${correctAnswer || ''}`;
        setChat(prev => [...prev, { type: 'bot', text: msg }]);
      }

      // Save result
      const newResult = {
        correct: scorePercentage === 100,
        scorePercentage: scorePercentage || 0,
        difficulty: currentQuestion.difficulty || 'Medium'
      };
      const updatedResults = [...assessmentResults, newResult];
      setAssessmentResults(updatedResults);

      // Reset written answer input after subjective submission
      if (currentQuestion.type === 'subjective' || currentQuestion.type === 'written') {
        setWrittenAnswer('');
      }

      // move to next step (server will indicate sessionOver or provide nextQuestion)
      processNextStep(res.data, updatedResults);

    } catch (err) {
      console.error('Error submitting answer:', err);
      setChat(prev => [...prev, { type: 'bot', text: 'There was an error submitting your answer.' }]);
      setIsLoading(false);
    }
  };

  const handleSkipQuestion = async () => {
    if (isLoading) return;
    if (!currentQuestion) return;

    setIsLoading(true);
    setChat(prev => [...prev, { type: 'user', text: '(Skipped question)' }]);

    try {
      const res = await axios.post('/api/assessment/skip');
      const newResult = { correct: false, scorePercentage: 0, difficulty: currentQuestion?.difficulty || 'Medium' };
      const updatedResults = [...assessmentResults, newResult];
      setAssessmentResults(updatedResults);

      processNextStep(res.data, updatedResults);
    } catch (err) {
      console.error('Error skipping question:', err);
      setChat(prev => [...prev, { type: 'bot', text: 'Error skipping question.' }]);
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>AI Skill Assessment {sessionState === 'active' && `(${progress.current}/${progress.total})`}</h2>

        <div className="chat-window">
          {chat.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.type}`}>{msg.text}</div>
          ))}

          {currentQuestion && !isLoading && (
            <div className="question-container">
              <div className="chat-message bot">
                {currentQuestion.question}
                <span style={{ fontSize: '0.7rem', marginLeft: 10, color: '#888', textTransform: 'uppercase' }}>
                  [{currentQuestion.difficulty}]
                </span>
              </div>

              {currentQuestion.type === 'mcq' ? (
                <div className="options-container">
                  {currentQuestion.options.map((opt, i) => (
                    <button key={i} onClick={() => handleSendAnswer(opt)} className="option-btn" disabled={isLoading}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); handleSendAnswer(writtenAnswer); }} className="written-answer-form">
                  <textarea
                    value={writtenAnswer}
                    onChange={(e) => setWrittenAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows="4"
                    disabled={isLoading}
                  />
                  <button type="submit" className="btn" disabled={isLoading || !writtenAnswer}>Submit Answer</button>
                </form>
              )}
            </div>
          )}

          {isLoading && <div className="chat-message bot">Thinking...</div>}
        </div>

        <div className="modal-actions">
          {sessionState === 'idle' && (
            <>
              <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)} disabled={!userSkills || userSkills.length === 0}>
                {userSkills && userSkills.length > 0 ? userSkills.map(s => <option key={s.name} value={s.name}>{s.name}</option>) : <option>Please add skills to your profile first</option>}
              </select>
              <button className="btn" onClick={handleStart} disabled={!userSkills || userSkills.length === 0}>Start</button>
            </>
          )}

          {sessionState === 'active' && !isLoading && (
            <button type="button" className="btn-secondary" onClick={handleSkipQuestion}>Skip</button>
          )}

          <button type="button" className="btn-secondary" onClick={onClose}>
            {sessionState === 'finished' ? 'Finish' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssessmentModal;
