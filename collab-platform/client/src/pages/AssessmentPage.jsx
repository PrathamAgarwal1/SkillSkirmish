import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import Editor from '@monaco-editor/react';

const AssessmentPage = () => {
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

    const addToHistory = (type, text) => {
        setHistory(prev => [...prev, { type, text, timestamp: new Date() }]);
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
        const labels = { coding: '⌘ CODING', mcq: '☰ MCQ', subjective: '⊳ SUBJECTIVE' };
        return { color: colors[type] || 'var(--text-muted)', label: labels[type] || type?.toUpperCase() };
    };

    // =========================
    // START ASSESSMENT (mixed)
    // =========================
    const startAssessment = async () => {
        setPhase('session');
        setLoading(true);
        addToHistory('bot', `Initializing assessment for [${skill}]...`);
        addToHistory('bot', 'Assessment includes: ⌘ Coding, ☰ MCQ, and ⊳ Subjective questions. You can skip any question.');

        try {
            const res = await axios.post('/api/assessment/start', { skill });
            setSessionData(res.data);
            setSessionStats({ attempted: 0, correct: 0, poolSize: res.data.poolSize || 20 });

            const badge = getTypeBadge(res.data.type);
            addToHistory('bot', `[${badge.label}] — Difficulty: ${res.data.difficulty}`);
            if (res.data.title) addToHistory('bot', `Title: ${res.data.title}`);
            addToHistory('bot', res.data.question);
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

            setSessionStats({ attempted: data.attempted, correct: data.correct, poolSize: data.poolSize });
            setAnswer('');

            if (data.reachedPoolLimit) {
                addToHistory('bot', '🏁 All questions answered! Calculating your results...');
                setSessionData(null);
                // Auto-submit the assessment
                setTimeout(() => handleFinishAssessment(), 1500);
            } else if (data.nextQuestion) {
                setTimeout(() => {
                    setSessionData(data.nextQuestion);
                    const badge = getTypeBadge(data.nextQuestion.type);
                    addToHistory('bot', `\n[${badge.label}] — Difficulty: ${data.nextQuestion.difficulty}`);
                    if (data.nextQuestion.title) addToHistory('bot', `Title: ${data.nextQuestion.title}`);
                    addToHistory('bot', data.nextQuestion.question);
                }, 800);
            }
        } catch (err) {
            addToHistory('bot', `Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // =========================
    // SKIP QUESTION
    // =========================
    const handleSkip = async () => {
        setLoading(true);
        addToHistory('user', '[SKIPPED]');

        try {
            const res = await axios.post('/api/assessment/skip');
            const data = res.data;

            if (data.reachedPoolLimit) {
                addToHistory('bot', '🏁 All questions exhausted. Calculating your results...');
                setSessionData(null);
                setTimeout(() => handleFinishAssessment(), 1500);
            } else if (data.nextQuestion) {
                setSessionData(data.nextQuestion);
                const badge = getTypeBadge(data.nextQuestion.type);
                addToHistory('bot', `\n[${badge.label}] — Difficulty: ${data.nextQuestion.difficulty}`);
                if (data.nextQuestion.title) addToHistory('bot', `Title: ${data.nextQuestion.title}`);
                addToHistory('bot', data.nextQuestion.question);
            }
        } catch (err) {
            addToHistory('bot', `Error: ${err.message}`);
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
            setResultData(res.data);
            setPhase('result');
        } catch (err) {
            addToHistory('bot', `Error: ${err.response?.data?.msg || err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ==========================================================
    // RENDER: INTRO SCREEN
    // ==========================================================
    if (phase === 'intro') {
        return (
            <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-deep)',
                color: 'var(--text-main)', fontFamily: 'var(--font-mono)', gap: '2rem'
            }}>
                <div className="term-card" style={{ maxWidth: '600px', width: '90%' }}>
                    <div className="term-header">
                        <div className="window-dots">
                            <div className="dot dot-red"></div>
                            <div className="dot dot-yellow"></div>
                            <div className="dot dot-green"></div>
                        </div>
                        <span>assessment_init.sh</span>
                    </div>
                    <div className="term-body" style={{ padding: '2rem', textAlign: 'center' }}>
                        <h1 style={{ color: 'var(--term-blue)', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                            SKILL ASSESSMENT
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
                            Target: <span style={{ color: '#f0883e', fontWeight: 'bold' }}>{skill}</span>
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            20 questions • All types included • Skip any question • Submit anytime
                        </p>

                        {/* Assessment category cards */}
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', margin: '2rem 0' }}>
                            {[
                                { icon: '⌘', label: 'Coding', desc: '8 coding challenges', color: '#f0883e' },
                                { icon: '☰', label: 'MCQ', desc: '6 multiple choice', color: 'var(--term-blue)' },
                                { icon: '⊳', label: 'Subjective', desc: '6 open-ended', color: 'var(--term-purple)' }
                            ].map(m => (
                                <div key={m.label} style={{
                                    width: '160px', padding: '1.2rem',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                                    textAlign: 'center', transition: 'all 0.2s'
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.8rem' }}>{m.icon}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: m.color, marginBottom: '0.3rem' }}>{m.label}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.desc}</div>
                                </div>
                            ))}
                        </div>

                        <button className="btn-term-primary" onClick={startAssessment} style={{
                            padding: '0.8rem 3rem', fontSize: '1rem', letterSpacing: '1px',
                            borderRadius: 'var(--radius-md)', marginBottom: '1rem'
                        }}>
                            {'▸'} START ASSESSMENT
                        </button>

                        <div>
                            <button onClick={() => navigate('/profile')} className="btn-term" style={{
                                fontSize: '0.85rem', padding: '0.5rem 1.5rem'
                            }}>← Back to Profile</button>
                        </div>
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
            <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-deep)',
                color: 'var(--text-main)', fontFamily: 'var(--font-mono)', gap: '2rem'
            }}>
                <div className="term-card" style={{ maxWidth: '500px', width: '90%' }}>
                    <div className="term-header">
                        <div className="window-dots">
                            <div className="dot dot-red"></div>
                            <div className="dot dot-yellow"></div>
                            <div className="dot dot-green"></div>
                        </div>
                        <span>results.log</span>
                    </div>
                    <div className="term-body" style={{ padding: '2.5rem', textAlign: 'center' }}>
                        <h1 style={{ color: 'var(--term-blue)', fontSize: '1.5rem', marginBottom: '2rem', letterSpacing: '2px' }}>
                            ASSESSMENT COMPLETE
                        </h1>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.3rem' }}>ATTEMPTED</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-bright)' }}>{resultData.attempted}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.3rem' }}>CORRECT</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--term-green)' }}>{resultData.correct}</div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.3rem' }}>ACCURACY</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--term-gold)' }}>{resultData.accuracy}%</div>
                            </div>
                        </div>

                        {isFirstRating ? (
                            /* First assessment — show initial placement */
                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>INITIAL RATING</div>
                                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--term-blue)' }}>
                                    {resultData.newRating}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                    Your first rating has been established!
                                </div>
                            </div>
                        ) : (
                            /* Returning user — show change */
                            <>
                                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>RATING CHANGE</div>
                                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: changeColor }}>
                                        {changeSign}{resultData.ratingChange}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2rem' }}>
                                    <div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>OLD RATING</div>
                                        <div style={{ fontSize: '1.3rem', color: 'var(--text-bright)' }}>{resultData.oldRating}</div>
                                    </div>
                                    <div style={{ color: 'var(--border-subtle)', fontSize: '1.5rem', alignSelf: 'center' }}>→</div>
                                    <div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>NEW RATING</div>
                                        <div style={{ fontSize: '1.3rem', color: 'var(--term-blue)', fontWeight: 'bold' }}>{resultData.newRating}</div>
                                    </div>
                                </div>
                            </>
                        )}

                        <button className="btn-term-primary" onClick={() => navigate('/profile')} style={{
                            padding: '0.8rem 2rem', fontSize: '1rem', borderRadius: 'var(--radius-md)'
                        }}>RETURN TO PROFILE</button>
                    </div>
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
            height: '100%', display: 'grid', gridTemplateColumns: '250px 1fr 280px',
            backgroundColor: 'var(--bg-dark)', color: 'var(--text-main)',
            fontFamily: 'var(--font-mono)'
        }}>

            {/* LEFT PANEL: Session Info */}
            <div style={{
                borderRight: '1px solid var(--border-subtle)', padding: '1.5rem',
                backgroundColor: 'var(--bg-input)', display: 'flex', flexDirection: 'column'
            }}>
                <h3 style={{ color: 'var(--term-blue)', fontSize: '0.8rem', letterSpacing: '2px', marginBottom: '1.5rem' }}>// SESSION INFO</h3>

                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>TARGET SKILL</div>
                    <div style={{ color: '#f0883e', fontWeight: 'bold' }}>{skill}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>ASSESSMENT MODE</div>
                    <div style={{ color: 'var(--term-purple)', fontWeight: 'bold' }}>MIXED</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>QUESTIONS ANSWERED</div>
                    <div style={{ color: 'var(--text-bright)', fontWeight: 'bold' }}>{sessionStats.attempted} / {sessionStats.poolSize}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>CORRECT</div>
                    <div style={{ color: 'var(--term-green)', fontWeight: 'bold' }}>{sessionStats.correct}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>SESSION STATUS</div>
                    <div className="blink" style={{ color: 'var(--term-gold)', fontWeight: 'bold' }}>ACTIVE</div>
                </div>

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
                        style={{
                            width: '100%', padding: '0.8rem',
                            backgroundColor: sessionStats.attempted > 0 ? 'var(--term-red)' : 'rgba(255,255,255,0.08)',
                            color: 'var(--text-bright)', border: '1px solid rgba(240,246,252,0.1)',
                            borderRadius: 'var(--radius-md)',
                            cursor: sessionStats.attempted > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: '600', fontFamily: 'inherit', fontSize: '0.85rem', letterSpacing: '1px'
                        }}>
                        SUBMIT ASSESSMENT
                    </button>
                </div>
            </div>

            {/* MAIN PANEL */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Chat Output */}
                <div ref={chatContainerRef} style={{
                    flex: isCoding ? 0.3 : 1, overflowY: 'auto', padding: '1.5rem',
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
                            <span style={{ lineHeight: '1.6' }}>{h.text}</span>
                        </div>
                    ))}
                    {loading && <div className="blink" style={{ color: 'var(--term-blue)', marginTop: '1rem' }}>_ processing...</div>}
                </div>

                {/* Input Area — changes based on question type */}
                <div style={{
                    flex: isCoding ? 0.7 : '0 0 auto', display: 'flex', flexDirection: 'column',
                    backgroundColor: 'var(--bg-dark)', overflow: 'hidden'
                }}>
                    {sessionData == null ? (
                        /* No current question (pool exhausted or loading) */
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {sessionStats.attempted > 0 ? 'Click SUBMIT ASSESSMENT to see your results.' : 'Loading question...'}
                        </div>
                    ) : isCoding ? (
                        /* CODING EDITOR */
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                padding: '0.5rem 1rem', backgroundColor: 'var(--bg-card)',
                                borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.85rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span style={{ color: badge.color }}>[CODING] — {getEditorLanguage().toUpperCase()}</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={handleSkip} disabled={loading} className="btn-term" style={{
                                        padding: '0.3rem 0.8rem', fontSize: '0.75rem'
                                    }}>SKIP {'»'}</button>
                                </div>
                            </div>
                            <Editor
                                height="100%"
                                language={getEditorLanguage()}
                                theme="vs-dark"
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
                                    style={{ padding: '0.5rem 1.5rem' }}>SUBMIT CODE</button>
                            </div>
                        </div>
                    ) : isMcq && sessionData?.options?.length ? (
                        /* MCQ OPTIONS */
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ color: 'var(--term-blue)', fontSize: '0.85rem', fontWeight: 'bold' }}>☰ Select your answer:</span>
                                <button onClick={handleSkip} disabled={loading} className="btn-term"
                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>SKIP {'»'}</button>
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
                                <span style={{ color: 'var(--term-purple)', fontSize: '0.85rem', fontWeight: 'bold' }}>⊳ Your answer:</span>
                                <button onClick={handleSkip} disabled={loading} className="btn-term"
                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>SKIP {'»'}</button>
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
                                    style={{ padding: '0.5rem 1rem' }}>SEND</button>
                            </form>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL */}
            <div style={{
                borderLeft: '1px solid var(--border-subtle)', padding: '1.5rem',
                backgroundColor: 'var(--bg-input)'
            }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '1px', marginBottom: '0.5rem' }}>CURRENT TYPE</h4>
                    <span style={{
                        backgroundColor: 'rgba(255,255,255,0.04)', color: badge.color, padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)', fontSize: '0.9rem',
                        border: '1px solid var(--border-subtle)', fontWeight: 'bold'
                    }}>{badge.label}</span>
                </div>
                <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '1px', marginBottom: '0.5rem' }}>DIFFICULTY</h4>
                    <span style={{
                        color: sessionData?.difficulty === 'Hard' ? 'var(--term-red)' :
                            sessionData?.difficulty === 'Medium' ? 'var(--term-gold)' : 'var(--term-green)',
                        fontWeight: 'bold', fontSize: '1.1rem'
                    }}>{sessionData?.difficulty || '—'}</span>
                </div>
                <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '1px', marginBottom: '0.5rem' }}>QUESTION #</h4>
                    <span style={{ color: 'var(--text-bright)', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {sessionData?.questionNumber || '—'} / {sessionStats.poolSize}
                    </span>
                </div>
            </div>

            <style>{`
                .blink { animation: blinker 1.5s linear infinite; }
                @keyframes blinker { 50% { opacity: 0.3; } }
            `}</style>
        </div>
    );
};

export default AssessmentPage;
