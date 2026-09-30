// routes/assessment.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AssessmentSession = require('../models/AssessmentSession');
const User = require('../models/User');
const { generateJSON, evaluateSubjectiveWithAI } = require('../utils/aiHelper');

// Drop stale unique index on 'user' if it exists (legacy schema had unique:true)
(async () => {
  try {
    const collection = AssessmentSession.collection;
    const indexes = await collection.indexes();
    const userIndex = indexes.find(idx => idx.key && idx.key.user && idx.unique);
    if (userIndex) {
      await collection.dropIndex(userIndex.name);
      console.log('[Assessment] Dropped stale unique index on user:', userIndex.name);
    }
  } catch (e) {
    // If collection doesn't exist yet or index already gone, ignore
    if (e.code !== 26) console.log('[Assessment] Index cleanup note:', e.message);
  }
})();

// CONFIG
const POOL_SIZE = 20;
const K_PROVISIONAL = 40;
const K_DEFAULT = 20;
const K_TOP = 10;
const GENERATE_RETRY_LIMIT = 4;

// --- Helpers ---
function getKFactor(matchesPlayed, elo) {
  if (!elo || matchesPlayed < 30) return K_PROVISIONAL;
  if (elo >= 2400) return K_TOP;
  return K_DEFAULT;
}

