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

function difficultyToElo(difficulty) {
  if (!difficulty) return 1200;
  const d = String(difficulty).toLowerCase();
  if (d === 'easy') return 1000;
  if (d === 'medium') return 1200;
  if (d === 'hard') return 1400;
  return 1200;
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

      // Force the type to match what we asked for
      return {
        type: requiredType,
        question: qText,
        title: aiData.title || 'Challenge',
        options: requiredType === 'mcq' && Array.isArray(aiData.options) ? aiData.options : [],
        answer: aiData.answer || 'Refer to documentation',
        difficulty: aiData.difficulty || diffLabel,
        codeTemplate: requiredType === 'coding' ? (aiData.codeTemplate || `// Write your ${skill} solution here\n`) : '',
        testCases: requiredType === 'coding' && Array.isArray(aiData.testCases) ? aiData.testCases : [],
        difficultyElo: qElo
      };
    } catch (err) {
      lastErr = err;
      console.log(`[Assessment] Gen attempt ${attempt} failed: ${err.message}`);
    }
  }

  // FALLBACK
  console.warn('[Assessment] Using Fallback Question');
  if (requiredType === 'mcq') {
    return {
      type: 'mcq', question: `Which of the following best describes ${skill}?`, title: 'Fallback MCQ',
      options: ["Core framework", "Utility library", "Design pattern", "All of the above"],
      answer: "All of the above", difficulty: diffLabel, codeTemplate: '', testCases: [], difficultyElo: qElo
    };
  } else if (requiredType === 'coding') {
    return {
      type: 'coding', question: `Write a function that demonstrates a core concept of ${skill}.`,
      title: 'Fallback Coding', options: [], answer: '// Solution code',
      difficulty: diffLabel, codeTemplate: `// Write your ${skill} solution here\n`, testCases: [{ input: 'test', output: 'test' }], difficultyElo: qElo
    };
  } else {
    return {
      type: 'subjective', question: `Explain the core concepts of ${skill} and when you would use it.`,
      title: 'Fallback Subjective', options: [], answer: 'Refer to documentation',
      difficulty: diffLabel, codeTemplate: '', testCases: [], difficultyElo: qElo
    };
  }
}

// =============================================================
// POST /api/assessment/start
// Accepts: { skill }
// Creates a session with mixed question types (coding/mcq/subjective)
// =============================================================
router.post('/start', auth, async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill) return res.status(400).json({ msg: 'Skill is missing.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const skillData = (user.skills || []).find(s => s.name === skill);
    const currentRating = skillData ? skillData.elo : null;

    // Clear old incomplete sessions FIRST (before generating, so we don't fail after cleanup)
    await AssessmentSession.deleteMany({ user: req.user.id, completed: false });

    // Build randomized plans
    const plan = buildQuestionPlan();
    const diffPlanElos = buildDynamicDifficultyPlan(currentRating);
    const firstType = plan[0];
    const firstDifficultyElo = diffPlanElos[0];

    // Generate first question (this can fail — fallback is built into generateQuestion)
    let aiData;
    try {
      aiData = await generateQuestion(skill, currentRating, firstType, [], firstDifficultyElo);
    } catch (genErr) {
      console.error('[Assessment][start] Question generation failed:', genErr.message);
      // Use a hardcoded fallback so the session can still start
      aiData = {
        type: firstType, question: `Explain a core concept of ${skill}.`,
        title: 'Getting Started', options: firstType === 'mcq' ? ['Option A', 'Option B', 'Option C', 'Option D'] : [],
        answer: 'Refer to documentation', difficulty: getDynamicLabel(firstDifficultyElo, currentRating || 1200),
        codeTemplate: firstType === 'coding' ? `// Write your ${skill} solution here\n` : '',
        testCases: firstType === 'coding' ? [{ input: 'test', output: 'test' }] : [],
        difficultyElo: firstDifficultyElo
      };
    }

    const newSession = new AssessmentSession({
      user: req.user.id,
      skill,
      assessmentMode: 'mixed',
      startRating: currentRating,
      poolSize: POOL_SIZE,
      questionCount: 1,
      currentQuestionText: aiData.question,
      currentOptions: aiData.options || [],
      currentAnswer: aiData.answer,
      currentTitle: aiData.title || '',
      currentCodeTemplate: aiData.codeTemplate || '',
      currentTestCases: aiData.testCases || [],
      currentDifficulty: aiData.difficulty || 'Medium',
      currentDifficultyElo: aiData.difficultyElo || firstDifficultyElo,
      currentType: firstType,
      askedQuestions: [aiData.question],
      questionPlan: plan,
      difficultyPlanElos: diffPlanElos,
      questionsLog: [],
      completed: false
    });

    await newSession.save();

    return res.json({
      question: aiData.question,
      options: aiData.options || [],
      type: firstType,
      skill,
      difficulty: aiData.difficulty || 'Medium',
      title: aiData.title || '',
      codeTemplate: aiData.codeTemplate || '',
      testCases: aiData.testCases || [],
      questionNumber: 1,
      poolSize: POOL_SIZE
    });
  } catch (err) {
    console.error('[Assessment][start] Error:', err);
    return res.status(500).json({ msg: 'Failed to start assessment.' });
  }
});

