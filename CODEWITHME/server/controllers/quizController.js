// server/controllers/quizController.js
const QuizQuestion = require('../models/QuizQuestion');

// GET all quiz questions (for admin)
const getAllQuestions = async (req, res) => {
  try {
    const questions = await QuizQuestion.find();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch quiz questions.' });
  }
};

// ADD a new quiz question
const addQuestion = async (req, res) => {
  const { question, options, correctAnswer, hint, difficulty } = req.body;
  try {
    const newQuestion = new QuizQuestion({
      question,
      options,
      correctAnswer,
      hint,
      difficulty
    });
    await newQuestion.save();
    res.status(201).json({ message: 'Question added successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add question.' });
  }
};

// UPDATE a quiz question
const updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { question, options, correctAnswer, hint, difficulty } = req.body;
  try {
    const updated = await QuizQuestion.findByIdAndUpdate(
      id,
      { question, options, correctAnswer, hint, difficulty },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update question.' });
  }
};

// DELETE a quiz question
const deleteQuestion = async (req, res) => {
  const { id } = req.params;
  try {
    await QuizQuestion.findByIdAndDelete(id);
    res.json({ message: 'Question deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete question.' });
  }
};

module.exports = {
  getAllQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
};
