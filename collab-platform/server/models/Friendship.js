// models/Friendship.js — a friend request or friendship between two users.
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FriendshipSchema = new Schema({
    // "<smaller id>_<larger id>": one document per pair, whoever asked first
    key: { type: String, required: true, unique: true },
    users: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: Date
}, { timestamps: true });

FriendshipSchema.index({ users: 1, status: 1 });

module.exports = mongoose.model('Friendship', FriendshipSchema);
