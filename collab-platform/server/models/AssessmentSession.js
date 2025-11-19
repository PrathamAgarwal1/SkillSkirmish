const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AssessmentSessionSchema = new Schema(
{
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
        // ❌ DO NOT USE unique: true — a user must have multiple sessions
    },

    // Skill being evaluated
    skill: { type: String, required: true },

    // Initial ELO for this assessment run
    startElo: { type: Number, default: 1200 },

    // Question progress tracking
    questionCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },

    // Current question data
    currentQuestionText: { type: String, required: true },
    currentOptions: [{ type: String }],
    currentAnswer: { type: String, required: true },
    questionType: { 
        type: String, 
        required: true, 
        enum: ['mcq', 'subjective', 'written'] 
    },
    difficulty: { 
        type: String, 
        enum: ['Easy', 'Medium', 'Hard'], 
        default: 'Medium' 
    },

    // Tracking attempts + history
    attemptCount: { type: Number, default: 0 },
    askedQuestions: [{ type: String }],

    // NEW FIELDS FOR SUBJECTIVE + ELO SYSTEM
    answer: { type: String },   // user submitted answer
    scorePercentage: { type: Number, default: 0 }, // 0/25/50/75/100
    feedback: { type: String },

    eloBefore: { type: Number }, 
    eloAfter: { type: Number },

    createdAt: { type: Date, default: Date.now }
},
{ timestamps: true } // includes createdAt/updatedAt
);

module.exports = mongoose.model('AssessmentSession', AssessmentSessionSchema);
