const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// A persistent Discord-style voice channel. Who is in it is live state (see voice/voiceManager.js).
const VoiceChannelSchema = new Schema({
    // Random hex id (also used as the SFU room id in CALL_MODE=sfu)
    _id: {
        type: String,
        default: () => require('crypto').randomBytes(8).toString('hex')
    },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    // 0 = the server's maximum (VOICE_MAX_USERS)
    userLimit: { type: Number, default: 0, min: 0, max: 99 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
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
    voiceChannels: [VoiceChannelSchema]
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);