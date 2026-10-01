// models/Question.js — the shared question bank (assessments and quiz duels; questions/bank.js).
//
// Every question has its own rating, like a player: it starts from its difficulty and moves as people
// answer it (strong players missing it → it's harder than labelled). Stats drive its lifecycle:
// pending (new, tried on a few people) → active → review (reported or misbehaving) / retired.
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuestionSchema = new Schema({
    skill: { type: String, required: true },          // display name, e.g. "Node.js"
    skills: [{ type: String, index: true }],          // lowercase keys it counts for (aliases included)
    type: { type: String, enum: ['mcq', 'subjective', 'coding'], required: true },
    text: { type: String, required: true },
    code: { type: String, default: '' },              // snippet shown with the question
    title: { type: String, default: '' },
    options: [{ type: String }],                      // mcq
    answer: { type: String, default: '' },            // mcq: the right option text; others: reference answer
    explanation: { type: String, default: '' },
    codeTemplate: { type: String, default: '' },      // coding
    testCases: [{ _id: false, input: String, output: String }],

    rating: { type: Number, default: 1300, index: true },
    attempts: { type: Number, default: 0 },
    scoreSum: { type: Number, default: 0 },           // Σ score (0–1); success rate = scoreSum / attempts
    timeSumMs: { type: Number, default: 0 },
    // Who gets it right: if strong players miss it more than weak ones, the answer key is suspect
    raterSumRight: { type: Number, default: 0 },
    rightCount: { type: Number, default: 0 },
    raterSumWrong: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },

    reports: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String, at: { type: Date, default: Date.now } }],
    status: { type: String, enum: ['pending', 'active', 'review', 'retired'], default: 'active', index: true },
    statusReason: String,
    source: { type: String, enum: ['seed', 'legacy', 'template', 'ai'], required: true },
    templateId: String,
    hash: { type: String, required: true, unique: true }
}, { timestamps: true });

QuestionSchema.index({ skills: 1, type: 1, status: 1, rating: 1 });

module.exports = mongoose.model('Question', QuestionSchema);
