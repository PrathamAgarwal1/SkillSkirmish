const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Log entry for each question answered during a session
const QuestionLogSchema = new Schema({
    questionText: { type: String, required: true },
    question: { type: Schema.Types.ObjectId, ref: 'Question' },
    questionType: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    difficultyElo: { type: Number, default: 1200 },
    // Fallback questions (served when every AI provider failed) don't affect ELO
    isFallback: { type: Boolean, default: false },
    userAnswer: { type: String },
    correctAnswer: { type: String },
    scorePercentage: { type: Number, default: 0 },
    feedback: { type: String, default: '' },
    title: { type: String, default: '' },
    codeTemplate: { type: String, default: '' },
    testCases: [{ input: String, output: String }]
}, { _id: false });

const AssessmentSessionSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        skill: { type: String, required: true },

        // 'mixed' — all types in one session
        assessmentMode: { type: String, default: 'mixed' },

        startRating: { type: Number, default: null },

        poolSize: { type: Number, default: 20 },
        questionCount: { type: Number, default: 0 },

        // Randomized question plan (array of types)
        questionPlan: [{ type: String }],
        // Randomized difficulty plan (Easy/Medium/Hard)
        difficultyPlan: [{ type: String }],
        // Randomized difficulty numeric targets
        difficultyPlanElos: [{ type: Number }],

        // Current question fields
        currentQuestionText: { type: String, default: '' },
        currentOptions: [{ type: String }],
        currentAnswer: { type: String, default: '' },
        currentTitle: { type: String, default: '' },
        currentCodeTemplate: { type: String, default: '' },
        currentTestCases: [{ input: String, output: String }],
        currentDifficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
        currentDifficultyElo: { type: Number, default: 1200 },
        currentType: { type: String, default: 'subjective' },
        currentIsFallback: { type: Boolean, default: false },
        // Question-bank question being asked (its rating is the difficulty) and when it was shown
        currentQuestionId: { type: Schema.Types.ObjectId, ref: 'Question', default: null },
        currentCode: { type: String, default: '' },
        currentExplanation: { type: String, default: '' },
        currentServedAt: { type: Date, default: null },

        // All answered questions
        questionsLog: [QuestionLogSchema],

        // Avoid list
        askedQuestions: [{ type: String }],

        // Session lifecycle
        completed: { type: Boolean, default: false },

        finalResult: {
            attempted: Number,
            correct: Number,
            accuracy: Number,
            oldRating: Number,
            newRating: Number,
            ratingChange: Number
        },

        createdAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

module.exports = mongoose.model('AssessmentSession', AssessmentSessionSchema);
