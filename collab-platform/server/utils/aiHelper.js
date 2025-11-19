// aiHelper.js
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HfInference } = require('@huggingface/inference');

// Initialize Clients
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const hf = process.env.HF_API_KEY ? new HfInference(process.env.HF_API_KEY) : null;

/* ---------------------------------------------------------
   1) GENERIC JSON GENERATOR (EXISTING FUNCTION)
--------------------------------------------------------- */
const generateJSON = async (prompt) => {
    let lastError = null;

    // --- 1. GROQ ---
    if (groq) {
        try {
            console.log("🤖 AI: Attempting with Groq...");
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.5,
                response_format: { type: "json_object" }
            });
            return JSON.parse(completion.choices[0].message.content);
        } catch (err) {
            console.error("⚠️ Groq Failed:", err.message.substring(0, 60));
            lastError = err;
        }
    }

    // --- 2. GEMINI ---
    if (genAI) {
        const geminiModels = ["gemini-1.5-flash", "gemini-pro"];
        for (const modelName of geminiModels) {
            try {
                console.log(`🤖 AI: Switching to Gemini (${modelName})...`);
                const model = genAI.getGenerativeModel({ model: modelName });

                const result = await model.generateContent(prompt);
                const response = await result.response;
                let text = response.text();

                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(text);
            } catch (err) {
                console.error(`⚠️ Gemini (${modelName}) Failed:`, err.message);
                lastError = err;
            }
        }
    }

    // --- 3. HUGGING FACE ---
    if (hf) {
        try {
            console.log("🤖 AI: Switching to Hugging Face...");
            const completion = await hf.chatCompletion({
                model: "microsoft/Phi-3-mini-4k-instruct",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.3
            });

            let text = completion.choices[0].message.content;
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) text = jsonMatch[0];

            return JSON.parse(text);

        } catch (err) {
            console.error("⚠️ Hugging Face Failed:", err.message);
            lastError = err;
        }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
};


/* ---------------------------------------------------------
   2) SUBJECTIVE GRADING HELPERS (YOUR NEW FEATURE)
--------------------------------------------------------- */

// Convert raw score (0–100) → bucket score
function mapScoreToBucket(score) {
    if (score >= 87) return 100;
    if (score >= 62) return 75;
    if (score >= 37) return 50;
    if (score >= 13) return 25;
    return 0;
}

/**
 * evaluateSubjectiveWithAI()
 *
 * Uses YOUR EXISTING AI PIPELINE (Groq → Gemini → HF)
 */
async function evaluateSubjectiveWithAI(questionText, referenceAnswer, userAnswer) {

    const gradingPrompt = `
You are an automated grader. Compare the user's answer to the reference answer.
Return ONLY a JSON object with:
{
  "score": <integer between 0 and 100>,
  "feedback": "<short constructive feedback>"
}

Reference Answer:
"""${referenceAnswer}"""

Question:
"""${questionText}"""

User Answer:
"""${userAnswer}"""

Remember: ONLY return JSON.
`;

    try {
        const result = await generateJSON(gradingPrompt);

        const rawScore = Math.max(0, Math.min(100, Number(result.score || 0)));
        const bucketScore = mapScoreToBucket(rawScore);

        return {
            rawScore,
            bucketScore,
            feedback: result.feedback || "No feedback provided."
        };

    } catch (err) {
        console.error("❌ evaluateSubjectiveWithAI Failed:", err.message);

        return {
            rawScore: 0,
            bucketScore: 0,
            feedback: "AI grading failed. Try again."
        };
    }
}


/* ---------------------------------------------------------
   EXPORTS
--------------------------------------------------------- */
module.exports = {
    generateJSON,
    evaluateSubjectiveWithAI,
    mapScoreToBucket
};
