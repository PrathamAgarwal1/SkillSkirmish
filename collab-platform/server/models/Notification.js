const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    // --- ADD THESE NEW FIELDS ---
    type: { 
        type: String, 
        default: 'info' // 'info' or 'invite'
    },
    relatedId: {
        type: String // Stores the Room ID or other links
    },
    // ----------------------------
    read: {
        type: Boolean,
        default: false
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', NotificationSchema);