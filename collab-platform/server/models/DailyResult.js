// models/DailyResult.js — one CodeGuessr daily challenge score per user per day.
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DailyResultSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: String,
    date: { type: String, required: true }, // "YYYY-MM-DD" (UTC)
    score: { type: Number, required: true },
    rounds: [{ _id: false, type: { type: String }, score: Number }]
}, { timestamps: true });

DailyResultSchema.index({ date: 1, user: 1 }, { unique: true });
DailyResultSchema.index({ date: 1, score: -1 });

module.exports = mongoose.model('DailyResult', DailyResultSchema);
