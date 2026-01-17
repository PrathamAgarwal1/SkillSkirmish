// routes/assessment.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AssessmentSession = require('../models/AssessmentSession');
const User = require('../models/User');
const { generateJSON, evaluateSubjectiveWithAI } = require('../utils/aiHelper');

// CONFIG
const MAX_QUESTIONS = 10;
const K_BASE = 20;
const GENERATE_RETRY_LIMIT = 4; // retry if LLM returns duplicate or invalid

// --- Helpers ---
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
 * Generate a question of a requiredType while avoiding duplicates.
 * Calls generateJSON and retries a few times if the returned question text
 * appears in avoidList or the response is malformed.
 *
 * requiredType: 'mcq' | 'subjective'
 * avoidList: array of previous question texts to avoid repeating
 */
async function generateQuestion(skill, currentElo, requiredType, avoidList = []) {
  let lastErr = null;

  for (let attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
    try {
      // Use a simpler, more robust prompt
      const prompt = `
        Task: Generate 1 unique technical interview question.
        Topic: ${skill}
        Difficulty: ELO ${currentElo} (Adjust accordingly)
        Type: ${requiredType} (${requiredType === 'mcq' ? 'Multiple Choice' : 'Open Ended'})

        Constraints:
        - valid JSON output only.
        - No markdown formatting.
        - unique from: ${JSON.stringify(avoidList.map(q => q.substring(0, 50)))}
        
        JSON Structure:
        {
          "question": "The question text",
          "options": ["A", "B", "C", "D"], // only for mcq
          "answer": "The correct answer string",
          "difficulty": "Easy|Medium|Hard",
          "type": "${requiredType}"
        }
      `;

      const aiData = await generateJSON(prompt);

      // Validation
      if (!aiData || !aiData.question) throw new Error('Invalid AI response');

      const qText = String(aiData.question).trim();
      if (avoidList.some(prev => String(prev).trim() === qText)) {
        throw new Error('Duplicate question');
      }

      // Return valid question
      return {
        type: requiredType,
        question: qText,
        options: Array.isArray(aiData.options) ? aiData.options : [],
        answer: aiData.answer || 'Refer to documentation',
        difficulty: aiData.difficulty || 'Medium'
      };

    } catch (err) {
      lastErr = err;
      console.log(`[Assessment] Gen attempt ${attempt} failed: ${err.message}`);
    }
  }

  // FALLBACK if AI fails 4 times (Prevent crash)
  console.warn('[Assessment] Using Fallback Question');
  return {
    type: requiredType,
    question: `Explain the core concepts of ${skill}. (Fallback Question)`,
    options: requiredType === 'mcq' ? ["Concept A", "Concept B", "Concept C", "All of the above"] : [],
    answer: "All of the above",
    difficulty: 'Easy'
  };
}

// -------------------------------------------------------------
// POST /api/assessment/start
// -------------------------------------------------------------
router.post('/start', auth, async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill) return res.status(400).json({ msg: 'Skill is missing.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found.' });

    const skillData = (user.skills || []).find(s => s.name === skill);
    const currentElo = skillData ? skillData.elo : 1200;

    // Create a randomized plan: exactly 5 'mcq' and 5 'subjective'
    let plan = [];
    plan.push(...Array(5).fill('mcq'));
    plan.push(...Array(5).fill('subjective'));
    plan = shuffleArray(plan);

    // Generate first question according to the plan (index 0)
    const requiredType = plan[0];
    const aiData = await generateQuestion(skill, currentElo, requiredType, []);

    // clear any old sessions for this user
    await AssessmentSession.deleteMany({ user: req.user.id });

    const newSession = new AssessmentSession({
      user: req.user.id,
      skill,
      startElo: currentElo,
      // questionCount tracks how many questions have been served so far (1-based)
      questionCount: 1,
      correctCount: 0,
      streak: 0,
      currentQuestionText: aiData.question,
      currentOptions: aiData.options || [],
      currentAnswer: aiData.answer,
      questionType: requiredType,
      difficulty: aiData.difficulty || 'Medium',
      attemptCount: 0,
      // initialize askedQuestions with the first question so we avoid repeats
      askedQuestions: [aiData.question],
      questionPlan: plan // store the randomized plan for the whole session
    });

    await newSession.save();

    return res.json({
      question: aiData.question,
      options: aiData.options || [],
      type: requiredType,
      skill,
      difficulty: aiData.difficulty || 'Medium',
      startElo: currentElo
    });
  } catch (err) {
    console.error('[Assessment][start] Error:', err);
    return res.status(500).json({ msg: 'Failed to start assessment.' });
  }
});

