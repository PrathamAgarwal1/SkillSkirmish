const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Battle record for one mode (battles/catalog.js: guessr, quiz, task, debug, css, algo)
const modeStats = () => ({
    rating: { type: Number, default: 1200 },
    played: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 }
});

// Sub-document schema for skills
const SkillSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mastery: { type: Number, default: 0, min: 0, max: 100 },
    elo: { type: Number, default: null },
    matchesPlayed: { type: Number, default: 0 },
    ratingDeviation: { type: Number, default: 350 },
    isProvisional: { type: Boolean, default: true },
    // Set when an assessment in this skill is finished; drives inactivity decay
    // (no default: Mongoose would stamp "now" on every load of legacy skills and they'd never decay)
    lastPracticedAt: { type: Date, default: null },
    // Last time the decay worker reduced this skill (decay applies at most once per week)
    lastDecayAt: { type: Date, default: null },
    history: [{
        date: { type: Date, default: Date.now },
        eloChange: Number,
        newElo: Number,
        questionId: String // or question text hash if no ID
    }]
});

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: false
    },
    // --- AUTH PROVIDER FIELDS (Google Auth0) ---
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    profilePicture: {
        type: String,
        default: ''
    },
    auth0Sub: {
        type: String,
        default: ''
    },
    // --- PROFILE FIELDS (Added) ---
    bio: { type: String, default: '' },
    location: { type: String, default: '' },
    company: { type: String, default: '' },
    website: { type: String, default: '' },

    // --- ASSESSMENT FIELDS ---
    assessmentCooldownExpires: {
        type: Date
    },
    assessmentHistory: [{
        questionText: String,
        skill: String,
        answeredAt: { type: Date, default: Date.now }
    }],

    // --- SKILLS ---
    skills: [SkillSchema],
    // Coding battles (battles/battleManager.js): Elo rating and record
    battle: {
        rating: { type: Number, default: 1200 },
        played: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        solved: [{ type: String }], // "<kind>:<id>" solved at least once (battles or practice)
        // Separate rating per mode, like blitz/rapid in chess
        modes: {
            guessr: modeStats(),
            quiz: modeStats(),
            task: modeStats(),
            debug: modeStats(),
            css: modeStats(),
            algo: modeStats()
        },
        dailyStreak: { type: Number, default: 0 },
        lastDaily: { type: String, default: '' } // "YYYY-MM-DD"
    },

    // --- SOCIALS ---
    socialLinks: {
        github: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        portfolio: { type: String, default: '' },
        twitter: { type: String, default: '' },
        leetcode: { type: String, default: '' }
    },
    socialsPublic: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
    // Only hash password if it exists and has been modified
    if (!this.password || !this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

module.exports = mongoose.model('User', UserSchema);