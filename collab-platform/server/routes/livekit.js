const express = require('express');
const router = express.Router();
const { AccessToken } = require('livekit-server-sdk');

router.get('/token', async (req, res) => {
    try {
        const { roomName, participantName } = req.query;

        if (!roomName || !participantName) {
            return res.status(400).json({ error: 'Missing roomName or participantName' });
        }

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: participantName,
            }
        );

        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

        const token = await at.toJwt();
        res.json({ token });
    } catch (error) {
        console.error('Error creating token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
