import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import Editor from '@monaco-editor/react';
import { useEditorTheme } from '../utils/theme';

const AssessmentPage = () => {
    const editorTheme = useEditorTheme();
    const { skill } = useParams();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    // --- State ---
    const [phase, setPhase] = useState('intro'); // 'intro' | 'session' | 'result'
    const [loading, setLoading] = useState(false);
    const [sessionData, setSessionData] = useState(null);
    const [answer, setAnswer] = useState('');
    const [code, setCode] = useState('');
    const [history, setHistory] = useState([]);
    const [sessionStats, setSessionStats] = useState({ attempted: 0, correct: 0, poolSize: 20 });
    const [resultData, setResultData] = useState(null);

    const chatContainerRef = useRef(null);

    // Auto-scroll
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [history]);

    // Update editor when coding question loads
    useEffect(() => {
        if (sessionData?.type === 'coding') {
            setCode(sessionData.codeTemplate || `// Write your ${skill} solution here...\n`);
        }
        setAnswer('');
    }, [sessionData, skill]);

    const addToHistory = (type, text, extra = {}) => {
        setHistory(prev => [...prev, { type, text, timestamp: new Date(), ...extra }]);
    };

    // 🚩 Flag a question as wrong/unclear (3 reports pull it from the bank for review)
    const [reported, setReported] = useState({});
    const reportQuestion = async (id) => {
        if (reported[id]) return;
        const reason = window.prompt("What's wrong with this question? (optional)");
        if (reason === null) return;
        setReported(r => ({ ...r, [id]: 'sending' }));
        try {
            await axios.post(`/api/questions/${id}/report`, { reason });
            setReported(r => ({ ...r, [id]: 'done' }));
        } catch {
            setReported(r => ({ ...r, [id]: undefined }));
        }
    };

    // Language detection for Monaco
    const getEditorLanguage = () => {
        const s = (skill || '').toLowerCase();
        if (['python', 'django', 'flask'].some(k => s.includes(k))) return 'python';
        if (['java', 'spring'].some(k => s.includes(k))) return 'java';
        if (['c++', 'cpp'].some(k => s.includes(k))) return 'cpp';
        if (['bash', 'shell', 'linux'].some(k => s.includes(k))) return 'shell';
        if (['typescript', 'ts'].some(k => s.includes(k))) return 'typescript';
        return 'javascript';
    };

    const getTypeBadge = (type) => {
        const colors = { coding: '#f0883e', mcq: 'var(--term-blue)', subjective: 'var(--term-purple)' };
        const labels = { coding: 'Coding', mcq: 'Multiple choice', subjective: 'Written answer' };
        return { color: colors[type] || 'var(--text-muted)', label: labels[type] || type, name: labels[type] || type };
    };

    // =========================
    // START ASSESSMENT (mixed)
    // =========================
    // Renders a question into the transcript and makes it the active one
    const showQuestion = (q, leadingNewline = true) => {
        setSessionData(q);
        const badge = getTypeBadge(q.type);
        addToHistory('bot', `${leadingNewline ? '\n' : ''}[${badge.label}] — Difficulty: ${q.difficulty}`);
        if (q.unrated) addToHistory('bot', '⚠ No rated question is available right now — this practice question will not affect your rating.');
        if (q.title) addToHistory('bot', `Title: ${q.title}`);
        addToHistory('bot', q.question);
        if (q.code) addToHistory('bot', q.code, { code: true });
    };

    const errorText = (err) => err.response?.data?.msg || err.message || 'Connection failed.';

    const startAssessment = async () => {
        setPhase('session');
        setLoading(true);
        addToHistory('bot', `Initializing assessment for [${skill}]...`);
        addToHistory('bot', 'Assessment includes: ⌘ Coding, ☰ MCQ, and ⊳ Subjective questions. You can skip any question.');

        try {
            const res = await axios.post('/api/assessment/start', { skill });
            setSessionStats({ attempted: 0, correct: 0, poolSize: res.data.poolSize || 20 });
            showQuestion(res.data, false);
        } catch (err) {
            addToHistory('bot', `Error: ${err.response?.data?.msg || 'Connection failed.'}`);
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // SUBMIT ONE ANSWER
    // =========================
    const handleSubmitAnswer = async (e, directAnswer) => {
        if (e) e.preventDefault();

        if (loading || !sessionData) return;

        const currentType = sessionData?.type;
        const submission = directAnswer || (currentType === 'coding' ? code : answer);
        if (!submission || !submission.trim()) return;

        setLoading(true);
        addToHistory('user', currentType === 'coding' ? '[Code Submitted]' : submission);

        try {
            const res = await axios.post('/api/assessment/submit', { userAnswer: submission });
            const data = res.data;

            const resultMsg = data.scorePercentage === 100 ? '✅ CORRECT!' : `Score: ${data.scorePercentage}%`;
            addToHistory('bot', resultMsg);
            if (data.feedback) addToHistory('bot', `Analysis: ${data.feedback}`);
            if (data.questionId) addToHistory('bot', '', { reportId: data.questionId });

            setSessionStats({ attempted: data.attempted, correct: data.correct, poolSize: data.poolSize });
            setAnswer('');

            if (data.reachedPoolLimit) {
                addToHistory('bot', '🏁 All questions answered! Calculating your results...');
                setSessionData(null);
                // Auto-submit the assessment
                setTimeout(() => handleFinishAssessment(), 1500);
            } else if (data.nextQuestion) {
                // Show the next question immediately: a delayed swap left a window where a second
                // submit was graded by the server against the question the user hadn't seen yet.
                showQuestion(data.nextQuestion);
            }
        } catch (err) {
            addToHistory('bot', `Error: ${errorText(err)}`);
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // SKIP QUESTION
    // =========================
    const handleSkip = async () => {
        if (loading) return;
        setLoading(true);
        addToHistory('user', '(skipped)');

        try {
            const res = await axios.post('/api/assessment/skip');
            const data = res.data;
            if (data.skippedQuestionId) addToHistory('bot', '', { reportId: data.skippedQuestionId });

            if (data.reachedPoolLimit) {
                addToHistory('bot', '🏁 All questions exhausted. Calculating your results...');
                setSessionData(null);
                setTimeout(() => handleFinishAssessment(), 1500);
            } else if (data.nextQuestion) {
                showQuestion(data.nextQuestion);
            }
        } catch (err) {
            addToHistory('bot', `Error: ${errorText(err)}`);
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // FINISH ASSESSMENT
    // =========================
    const handleFinishAssessment = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/assessment/finish');
            if (!res.data.attempted) {
                // Nothing was answered — the server cancelled the session, so there is no result to show
                addToHistory('bot', res.data.msg || 'Assessment cancelled.');
                setSessionData(null);
                setPhase('intro');
                return;
            }
            setResultData(res.data);
            setPhase('result');
        } catch (err) {
            addToHistory('bot', `Error: ${errorText(err)}`);
        } finally {
            setLoading(false);
        }
    };

    // ==========================================================
    // RENDER: INTRO SCREEN
    // ==========================================================
    if (phase === 'intro') {
        return (
            <div className="auth-wrap">
                <div className="ui-card" style={{ width: 'min(560px, 100%)', padding: 28 }}>
                    <h1 style={{ margin: '0 0 6px', fontSize: 26, color: 'var(--text-bright)' }}>{skill} assessment</h1>
                    <p className="ui-muted" style={{ margin: '0 0 18px', lineHeight: 1.6 }}>
                        Up to 20 questions: multiple choice, written answers and coding. Questions adapt to your level and
                        you won't get ones you've already seen. Skip anything, and finish whenever you like.
                    </p>
                    <ul className="ui-list" style={{ marginBottom: 20 }}>
                        <li className="ui-row"><span className="ui-row-main">Your rating changes based on how hard the questions you get right are.</span></li>
                        <li className="ui-row"><span className="ui-row-main">Spot a wrong or unclear question? Report it with the 🚩 link after you answer.</span></li>
                    </ul>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ui-btn primary" onClick={startAssessment} style={{ padding: '10px 22px', fontSize: 15 }}>Start assessment</button>
                        <button className="ui-btn ghost" onClick={() => navigate('/profile')}>Back to profile</button>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================================
    // RENDER: RESULT SCREEN
    // ==========================================================
    if (phase === 'result' && resultData) {
        const isFirstRating = resultData.oldRating === 'Unrated';
        const changeColor = resultData.ratingChange >= 0 ? 'var(--term-green)' : 'var(--term-red)';
        const changeSign = resultData.ratingChange >= 0 ? '+' : '';

        return (
            <div className="auth-wrap">
                <div className="ui-card" style={{ width: 'min(500px, 100%)', padding: 28, textAlign: 'center' }}>
                    <h1 style={{ margin: '0 0 20px', fontSize: 24, color: 'var(--text-bright)' }}>Assessment complete</h1>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[['Answered', resultData.attempted], ['Correct', resultData.correct], ['Accuracy', `${resultData.accuracy}%`]].map(([label, value]) => (
                            <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px 8px' }}>
                                <div className="ui-muted ui-small">{label}</div>
                                <div className="ui-num" style={{ fontSize: 24, marginTop: 2 }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {resultData.unratedQuestions > 0 && (
                        <p className="ui-small" style={{ color: 'var(--term-gold)', margin: '0 0 16px' }}>
                            {resultData.unratedQuestions} practice question{resultData.unratedQuestions === 1 ? ' was' : 's were'} not counted towards your rating.
                        </p>
                    )}

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18, marginBottom: 22 }}>
                        {isFirstRating ? (
                            <>
                                <div className="ui-muted ui-small">Your first {skill} rating</div>
                                <div className="ui-num" style={{ fontSize: 44, color: 'var(--term-blue)' }}>{resultData.newRating}</div>
                            </>
                        ) : (
                            <>
                                <div className="ui-muted ui-small">{skill} rating</div>
                                <div style={{ fontSize: 40, fontWeight: 700, color: changeColor }}>{changeSign}{resultData.ratingChange}</div>
                                <div className="ui-muted">
                                    <span className="ui-num">{resultData.oldRating}</span> → <span className="ui-num" style={{ color: 'var(--term-blue)' }}>{resultData.newRating}</span>
                                </div>
                            </>
                        )}
                    </div>

                    <button className="ui-btn primary" onClick={() => navigate('/profile')} style={{ padding: '10px 22px' }}>Back to profile</button>
                </div>
            </div>
        );
    }

    // ==========================================================
    // RENDER: ASSESSMENT SESSION
    // ==========================================================
    const currentType = sessionData?.type || 'subjective';
    const isCoding = currentType === 'coding';
    const isMcq = currentType === 'mcq';
    const badge = getTypeBadge(currentType);

    return (
        <div className="assessment-layout" style={{
            height: '100%', display: 'grid', gridTemplateColumns: '240px 1fr',
            backgroundColor: 'var(--bg-dark)', color: 'var(--text-main)'
        }}>

            {/* LEFT PANEL: Session Info */}
            <div style={{
                borderRight: '1px solid var(--border-subtle)', padding: '1.5rem',
                backgroundColor: 'var(--bg-input)', display: 'flex', flexDirection: 'column'
            }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 18 }}>{skill}</div>
                {[
                    ['Question', `${sessionData?.questionNumber || '—'} of ${sessionStats.poolSize}`],
                    ['Answered', sessionStats.attempted],
                    ['Correct', sessionStats.correct],
                    ['Type', sessionData ? badge.name : '—'],
                    ['Difficulty', sessionData?.difficulty || '—']
                ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--gh-21262d)', fontSize: 14 }}>
                        <span className="ui-muted">{label}</span><span style={{ color: 'var(--text-bright)' }}>{value}</span>
                    </div>
                ))}

                {/* Progress bar */}
                <div style={{ marginTop: '0.5rem', marginBottom: '2rem' }}>
                    <div style={{
                        width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.08)',
                        borderRadius: '2px', overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${(sessionStats.attempted / sessionStats.poolSize) * 100}%`,
                            height: '100%', backgroundColor: 'var(--term-green)', transition: 'width 0.5s ease'
                        }}></div>
                    </div>
                </div>

                {/* Submit Assessment Button */}
                <div style={{ marginTop: 'auto' }}>
                    <button onClick={handleFinishAssessment}
                        disabled={loading || sessionStats.attempted === 0}
                        className="ui-btn" style={{ width: '100%', padding: 10 }}>
                        Finish and see results
                    </button>
                </div>
            </div>

            {/* MAIN PANEL */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Chat Output */}
                <div ref={chatContainerRef} style={{
                    flex: isCoding ? 0.3 : 1, overflowY: 'auto', padding: '1.5rem', fontFamily: 'var(--font-mono)',
                    scrollBehavior: 'smooth', borderBottom: '1px solid var(--border-subtle)'
                }}>
                    {history.map((h, i) => (
                        <div key={i} style={{
                            marginBottom: '0.8rem', color: h.type === 'user' ? 'var(--text-bright)' : 'var(--text-main)',
                            borderLeft: h.type === 'bot' ? '3px solid var(--term-blue)' : 'none',
                            paddingLeft: h.type === 'bot' ? '12px' : '0',
                            textAlign: h.type === 'user' ? 'right' : 'left', whiteSpace: 'pre-wrap'
                        }}>
                            <span style={{ opacity: 0.4, fontSize: '0.7em', marginRight: '8px' }}>
                                {h.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            {h.type === 'bot'
                                ? <span style={{ color: 'var(--term-blue)', fontWeight: 'bold' }}>$ </span>
                                : <span style={{ color: 'var(--term-green)', fontWeight: 'bold' }}>{'>'} </span>}
                            {h.code ? (
                                <pre style={{
                                    margin: '0.4rem 0 0', padding: '0.7rem 0.9rem', background: 'rgba(0,0,0,0.35)',
                                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                                    fontSize: '0.85rem', overflowX: 'auto', whiteSpace: 'pre'
                                }}>{h.text}</pre>
                            ) : h.reportId ? (
                                <button type="button" onClick={() => reportQuestion(h.reportId)} disabled={!!reported[h.reportId]}
                                    title="Report a wrong answer, a typo or an unclear question"
                                    style={{
                                        background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: '0.8rem',
                                        color: 'var(--text-muted)', cursor: reported[h.reportId] ? 'default' : 'pointer', textDecoration: reported[h.reportId] ? 'none' : 'underline'
                                    }}>
                                    {reported[h.reportId] === 'done' ? '🚩 Reported — thanks!' : reported[h.reportId] ? '🚩 Sending…' : '🚩 Something wrong with this question?'}
                                </button>
                            ) : (
                                <span style={{ lineHeight: '1.6' }}>{h.text}</span>
                            )}
                        </div>
                    ))}
                    {loading && <div style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Checking…</div>}
                </div>

                {/* Input Area — changes based on question type */}
                <div style={{
                    flex: isCoding ? 0.7 : '0 0 auto', display: 'flex', flexDirection: 'column',
                    backgroundColor: 'var(--bg-dark)', overflow: 'hidden'
                }}>
                    {sessionData == null ? (
                        /* No current question (pool exhausted or loading) */
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {sessionStats.attempted > 0 ? 'Click "Finish and see results" to see how you did.' : 'Loading question…'}
                        </div>
                    ) : isCoding ? (
                        /* CODING EDITOR */
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                padding: '0.5rem 1rem', backgroundColor: 'var(--bg-card)',
                                borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.85rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span style={{ color: badge.color }}>Coding · {getEditorLanguage()}</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={handleSkip} disabled={loading} className="btn-term" style={{
                                        padding: '0.3rem 0.8rem', fontSize: '0.75rem'
                                    }}>Skip</button>
                                </div>
                            </div>
                            <Editor
                                height="100%"
                                language={getEditorLanguage()}
                                theme={editorTheme}
                                value={code}
                                onChange={(val) => setCode(val)}
                                options={{
                                    minimap: { enabled: false }, fontSize: 14,
                                    fontFamily: 'JetBrains Mono, monospace',
                                    scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 },
                                    automaticLayout: true
                                }}
                            />
                            <div style={{
                                padding: '0.8rem 1rem', borderTop: '1px solid var(--border-subtle)',
                                backgroundColor: 'var(--bg-card)', display: 'flex', justifyContent: 'flex-end', gap: '0.8rem'
                            }}>
                                <button onClick={() => setCode(sessionData?.codeTemplate || '')} className="btn-term"
                                    style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>RESET</button>
                                <button onClick={handleSubmitAnswer} disabled={loading} className="btn-term-primary"
                                    style={{ padding: '0.5rem 1.5rem' }}>Submit code</button>
                            </div>
                        </div>
                    ) : isMcq && sessionData?.options?.length ? (
                        /* MCQ OPTIONS */
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ color: 'var(--term-blue)', fontSize: '0.85rem', fontWeight: 'bold' }}>Choose an answer</span>
                                <button onClick={handleSkip} disabled={loading} className="btn-term"
                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>Skip</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                {sessionData.options.map((opt, idx) => (
                                    <button key={idx}
                                        onClick={() => handleSubmitAnswer(null, opt)}
                                        disabled={loading}
                                        style={{
                                            padding: '1rem', backgroundColor: 'rgba(255,255,255,0.04)',
                                            border: '1px solid var(--border-subtle)',
                                            color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit',
                                            fontSize: '0.95rem', borderRadius: 'var(--radius-md)',
                                            textAlign: 'left', transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--term-blue)'; e.currentTarget.style.backgroundColor = 'rgba(88,166,255,0.05)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                                    >
                                        <span style={{ color: 'var(--term-blue)', fontWeight: 'bold', marginRight: '10px' }}>{String.fromCharCode(65 + idx)}.</span> {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* SUBJECTIVE TEXT INPUT */
                        <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-card)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <span style={{ color: 'var(--term-purple)', fontSize: '0.85rem', fontWeight: 'bold' }}>Your answer</span>
                                <button onClick={handleSkip} disabled={loading} className="btn-term"
                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>Skip</button>
                            </div>
                            <form onSubmit={handleSubmitAnswer} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                <span style={{ color: 'var(--term-green)', fontSize: '1.2rem' }}>{'>'}</span>
                                <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)}
                                    placeholder="Type your answer here..." autoFocus disabled={loading}
                                    style={{
                                        flex: 1, backgroundColor: 'transparent', border: 'none',
                                        borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-bright)',
                                        outline: 'none', fontFamily: 'inherit', fontSize: '1.1rem', padding: '0.5rem'
                                    }}
                                />
                                <button type="submit" disabled={loading} className="btn-term-primary"
                                    style={{ padding: '0.5rem 1rem' }}>Send</button>
                            </form>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default AssessmentPage;
