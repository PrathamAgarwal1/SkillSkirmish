// models/Battle.js — a finished coding battle (ranked, friendly or practice).
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PlayerSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: String,
    language: String,
    ratingBefore: Number,
    ratingAfter: Number,
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    solvedMs: Number,          // time from start to passing every test
    submissions: { type: Number, default: 0 },
    code: { type: String, default: '' }, // best submission, for review after the match
    verified: { type: Boolean, default: null }, // re-run by the opponent's browser: matched / didn't / not checked
    forfeited: { type: Boolean, default: false }
}, { _id: false });

const BattleSchema = new Schema({
    problem: { type: String, required: true },
    difficulty: String,
    mode: { type: String, enum: ['ranked', 'friend', 'practice'], required: true },
    players: [PlayerSchema],
    winner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    result: { type: String, enum: ['win', 'draw', 'no-contest', 'solved', 'unsolved'], required: true },
    reason: String,
    startedAt: Date,
    endedAt: Date
}, { timestamps: true });

BattleSchema.index({ 'players.user': 1, endedAt: -1 });

module.exports = mongoose.model('Battle', BattleSchema);
