// server/models/Message.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
    room: {
        type: Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    // Thread replies point at their top-level message; top-level messages count their replies
    parent: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    replyCount: { type: Number, default: 0 },
    lastReplyAt: Date,
    // Room members @mentioned in the text (they get a notification)
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

MessageSchema.index({ room: 1, parent: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