// =============================================================
// POST /api/assessment/submit
// Grades one answer, logs it, generates next question.
// Does NOT update user ELO.
// =============================================================
router.post('/submit', auth, async (req, res) => {
  try {
    const { userAnswer } = req.body;
    const session = await AssessmentSession.findOne({ user: req.user.id, completed: false });
    if (!session) return res.status(404).json({ msg: 'No active assessment found.' });

    const qType = session.currentType || 'subjective';

    // --- Grade the current answer ---
    let scorePercentage = 0;
    let feedback = '';
    let correctAnswer = session.currentAnswer;

    if (qType === 'mcq') {
      const isCorrect = String(userAnswer || '').trim() === String(session.currentAnswer || '').trim();
      scorePercentage = isCorrect ? 100 : 0;
      feedback = isCorrect ? 'Correct!' : 'Incorrect.';
      correctAnswer = isCorrect ? null : session.currentAnswer;
    } else if (qType === 'subjective' || qType === 'coding') {
      const aiResult = await evaluateSubjectiveWithAI(
        session.currentQuestionText,
        session.currentAnswer,
        userAnswer
      );
      scorePercentage = aiResult.bucketScore || 0;
      feedback = aiResult.feedback || '';
      correctAnswer = session.currentAnswer;
    } else {
      scorePercentage = 0;
      feedback = 'Unknown question type.';
    }

    // --- Log this question (NO ELO update) ---
    session.questionsLog.push({
      questionText: session.currentQuestionText,
      questionType: qType,
      difficulty: session.currentDifficulty || 'Medium',
      difficultyElo: session.currentDifficultyElo || 1200,
      userAnswer,
      correctAnswer: session.currentAnswer,
      scorePercentage,
      feedback,
      title: session.currentTitle || '',
      codeTemplate: session.currentCodeTemplate || '',
      testCases: session.currentTestCases || []
    });

    if (!session.askedQuestions.includes(session.currentQuestionText)) {
      session.askedQuestions.push(session.currentQuestionText);
    }

    const attempted = session.questionsLog.length;
    const correct = session.questionsLog.filter(q => q.scorePercentage === 100).length;
    const reachedPoolLimit = attempted >= session.poolSize;

    // --- Generate next question ---
    let nextQuestion = null;
    if (!reachedPoolLimit) {
      const nextIndex = session.questionCount; // 0-based next
      let nextType = 'subjective';
      if (Array.isArray(session.questionPlan) && nextIndex < session.questionPlan.length) {
        nextType = session.questionPlan[nextIndex];
      }

      // Get difficulty from dynamic plan
      let nextDifficultyElo = session.startRating || 1200;
      if (Array.isArray(session.difficultyPlanElos) && nextIndex < session.difficultyPlanElos.length) {
        nextDifficultyElo = session.difficultyPlanElos[nextIndex];
      }

      const effectiveRating = session.startRating || 1200;
      const nextAiQ = await generateQuestion(session.skill, effectiveRating, nextType, session.askedQuestions || [], nextDifficultyElo);

      session.currentQuestionText = nextAiQ.question;
      session.currentOptions = nextAiQ.options || [];
      session.currentAnswer = nextAiQ.answer;
      session.currentTitle = nextAiQ.title || '';
      session.currentCodeTemplate = nextAiQ.codeTemplate || '';
      session.currentTestCases = nextAiQ.testCases || [];
      session.currentDifficulty = nextAiQ.difficulty || 'Medium';
      session.currentDifficultyElo = nextAiQ.difficultyElo || nextDifficultyElo;
      session.currentType = nextType;
      session.questionCount = nextIndex + 1;

      if (!session.askedQuestions.includes(nextAiQ.question)) {
        session.askedQuestions.push(nextAiQ.question);
      }

      nextQuestion = {
        question: nextAiQ.question,
        options: nextAiQ.options || [],
        type: nextType,
        difficulty: nextAiQ.difficulty || 'Medium',
        title: nextAiQ.title || '',
        codeTemplate: nextAiQ.codeTemplate || '',
        testCases: nextAiQ.testCases || [],
        questionNumber: nextIndex + 1,
        poolSize: session.poolSize
      };
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
});

// =============================================================
// POST /api/assessment/skip
// Skips the current question without answering, loads next.
// =============================================================
router.post('/skip', auth, async (req, res) => {
  try {
    const session = await AssessmentSession.findOne({ user: req.user.id, completed: false });
    if (!session) return res.status(404).json({ msg: 'No active assessment found.' });

    const attempted = session.questionsLog.length;
    const correct = session.questionsLog.filter(q => q.scorePercentage === 100).length;

    // Move to next question in the plan
    const nextIndex = session.questionCount;
    if (nextIndex >= session.poolSize) {
      return res.json({ reachedPoolLimit: true, attempted, correct, poolSize: session.poolSize, nextQuestion: null });
    }

    let nextType = 'subjective';
    if (Array.isArray(session.questionPlan) && nextIndex < session.questionPlan.length) {
      nextType = session.questionPlan[nextIndex];
    }

    let nextDifficultyElo = session.startRating || 1200;
    if (Array.isArray(session.difficultyPlanElos) && nextIndex < session.difficultyPlanElos.length) {
      nextDifficultyElo = session.difficultyPlanElos[nextIndex];
    }

    const effectiveRating = session.startRating || 1200;
    const nextAiQ = await generateQuestion(session.skill, effectiveRating, nextType, session.askedQuestions || [], nextDifficultyElo);

    session.currentQuestionText = nextAiQ.question;
    session.currentOptions = nextAiQ.options || [];
    session.currentAnswer = nextAiQ.answer;
    session.currentTitle = nextAiQ.title || '';
    session.currentCodeTemplate = nextAiQ.codeTemplate || '';
    session.currentTestCases = nextAiQ.testCases || [];
    session.currentDifficulty = nextAiQ.difficulty || 'Medium';
    session.currentDifficultyElo = nextAiQ.difficultyElo || nextDifficultyElo;
    session.currentType = nextType;
    session.questionCount = nextIndex + 1;

    if (!session.askedQuestions.includes(nextAiQ.question)) {
      session.askedQuestions.push(nextAiQ.question);
    }

    await session.save();

    return res.json({
      skipped: true,
      attempted,
      correct,
      poolSize: session.poolSize,
      reachedPoolLimit: false,
      nextQuestion: {
        question: nextAiQ.question,
        options: nextAiQ.options || [],
        type: nextType,
        difficulty: nextAiQ.difficulty || 'Medium',
        title: nextAiQ.title || '',
        codeTemplate: nextAiQ.codeTemplate || '',
        testCases: nextAiQ.testCases || [],
        questionNumber: nextIndex + 1,
        poolSize: session.poolSize
      }
    });
  } catch (err) {
    console.error('[Assessment] Skip Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// =============================================================
// POST /api/assessment/finish
// Calculates ELO from all questionsLog, updates user, returns result.
// =============================================================
router.post('/finish', auth, async (req, res) => {
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

    let skillObj = (user.skills || []).find(s => s.name === session.skill);
    if (!skillObj) {
      skillObj = { name: session.skill, elo: null, mastery: 0, matchesPlayed: 0, isProvisional: true, history: [] };
      user.skills = user.skills || [];
      user.skills.push(skillObj);
    }
    skillObj = user.skills.find(s => s.name === session.skill);

    const oldRating = skillObj.elo;
    const effectiveOldRating = oldRating !== null && oldRating !== undefined ? oldRating : 1200;
    const matchesPlayed = skillObj.matchesPlayed || 0;
    const kFactor = getKFactor(matchesPlayed, effectiveOldRating);

    let totalExpected = 0;
    let totalActual = 0;
    for (const entry of log) {
      const diffElo = entry.difficultyElo || 1200;
      totalExpected += expectedProbability(effectiveOldRating, diffElo);
      totalActual += (entry.scorePercentage || 0) / 100.0;
    }

    const ratingChange = Math.round(kFactor * (totalActual - totalExpected));
    const newRating = Math.max(0, effectiveOldRating + ratingChange);

    skillObj.elo = newRating;
    // Rescaled mastery: a perfect assessment now grants +30 mastery instead of +10
    const masteryGain = Math.round((accuracy / 100) * 30);
    skillObj.mastery = Math.max(0, Math.min(100, (skillObj.mastery || 0) + masteryGain));
    skillObj.matchesPlayed = matchesPlayed + attempted;
    skillObj.isProvisional = skillObj.matchesPlayed < 30;

    if (!skillObj.history) skillObj.history = [];
    skillObj.history.push({
      date: new Date(),
      eloChange: ratingChange,
      newElo: newRating,
      questionId: `assessment_${attempted}q`
    });

    await user.save();

    session.completed = true;
    session.finalResult = { attempted, correct, accuracy, oldRating, newRating, ratingChange };
    await session.save();

    return res.json({
      attempted, correct, accuracy,
      oldRating: oldRating !== null && oldRating !== undefined ? oldRating : 'Unrated',
      newRating, ratingChange, sessionOver: true
    });
  } catch (err) {
    console.error('[Assessment] Finish Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
