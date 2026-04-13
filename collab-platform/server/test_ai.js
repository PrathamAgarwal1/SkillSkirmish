const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { generateChatResponse } = require('./services/aiService');

(async () => {
    try {
        console.log("Calling chat response...");
        const response = await generateChatResponse([{ role: 'user', content: 'console.log(10+2);' }]);
        console.log("Success:", response);
    } catch (err) {
        console.error("Error:", err);
    }
})();
