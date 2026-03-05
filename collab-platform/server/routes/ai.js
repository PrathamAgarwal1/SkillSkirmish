// routes/ai.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const { generateChatResponse, explainCode, autocompleteCode } = require('../services/aiService');

/* ---------------------------------------------------------
   RATE LIMITERS
--------------------------------------------------------- */
const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: { msg: 'Too many requests. Please wait a moment before trying again.' },
    standardHeaders: true,
    legacyHeaders: false
});

const autocompleteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { msg: 'Autocomplete rate limit reached. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

/* ---------------------------------------------------------
   INPUT VALIDATION HELPERS
--------------------------------------------------------- */
function validateString(val, maxLen = 10000) {
    return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

/* ---------------------------------------------------------
   POST /api/ai/chat
   Body: { messages: [{ role: "user"|"assistant", content: "..." }] }
--------------------------------------------------------- */
router.post('/chat', auth, chatLimiter, async (req, res) => {
    try {
        const { messages } = req.body;

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ msg: 'messages array is required' });
        }

        // Validate each message
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                return res.status(400).json({ msg: 'Each message must have role and content' });
            }
            if (!['user', 'assistant', 'system'].includes(msg.role)) {
                return res.status(400).json({ msg: 'Invalid message role' });
            }
            if (!validateString(msg.content, 15000)) {
                return res.status(400).json({ msg: 'Message content is invalid or too long' });
            }
        }

        const response = await generateChatResponse(messages);
        res.json({ response });
    } catch (err) {
        console.error('AI Chat Error:', err.message);
        res.status(500).json({ msg: 'AI service is temporarily unavailable. Please try again.' });
    }
});

/* ---------------------------------------------------------
   POST /api/ai/explain
   Body: { code: "...", language: "javascript" }
--------------------------------------------------------- */
router.post('/explain', auth, chatLimiter, async (req, res) => {
    try {
        const { code, language } = req.body;

        if (!validateString(code, 20000)) {
            return res.status(400).json({ msg: 'Code is required and must be under 20000 characters' });
        }

        const lang = validateString(language, 50) ? language : 'plaintext';
        const explanation = await explainCode(code, lang);
        res.json({ explanation });
    } catch (err) {
        console.error('AI Explain Error:', err.message);
        res.status(500).json({ msg: 'AI service is temporarily unavailable. Please try again.' });
    }
});

/* ---------------------------------------------------------
   POST /api/ai/autocomplete
   Body: { context: "...", language: "javascript", cursorPosition: number }
--------------------------------------------------------- */
router.post('/autocomplete', auth, autocompleteLimiter, async (req, res) => {
    try {
        const { context, language, cursorPosition } = req.body;

        if (!validateString(context, 10000)) {
            return res.status(400).json({ msg: 'Code context is required' });
        }

        const lang = validateString(language, 50) ? language : 'plaintext';
        const pos = typeof cursorPosition === 'number' ? cursorPosition : 0;

        const completion = await autocompleteCode(context, lang, pos);
        res.json({ completion });
    } catch (err) {
        console.error('AI Autocomplete Error:', err.message);
        res.status(500).json({ msg: 'AI service is temporarily unavailable.' });
    }
});

module.exports = router;
