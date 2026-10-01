// server/routes/googleAuth.js
// Handles Google OAuth flow via Auth0

const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isAllowedOrigin, originOf } = require('../utils/origins');

// The site that started the sign-in travels through Auth0 in the OAuth "state" parameter, so the
// user lands back on that same site — only if it's an allowed origin, never an open redirect.
const encodeState = (origin) => Buffer.from(JSON.stringify({ r: origin, n: require('crypto').randomBytes(6).toString('hex') })).toString('base64url');
const returnOrigin = (state) => {
    try {
        const { r } = JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
        return isAllowedOrigin(r) ? r.replace(/\/+$/, '') : null;
    } catch {
        return null;
    }
};

// Where Auth0 sends the user back. A localhost AUTH0_CALLBACK_URL copied from a local .env would
// strand deployed users on localhost, so a deployed server ignores it and uses its own public URL.
const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);
const callbackUrl = (req) => {
    const configured = String(process.env.AUTH0_CALLBACK_URL || '').trim();
    const base = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).trim().replace(/\/+$/, '');
    if (configured && !(isLocalUrl(configured) && !isLocalUrl(base))) return configured;
    return `${base}/api/auth/google/callback`;
};

// ============================================================
// @route   GET /api/auth/google/login
// @desc    Redirect user to Auth0's Universal Login (Google)
// @access  Public
// ============================================================
router.get('/login', (req, res) => {
    const { AUTH0_DOMAIN, AUTH0_CLIENT_ID } = process.env;

    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
        return res.status(500).json({ msg: 'Auth0 environment variables are not configured.' });
    }

    // Build the Auth0 authorization URL
    const authUrl = `https://${AUTH0_DOMAIN}/authorize?` +
        `response_type=code&` +
        `client_id=${AUTH0_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(callbackUrl(req))}&` +
        `scope=openid%20profile%20email&` +
        `connection=google-oauth2`;
    const from = originOf(req.get('referer'));

    res.redirect(isAllowedOrigin(from) ? `${authUrl}&state=${encodeState(from)}` : authUrl);
});

// ============================================================
// @route   GET /api/auth/google/callback
// @desc    Handle Auth0 callback, exchange code for tokens,
//          find/create user in MongoDB, generate JWT, redirect
// @access  Public (called by Auth0 redirect)
// ============================================================
router.get('/callback', async (req, res) => {
    const { code, error, error_description, state } = req.query;
    const front = returnOrigin(state) || getFrontendUrl();

    // Handle Auth0 errors (e.g. user denied consent)
    if (error) {
        console.error('Auth0 callback error:', error, error_description);
        return res.redirect(
            `${front}/#/login?error=${encodeURIComponent(error_description || 'Google login failed')}`
        );
    }

    if (!code) {
        return res.redirect(
            `${front}/#/login?error=${encodeURIComponent('No authorization code received')}`
        );
    }

    try {
        const { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET } = process.env;

        // ----- Step 1: Exchange authorization code for tokens -----
        const tokenResponse = await axios.post(`https://${AUTH0_DOMAIN}/oauth/token`, {
            grant_type: 'authorization_code',
            client_id: AUTH0_CLIENT_ID,
            client_secret: AUTH0_CLIENT_SECRET,
            code,
            redirect_uri: callbackUrl(req)
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

        const { sub, name, picture, email_verified } = userInfoResponse.data;
        const email = (userInfoResponse.data.email || '').trim().toLowerCase();

        if (!email) {
            throw new Error('No email returned from Google account');
        }
        // We link to existing accounts by email, so the provider must vouch for it
        if (email_verified === false) {
            throw new Error('Google account email is not verified');
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
            // (Google may omit the display name; fall back to the email's local part)
            const rawName = name || email.split('@')[0];
            const baseUsername = (rawName.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'dev').slice(0, 24).padEnd(3, '0');
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
        res.redirect(`${front}/#/auth/google/callback?token=${token}`);

    } catch (err) {
        console.error('Google Auth callback error:', err.response?.data || err.message);
        res.redirect(
            `${front}/#/login?error=${encodeURIComponent('Google authentication failed. Please try again.')}`
        );
    }
});

// ============================================================
// Helper: Get frontend URL from env or use default
// ============================================================
function getFrontendUrl() {
    return (process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

module.exports = router;
module.exports.callbackUrl = callbackUrl;