// -------------------------------------------------------------
// POST /api/assessment/submit
// -------------------------------------------------------------
router.post('/submit', auth, async (req, res) => {
  try {
    const { userAnswer } = req.body;
    const session = await AssessmentSession.findOne({ user: req.user.id });
    if (!session) return res.status(404).json({ msg: 'No active assessment found.' });

    // Track attempt
    session.attemptCount = (session.attemptCount || 0) + 1;

    // Default response values
    let scorePercentage = 0;
    let feedback = '';
    let correctAnswer = session.currentAnswer;
    let rawScore = null;

    // MCQ handling
    if (session.questionType === 'mcq') {
      const isCorrect = String(userAnswer || '').trim() === String(session.currentAnswer || '').trim();
      scorePercentage = isCorrect ? 100 : 0;
      feedback = isCorrect ? 'Correct!' : `Incorrect.`;
      correctAnswer = isCorrect ? null : session.currentAnswer;
      if (isCorrect) session.correctCount = (session.correctCount || 0) + 1;
    }
    // Subjective handling
    else if (session.questionType === 'subjective') {
      // Evaluate using AI chain (Groq -> Gemini -> HF)
      const aiResult = await evaluateSubjectiveWithAI(
        session.currentQuestionText,
        session.currentAnswer,
        userAnswer
      );
      // aiResult: { rawScore: 0..100, bucketScore: 0|25|50|75|100, feedback }
      rawScore = aiResult.rawScore;
      scorePercentage = aiResult.bucketScore;
      feedback = aiResult.feedback || '';
      correctAnswer = session.currentAnswer;
      if (scorePercentage === 100) session.correctCount = (session.correctCount || 0) + 1;
    } else {
      // unknown type — treat as 0
      scorePercentage = 0;
      feedback = 'Unsupported question type.';
    }

    // Save the user answer + scoring on session
    session.answer = userAnswer;
    session.scorePercentage = scorePercentage;
    session.feedback = feedback;
    session.askedQuestions = session.askedQuestions || [];
    // Ensure current question text is recorded (if not already present)
    if (!session.askedQuestions.includes(session.currentQuestionText)) {
      session.askedQuestions.push(session.currentQuestionText);
    }

    // ELO update
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // ensure skill object exists
    let skillObj = (user.skills || []).find(s => s.name === session.skill);
    if (!skillObj) {
      skillObj = { name: session.skill, elo: 1200, mastery: 0 };
      user.skills = user.skills || [];
      user.skills.push(skillObj);
    }

    const userElo = skillObj.elo || 1200;
    const diffElo = difficultyToElo(session.difficulty || 'Medium');
    const P = expectedProbability(userElo, diffElo);

    const scoreFraction = (scorePercentage || 0) / 100.0;
    const eloDelta = Math.round(K_BASE * (scoreFraction - P));
    const eloAfter = Math.max(0, Math.round(userElo + eloDelta));

    // update user's skill
    skillObj.elo = eloAfter;
    skillObj.mastery = Math.max(0, Math.min(100, (skillObj.mastery || 0) + Math.round(10 * scoreFraction)));

    // Save eloBefore/after to session
    session.eloBefore = userElo;
    session.eloAfter = eloAfter;

    // decide whether session is over (this was the answer to question N)
    const sessionOver = (session.questionCount >= MAX_QUESTIONS);

    // Persist user + session updates BEFORE generating next question
    await user.save();
    await session.save();

    // If session is over, return final summary and do NOT generate next question
    if (sessionOver) {
      return res.json({
        scorePercentage,
        rawScore,
        feedback,
        correctAnswer,
        eloBefore: userElo,
        eloAfter,
        eloDelta,
        sessionOver: true,
        finalScore: session.correctCount || 0
      });
    }

    // Otherwise, prepare next question
    // nextIndex is zero-based index of the next question in the plan
    const nextIndex = session.questionCount; // since questionCount is number served so far (1-based), this gives next zero-based index
    if (!Array.isArray(session.questionPlan) || nextIndex >= session.questionPlan.length) {
      // fallback safety: if plan missing or exhausted, regenerate a balanced plan starting from remaining counts
      let remainingMcq = 5;
      let remainingSubj = 5;
      // count asked from plan if available
      if (Array.isArray(session.questionPlan)) {
        const used = session.questionPlan.slice(0, session.questionCount);
        remainingMcq = Math.max(0, 5 - used.filter(t => t === 'mcq').length);
        remainingSubj = Math.max(0, 5 - used.filter(t => t === 'subjective').length);
      }
      let fallbackPlan = [];
      fallbackPlan.push(...Array(remainingMcq).fill('mcq'));
      fallbackPlan.push(...Array(remainingSubj).fill('subjective'));
      fallbackPlan = shuffleArray(fallbackPlan);
      session.questionPlan = (session.questionPlan || []).concat(fallbackPlan);
      await session.save();
    }

    const requiredType = session.questionPlan[nextIndex];

    // generate next question while avoiding duplicates (pass askedQuestions)
    const nextAiQ = await generateQuestion(session.skill, eloAfter, requiredType, session.askedQuestions || []);

    // Update session to contain next question and increment questionCount
    session.currentQuestionText = nextAiQ.question;
    session.currentOptions = nextAiQ.options || [];
    session.currentAnswer = nextAiQ.answer;
    session.questionType = requiredType;
    session.difficulty = nextAiQ.difficulty || 'Medium';
    // increment served count (now we've set up the next question, so increment)
    session.questionCount = nextIndex + 1;

    // Also add newly generated question to askedQuestions to keep avoid list accurate
    session.askedQuestions = session.askedQuestions || [];
    if (!session.askedQuestions.includes(nextAiQ.question)) {
      session.askedQuestions.push(nextAiQ.question);
    }

    await session.save();

    // Return response containing next question and results for the previous question
    return res.json({
      scorePercentage,
      rawScore,
      feedback,
      correctAnswer,
      eloBefore: userElo,
      eloAfter,
      eloDelta,
      sessionOver: false,
      nextQuestion: {
        question: nextAiQ.question,
        options: nextAiQ.options || [],
        type: requiredType,
        difficulty: nextAiQ.difficulty || 'Medium'
      }
    });
  } catch (err) {
    console.error('[Assessment] Submit Error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// -------------------------------------------------------------
module.exports = router;
