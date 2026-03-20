const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VideoCallSchema = new Schema({
    callName: {
        type: String,
        default: 'Call',
        trim: true
    },
    _id: {
        type: String,
        default: () => require('crypto').randomBytes(8).toString('hex')
    },
    startedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    maxSlots: {
        type: Number,
        default: 10
    },
    participants: [{
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }]
});

const RoomSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    isPrivate: {
        type: Boolean,
        default: false
    },
    // Optional: Add a code/language field if needed later
    language: {
        type: String,
        default: 'javascript'
    },
    // --- PROJECT / DISCOVERY FIELDS ---
    requiredSkills: [{
        name:   { type: String, required: true },
        weight: { type: Number, default: 1, min: 0, max: 5 }
    }],
    minRating: {
        type: Number,
        default: 0
    },
    capacity: {
        type: Number,
        default: 10
    },
    projectDescription: {
        type: String,
        default: ''
    },
    isDiscoverable: {
        type: Boolean,
        default: false
    },
    tags: [{ type: String }],
    // Video call management - support up to 3 concurrent calls
    activeCalls: [VideoCallSchema],
    maxConcurrentCalls: {
        type: Number,
        default: 3 // Maximum 3 calls can run simultaneously
    }
}, { timestamps: true });

// Ensure activeCalls is always an array
RoomSchema.pre('save', function (next) {
    if (!this.activeCalls) {
        this.activeCalls = [];
    }
    next();
});

// Ensure activeCalls is populated on find
RoomSchema.post('findOne', function (doc) {
    if (doc && !doc.activeCalls) {
        doc.activeCalls = [];
    }
});

RoomSchema.post('find', function (docs) {
    docs.forEach(doc => {
        if (!doc.activeCalls) {
            doc.activeCalls = [];
        }
    });
});

module.exports = mongoose.model('Room', RoomSchema);