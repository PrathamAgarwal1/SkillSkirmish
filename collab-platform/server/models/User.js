const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Sub-document schema for skills
const SkillSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mastery: { type: Number, default: 0, min: 0, max: 100 },
    elo: { type: Number, default: 1200 } 
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
        required: true
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
    
    // --- SOCIALS ---
    socialLinks: {
        github: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        portfolio: { type: String, default: '' },
        twitter: { type: String, default: '' }
    },
    socialsPublic: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

module.exports = mongoose.model('User', UserSchema);