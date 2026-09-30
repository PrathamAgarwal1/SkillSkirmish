// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const auth = require('../middleware/auth');

const TOKEN_TTL_SECONDS = 36000; // 10 hours
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

// Slow down credential stuffing / brute force against login and register
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { msg: 'Too many attempts. Please try again in a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const signToken = (userId) => jwt.sign({ user: { id: userId } }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });

router.get('/', auth, async (req, res) => {
    try {
        // req.user.id is attached by the auth middleware
        const user = await User.findById(req.user.id).select('-password -auth0Sub');
        if (!user) return res.status(401).json({ msg: 'User no longer exists' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    POST api/auth/register
// @desc     Register user
router.post('/register', authLimiter, async (req, res) => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ msg: 'Username must be 3-30 characters: letters, numbers, _ . -' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ msg: 'Please enter a valid email' });
    if (password.length < 8) return res.status(400).json({ msg: 'Password must be at least 8 characters' });

    try {
        if (await User.findOne({ email })) {
            return res.status(400).json({ msg: 'User with this email already exists' });
        }
        if (await User.findOne({ username })) {
            return res.status(400).json({ msg: 'Username is already taken' });
        }

        const user = new User({ username, email, password });
        await user.save();

        res.json({ token: signToken(user.id) });
    } catch (err) {
        // Unique index race: two sign-ups with the same email/username at once
        if (err.code === 11000) return res.status(400).json({ msg: 'Email or username already in use' });
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route    POST api/auth/login
// @desc     Authenticate user & get token
router.post('/login', authLimiter, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) return res.status(400).json({ msg: 'Invalid Credentials' });

    try {
        // Older accounts may have been stored with mixed-case emails
        const user = await User.findOne({ email }) ||
            await User.findOne({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // Google-only accounts have no password — bcrypt.compare would throw on undefined
        if (!user.password) {
            return res.status(400).json({ msg: 'This account uses Google sign-in. Please continue with Google.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        res.json({ token: signToken(user.id) });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
