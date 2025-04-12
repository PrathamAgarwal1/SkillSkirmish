// server/routes/quizRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
} = require('../controllers/quizController');

// GET all questions (admin or game fetch)
router.get('/', getAllQuestions);

// POST new question (admin only)
router.post('/', addQuestion);

// PUT update question
router.put('/:id', updateQuestion);

// DELETE question
router.delete('/:id', deleteQuestion);

module.exports = router;
