// models/QuestionSeen.js — which questions a user has already been shown (so they never repeat).
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuestionSeenSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    skill: { type: String, required: true }, // lowercase key, to look up "seen in this skill" quickly
    at: { type: Date, default: Date.now }
});

QuestionSeenSchema.index({ user: 1, question: 1 }, { unique: true });
QuestionSeenSchema.index({ user: 1, skill: 1 });

module.exports = mongoose.model('QuestionSeen', QuestionSeenSchema);
