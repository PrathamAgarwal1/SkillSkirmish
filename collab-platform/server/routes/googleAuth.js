// server/routes/googleAuth.js
// Handles Google OAuth flow via Auth0

const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ============================================================
// @route   GET /api/auth/google/login
// @desc    Redirect user to Auth0's Universal Login (Google)
// @access  Public
// ============================================================
router.get('/login', (req, res) => {
    const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CALLBACK_URL } = process.env;

    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CALLBACK_URL) {
        return res.status(500).json({ msg: 'Auth0 environment variables are not configured.' });
    }

    // Build the Auth0 authorization URL
    const authUrl = `https://${AUTH0_DOMAIN}/authorize?` +
        `response_type=code&` +
        `client_id=${AUTH0_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(AUTH0_CALLBACK_URL)}&` +
        `scope=openid%20profile%20email&` +
        `connection=google-oauth2`;

    res.redirect(authUrl);
});

// ============================================================
// @route   GET /api/auth/google/callback
// @desc    Handle Auth0 callback, exchange code for tokens,
//          find/create user in MongoDB, generate JWT, redirect
// @access  Public (called by Auth0 redirect)
// ============================================================
router.get('/callback', async (req, res) => {
    const { code, error, error_description } = req.query;

    // Handle Auth0 errors (e.g. user denied consent)
    if (error) {
        console.error('Auth0 callback error:', error, error_description);
        return res.redirect(
            `${getFrontendUrl()}/#/login?error=${encodeURIComponent(error_description || 'Google login failed')}`
        );
    }

    if (!code) {
        return res.redirect(
            `${getFrontendUrl()}/#/login?error=${encodeURIComponent('No authorization code received')}`
        );
    }

    try {
        const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_CALLBACK_URL } = process.env;

        // ----- Step 1: Exchange authorization code for tokens -----
        const tokenResponse = await axios.post(`https://${AUTH0_DOMAIN}/oauth/token`, {
            grant_type: 'authorization_code',
            client_id: AUTH0_CLIENT_ID,
            client_secret: AUTH0_CLIENT_SECRET,
            code,
            redirect_uri: AUTH0_CALLBACK_URL
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        const { access_token } = tokenResponse.data;

        if (!access_token) {
            throw new Error('No access token received from Auth0');
        }

        // ----- Step 2: Get user info from Auth0 -----
        const userInfoResponse = await axios.get(`https://${AUTH0_DOMAIN}/userinfo`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const { sub, name, email, picture } = userInfoResponse.data;

        if (!email) {
            throw new Error('No email returned from Google account');
        }

        // ----- Step 3: Find or create user in MongoDB -----
        let user = await User.findOne({ email });

        if (user) {
            // User exists — update profile picture and auth0Sub if missing
            if (!user.auth0Sub) {
                user.auth0Sub = sub;
            }
            if (picture && !user.profilePicture) {
                user.profilePicture = picture;
            }
            await user.save();
        } else {
            // Create new user for first-time Google login
            // Generate a unique username from the name
            const baseUsername = name.replace(/\s+/g, '').toLowerCase();
            let username = baseUsername;
            let counter = 1;

            // Ensure username is unique
            while (await User.findOne({ username })) {
                username = `${baseUsername}${counter}`;
                counter++;
            }

            user = new User({
                username,
                email,
                authProvider: 'google',
                profilePicture: picture || '',
                auth0Sub: sub
                // No password — Google users don't need one
            });

            await user.save();
        }

        // ----- Step 4: Generate JWT (same format as existing auth) -----
        const payload = { user: { id: user.id } };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 36000 });

        // ----- Step 5: Redirect to frontend with token -----
        res.redirect(`${getFrontendUrl()}/#/auth/google/callback?token=${token}`);

    } catch (err) {
        console.error('Google Auth callback error:', err.response?.data || err.message);
        res.redirect(
            `${getFrontendUrl()}/#/login?error=${encodeURIComponent('Google authentication failed. Please try again.')}`
        );
    }
});

// ============================================================
// Helper: Get frontend URL from env or use default
// ============================================================
function getFrontendUrl() {
    return process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
}

module.exports = router;