function shuffleArray(arr) {
  return arr
    .map(v => ({ v, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(obj => obj.v);
}

function expectedProbability(userElo, difficultyElo) {
  return 1 / (1 + Math.pow(10, (difficultyElo - userElo) / 400));
}

// AI output fields are sometimes numbers/objects/arrays; store everything as text.
function stringifyAnswer(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Makes an MCQ's answer exactly equal to one of its options.
 * Handles "B", "(B)", "B) text", and answers that differ only by an option prefix/case.
 * Returns { options, answer } or null if the answer can't be matched.
 */
function normalizeMcq(rawOptions, rawAnswer) {
  if (!Array.isArray(rawOptions)) return null;
  const options = rawOptions.map(o => stringifyAnswer(o).trim()).filter(Boolean).slice(0, 6);
  if (options.length < 2) return null;

  const answer = stringifyAnswer(rawAnswer).trim();
  if (options.includes(answer)) return { options, answer };

  const letter = answer.match(/^\(?([A-Fa-f])(?:[).:\s]|$)/);
  if (letter) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    // "B" alone, or "B) <text>" whose text matches option B
    if (options[idx] && (answer.length <= 3 || strip(answer) === strip(options[idx]))) {
      return { options, answer: options[idx] };
    }
  }

  const target = strip(answer);
  const match = options.find(o => strip(o) === target);
  return match ? { options, answer: match } : null;
}

function strip(s) {
  return String(s).replace(/^\(?[A-Fa-f][).:]\s*/, '').trim().toLowerCase();
}

/**
 * Build a randomized question plan mixing all types.
 * 20 questions: 8 coding, 6 mcq, 6 subjective (shuffled)
 */
function buildQuestionPlan() {
  let plan = [];
  plan.push(...Array(8).fill('coding'));
  plan.push(...Array(6).fill('mcq'));
  plan.push(...Array(6).fill('subjective'));
  return shuffleArray(plan);
}

/**
 * Convert dynamic ELO to a UI difficulty label.
 */
function getDynamicLabel(questionElo, userElo) {
  if (questionElo < userElo - 75) return 'Easy';
  if (questionElo > userElo + 75) return 'Hard';
  return 'Medium';
}

/**
 * Build a dynamic difficulty plan: mix of numerical ELO targets
 * 20 questions: 
 * - 60% growth (12 questions): userElo + 50 to userElo + 150
 * - 30% stability (6 questions): userElo - 50 to userElo + 50
 * - 10% confidence (2 questions): userElo - 150 to userElo - 50
 * Returns array of targets sorted to ensure smooth progression.
 */
function buildDynamicDifficultyPlan(userElo) {
  const baseElo = userElo || 1200;
  let plan = [];
  
  // 10% confidence (2 questions)
  for(let i=0; i<2; i++) {
    plan.push(baseElo - 50 - Math.random() * 100); // -150 to -50
  }
  // 30% stability (6 questions)
  for(let i=0; i<6; i++) {
    plan.push(baseElo - 50 + Math.random() * 100); // -50 to +50
  }
  // 60% growth (12 questions)
  for(let i=0; i<12; i++) {
    plan.push(baseElo + 50 + Math.random() * 100); // +50 to +150
  }
  
  // Add randomness ±30, then sort for smooth progression
  plan = plan.map(elo => elo + (Math.random() * 60 - 30));
  return plan.map(Math.round).sort((a, b) => a - b);
}

/**
 * Generate a question of a requiredType while avoiding duplicates.
 */
async function generateQuestion(skill, currentElo, requiredType, avoidList = [], targetElo = null) {
  const effectiveElo = currentElo || 1200;
  let lastErr = null;
  const qElo = targetElo || effectiveElo;
  const diffLabel = getDynamicLabel(qElo, effectiveElo);

  for (let attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
    try {
      const typeLabel = requiredType === 'mcq' ? 'Multiple Choice' : requiredType === 'coding' ? 'Coding Challenge' : 'Open Ended Subjective';

      const prompt = `
        Task: Generate 1 unique technical interview question.
        Topic: ${skill}
        Difficulty: ${diffLabel} (ELO ~${qElo})
        Type: ${requiredType} — ${typeLabel}
        
        CRITICAL RULES:
        - You MUST return type "${requiredType}" exactly.
        ${requiredType === 'mcq' ? '- You MUST include exactly 4 options in the "options" array.\n        - The question must be answerable by selecting one option.' : ''}
        ${requiredType === 'coding' ? '- You MUST include "codeTemplate" with ONLY an empty function skeleton / boilerplate. Do NOT write any solution logic in codeTemplate. Just the function signature and empty body with a comment like "// your code here".\n        - You MUST include "testCases" array with at least 2 test cases.\n        - You MUST include a "title" for the coding problem.\n        - The "answer" field should contain the correct solution code.\n        - Do NOT include "options".' : ''}
        ${requiredType === 'subjective' ? '- This is an open-ended question requiring a written answer.\n        - Do NOT include "options", "codeTemplate", or "testCases".' : ''}
        
        Constraints:
        - Valid JSON output only. No markdown, no backticks.
        - Unique from: ${JSON.stringify(avoidList.map(q => q.substring(0, 50)))}
        
        JSON Structure:
        {
          "question": "The question text",
          "title": "Short Title",
          "options": ["A", "B", "C", "D"],
          "answer": "The correct answer",
          "difficulty": "Easy|Medium|Hard",
          "type": "${requiredType}",
          "codeTemplate": "starter code here",
          "testCases": [{ "input": "...", "output": "..." }]
        }
      `;

      const aiData = await generateJSON(prompt);
      if (!aiData || !aiData.question) throw new Error('Invalid AI response');

      const qText = String(aiData.question).trim();
      if (avoidList.some(prev => String(prev).trim() === qText)) {
        throw new Error('Duplicate question');
      }

      // MCQ answers must be one of the options verbatim, or correct picks get graded as wrong
      let options = [];
      let answer = stringifyAnswer(aiData.answer) || 'Refer to documentation';
      if (requiredType === 'mcq') {
        const mcq = normalizeMcq(aiData.options, aiData.answer);
        if (!mcq) throw new Error('MCQ answer does not match any option');
        ({ options, answer } = mcq);
      }

      // Force the type to match what we asked for
      return {
        type: requiredType,
        question: qText,
        title: String(aiData.title || 'Challenge').slice(0, 120),
        options,
        answer,
        // Our own label, not the model's free-form string (which can break the schema enum)
        difficulty: diffLabel,
        codeTemplate: requiredType === 'coding' ? String(aiData.codeTemplate || `// Write your ${skill} solution here\n`) : '',
        testCases: requiredType === 'coding' && Array.isArray(aiData.testCases)
          ? aiData.testCases.slice(0, 10).map(tc => ({ input: stringifyAnswer(tc?.input), output: stringifyAnswer(tc?.output) }))
          : [],
        difficultyElo: qElo
      };
    } catch (err) {
      lastErr = err;
      console.log(`[Assessment] Gen attempt ${attempt} failed: ${err.message}`);
    }
  }

  // FALLBACK — used when every AI provider fails. These are practice-only: isFallback keeps
  // them out of the ELO calculation so an AI outage can't be farmed for rating.
  console.warn('[Assessment] Using Fallback Question:', lastErr?.message);
  if (requiredType === 'mcq') {
    return {
      type: 'mcq', question: `Which of the following best describes ${skill}?`, title: 'Fallback MCQ (unrated)',
      options: ["Core framework", "Utility library", "Design pattern", "All of the above"],
      answer: "All of the above", difficulty: diffLabel, codeTemplate: '', testCases: [], difficultyElo: qElo, isFallback: true
    };
  } else if (requiredType === 'coding') {
    return {
      type: 'coding', question: `Write a function that demonstrates a core concept of ${skill}.`,
      title: 'Fallback Coding (unrated)', options: [], answer: '// Solution code',
      difficulty: diffLabel, codeTemplate: `// Write your ${skill} solution here\n`, testCases: [{ input: 'test', output: 'test' }], difficultyElo: qElo, isFallback: true
    };
  } else {
    return {
      type: 'subjective', question: `Explain the core concepts of ${skill} and when you would use it.`,
      title: 'Fallback Subjective (unrated)', options: [], answer: 'Refer to documentation',
      difficulty: diffLabel, codeTemplate: '', testCases: [], difficultyElo: qElo, isFallback: true
    };
  }
}

/** Copies a generated question onto the session as the "current" question. */
function setCurrentQuestion(session, q, type, fallbackElo) {
  session.currentQuestionText = q.question;
  session.currentOptions = q.options || [];
  session.currentAnswer = q.answer;
  session.currentTitle = q.title || '';
  session.currentCodeTemplate = q.codeTemplate || '';
  session.currentTestCases = q.testCases || [];
  session.currentDifficulty = q.difficulty || 'Medium';
  session.currentDifficultyElo = q.difficultyElo || fallbackElo;
  session.currentType = type;
  session.currentIsFallback = !!q.isFallback;
  if (!session.askedQuestions.includes(q.question)) {
    session.askedQuestions.push(q.question);
  }
}

/** Generates the question at plan index `index` for a session. */
async function generateNextQuestion(session, index) {
  const nextType = (Array.isArray(session.questionPlan) && session.questionPlan[index]) || 'subjective';
  const nextDifficultyElo = (Array.isArray(session.difficultyPlanElos) && session.difficultyPlanElos[index]) || session.startRating || 1200;
  const effectiveRating = session.startRating || 1200;
  const q = await generateQuestion(session.skill, effectiveRating, nextType, session.askedQuestions || [], nextDifficultyElo);
  return { q, nextType, nextDifficultyElo };
}

/** The payload the client renders for a question (never includes the answer). */
function questionPayload(q, type, questionNumber, poolSize) {
  return {
    question: q.question,
    options: q.options || [],
    type,
    difficulty: q.difficulty || 'Medium',
    title: q.title || '',
    codeTemplate: q.codeTemplate || '',
    testCases: q.testCases || [],
    unrated: !!q.isFallback,
    questionNumber,
    poolSize
  };
}

// One submit/skip at a time per user, so a double-click can't grade the same question twice
const busyUsers = new Set();
const withUserLock = (handler) => async (req, res) => {
  if (busyUsers.has(req.user.id)) {
    return res.status(429).json({ msg: 'Still processing your previous answer.' });
  }
  busyUsers.add(req.user.id);
  try {
    await handler(req, res);
  } finally {
    busyUsers.delete(req.user.id);
  }
};

// =============================================================
// POST /api/assessment/start
// Accepts: { skill }
// Creates a session with mixed question types (coding/mcq/subjective)
// =============================================================
router.post('/start', auth, withUserLock(async (req, res) => {
  try {
    const skill = typeof req.body.skill === 'string' ? req.body.skill.trim().slice(0, 50) : '';
    if (!skill) return res.status(400).json({ msg: 'Skill is missing.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const skillData = (user.skills || []).find(s => s.name === skill);
    const currentRating = skillData ? skillData.elo : null;

    // Clear old incomplete sessions FIRST (before generating, so we don't fail after cleanup)
    await AssessmentSession.deleteMany({ user: req.user.id, completed: false });

    const session = new AssessmentSession({
      user: req.user.id,
      skill,
      assessmentMode: 'mixed',
      startRating: currentRating,
      poolSize: POOL_SIZE,
      questionCount: 1,
      askedQuestions: [],
      questionPlan: buildQuestionPlan(),
      difficultyPlanElos: buildDynamicDifficultyPlan(currentRating),
      questionsLog: [],
      completed: false
    });

    // generateQuestion never throws — it falls back to an unrated question
    const { q, nextType, nextDifficultyElo } = await generateNextQuestion(session, 0);
    setCurrentQuestion(session, q, nextType, nextDifficultyElo);
    await session.save();

    return res.json({ ...questionPayload(q, nextType, 1, POOL_SIZE), skill });
  } catch (err) {
    console.error('[Assessment][start] Error:', err);
    return res.status(500).json({ msg: 'Failed to start assessment.' });
  }
}));

// =============================================================
// POST /api/assessment/submit
// Grades one answer, logs it, generates next question.
// Does NOT update user ELO.
// =============================================================
router.post('/submit', auth, withUserLock(async (req, res) => {
  try {
    const userAnswer = stringifyAnswer(req.body.userAnswer).slice(0, 20000);
    const session = await AssessmentSession.findOne({ user: req.user.id, completed: false });
    if (!session) return res.status(404).json({ msg: 'No active assessment found.' });
    if (!session.currentQuestionText) {
      return res.status(400).json({ msg: 'No question is waiting for an answer. Finish the assessment.' });
    }

    const qType = session.currentType || 'subjective';

    // --- Grade the current answer ---
    let scorePercentage = 0;
    let feedback = '';
    let gradingFailed = false;
    let correctAnswer = session.currentAnswer;

    if (qType === 'mcq') {
      const isCorrect = userAnswer.trim() === String(session.currentAnswer || '').trim();
      scorePercentage = isCorrect ? 100 : 0;
      feedback = isCorrect ? 'Correct!' : 'Incorrect.';
      correctAnswer = isCorrect ? null : session.currentAnswer;
    } else if (!userAnswer.trim()) {
      feedback = 'No answer submitted.';
    } else {
      const aiResult = await evaluateSubjectiveWithAI(
        session.currentQuestionText,
        session.currentAnswer,
        userAnswer
      );
      scorePercentage = aiResult.bucketScore || 0;
      feedback = aiResult.feedback || '';
      gradingFailed = !!aiResult.failed;
    }

    // --- Log this question (NO ELO update) ---
    session.questionsLog.push({
      questionText: session.currentQuestionText,
      questionType: qType,
      difficulty: session.currentDifficulty || 'Medium',
      difficultyElo: session.currentDifficultyElo || 1200,
      isFallback: !!session.currentIsFallback || gradingFailed,
      userAnswer,
      correctAnswer: session.currentAnswer,
      scorePercentage,
      feedback,
      title: session.currentTitle || '',
      codeTemplate: session.currentCodeTemplate || '',
      testCases: session.currentTestCases || []
    });

    const attempted = session.questionsLog.length;
    const correct = session.questionsLog.filter(q => q.scorePercentage === 100).length;
    // Skips also consume plan slots, so stop when either limit is hit
    const reachedPoolLimit = attempted >= session.poolSize || session.questionCount >= session.poolSize;

    // --- Generate next question ---
    let nextQuestion = null;
    if (!reachedPoolLimit) {
      const nextIndex = session.questionCount; // 0-based next
      const { q, nextType, nextDifficultyElo } = await generateNextQuestion(session, nextIndex);
      setCurrentQuestion(session, q, nextType, nextDifficultyElo);
      session.questionCount = nextIndex + 1;
      nextQuestion = questionPayload(q, nextType, nextIndex + 1, session.poolSize);
    } else {
      session.currentQuestionText = '';
    }

    await session.save();

    return res.json({
      scorePercentage,
      feedback,
      correctAnswer,
      attempted,
      correct,
      poolSize: session.poolSize,
      reachedPoolLimit,
      nextQuestion
    });
  } catch (err) {
    console.error('[Assessment] Submit Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
}));

// =============================================================
// POST /api/assessment/skip
// Skips the current question without answering, loads next.
// =============================================================
router.post('/skip', auth, withUserLock(async (req, res) => {
  try {
    const session = await AssessmentSession.findOne({ user: req.user.id, completed: false });
    if (!session) return res.status(404).json({ msg: 'No active assessment found.' });

    const attempted = session.questionsLog.length;
    const correct = session.questionsLog.filter(q => q.scorePercentage === 100).length;

    // Move to next question in the plan
    const nextIndex = session.questionCount;
    if (nextIndex >= session.poolSize) {
      session.currentQuestionText = '';
      await session.save();
      return res.json({ reachedPoolLimit: true, attempted, correct, poolSize: session.poolSize, nextQuestion: null });
    }

    const { q, nextType, nextDifficultyElo } = await generateNextQuestion(session, nextIndex);
    setCurrentQuestion(session, q, nextType, nextDifficultyElo);
    session.questionCount = nextIndex + 1;
    await session.save();

    return res.json({
      skipped: true,
      attempted,
      correct,
      poolSize: session.poolSize,
      reachedPoolLimit: false,
      nextQuestion: questionPayload(q, nextType, nextIndex + 1, session.poolSize)
    });
  } catch (err) {
    console.error('[Assessment] Skip Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
}));

/**
 * ELO change for a whole session: ΔR = K × Σ(Sᵢ − Eᵢ) over rated questions.
 * Exported for unit tests.
 */
function computeSessionRating(oldRating, matchesPlayed, log) {
  const rated = log.filter(entry => !entry.isFallback);
  const kFactor = getKFactor(matchesPlayed, oldRating);
  let totalExpected = 0;
  let totalActual = 0;
  for (const entry of rated) {
    totalExpected += expectedProbability(oldRating, entry.difficultyElo || 1200);
    totalActual += (entry.scorePercentage || 0) / 100.0;
  }
  const ratingChange = Math.round(kFactor * (totalActual - totalExpected));
  return { ratingChange, newRating: Math.max(0, oldRating + ratingChange), kFactor, ratedCount: rated.length };
}

// =============================================================
// POST /api/assessment/finish
// Calculates ELO from all questionsLog, updates user, returns result.
// =============================================================
router.post('/finish', auth, withUserLock(async (req, res) => {
  try {
    const session = await AssessmentSession.findOne({ user: req.user.id, completed: false });
    if (!session) return res.status(404).json({ msg: 'No active assessment to finish.' });

    const log = session.questionsLog || [];
    const attempted = log.length;

    if (attempted === 0) {
      await AssessmentSession.deleteOne({ _id: session._id });
      return res.json({ msg: 'Assessment cancelled. No questions were answered.', attempted: 0 });
    }

    const correct = log.filter(q => q.scorePercentage === 100).length;
    const accuracy = Math.round((correct / attempted) * 100);

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (!(user.skills || []).some(s => s.name === session.skill)) {
      user.skills.push({ name: session.skill, elo: null, mastery: 0, matchesPlayed: 0, isProvisional: true, history: [] });
    }
    const skillObj = user.skills.find(s => s.name === session.skill);

    const oldRating = skillObj.elo;
    const effectiveOldRating = oldRating !== null && oldRating !== undefined ? oldRating : 1200;
    const matchesPlayed = skillObj.matchesPlayed || 0;
    const { ratingChange, newRating, ratedCount } = computeSessionRating(effectiveOldRating, matchesPlayed, log);

    // A session made only of fallback (AI-outage) questions doesn't rate the user
    if (ratedCount > 0) {
      skillObj.elo = newRating;
      // Rescaled mastery: a perfect assessment grants +30 mastery
      const masteryGain = Math.round((accuracy / 100) * 30);
      skillObj.mastery = Math.max(0, Math.min(100, (skillObj.mastery || 0) + masteryGain));
      skillObj.matchesPlayed = matchesPlayed + ratedCount;
      skillObj.isProvisional = skillObj.matchesPlayed < 30;
      skillObj.history.push({
        date: new Date(),
        eloChange: ratingChange,
        newElo: newRating,
        questionId: `assessment_${ratedCount}q`
      });
    }
    skillObj.lastPracticedAt = new Date();

    await user.save();

    const finalNewRating = ratedCount > 0 ? newRating : skillObj.elo;
    const finalChange = ratedCount > 0 ? ratingChange : 0;

    session.completed = true;
    session.finalResult = { attempted, correct, accuracy, oldRating, newRating: finalNewRating, ratingChange: finalChange };
    await session.save();

    return res.json({
      attempted, correct, accuracy,
      oldRating: oldRating !== null && oldRating !== undefined ? oldRating : 'Unrated',
      newRating: finalNewRating ?? 'Unrated',
      ratingChange: finalChange,
      unratedQuestions: attempted - ratedCount,
      sessionOver: true
    });
  } catch (err) {
    console.error('[Assessment] Finish Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
}));

module.exports = router;
module.exports._internals = { normalizeMcq, computeSessionRating, buildDynamicDifficultyPlan, getKFactor, expectedProbability };
