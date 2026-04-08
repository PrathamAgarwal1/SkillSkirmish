// services/aiService.js
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HfInference } = require('@huggingface/inference');

// Initialize AI Clients (reusing existing env vars)
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const hf = process.env.HF_API_KEY ? new HfInference(process.env.HF_API_KEY) : null;

/* ---------------------------------------------------------
   MODEL CONSTANTS — Specialized for each task
--------------------------------------------------------- */
const MODELS = {
    AUTOCOMPLETE: 'llama-3.1-8b-instant',           // 14.4K RPD, fast
    CHAT: 'meta-llama/llama-4-scout-17b-16e-instruct', // 500K TPD, smart
    EVALUATION: 'meta-llama/llama-4-scout-17b-16e-instruct',
    GENERATION: 'meta-llama/llama-4-scout-17b-16e-instruct',
};

/* ---------------------------------------------------------
   SIMPLE IN-MEMORY CACHE (for autocomplete)
--------------------------------------------------------- */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key, value) {
    // Limit cache size
    if (cache.size > 500) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { value, timestamp: Date.now() });
}

/* ---------------------------------------------------------
   TOKEN USAGE TRACKER — Cumulative analytics
--------------------------------------------------------- */
const usageTracker = {
    totalCalls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    byModel: {},    // { modelName: { calls, prompt, completion, total } }
    byTask: {},     // { taskLabel: { calls, prompt, completion, total } }
    byProvider: {}, // { provider: { calls, prompt, completion, total } }
    history: [],    // Last 100 calls for detailed analysis
    startedAt: new Date().toISOString()
};

function _trackBucket(bucket, key, promptTok, completionTok, totalTok) {
    if (!bucket[key]) bucket[key] = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    bucket[key].calls++;
    bucket[key].promptTokens += promptTok;
    bucket[key].completionTokens += completionTok;
    bucket[key].totalTokens += totalTok;
}

function logTokenUsage(provider, model, usage, taskLabel = 'General') {
    const prompt = usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0;
    const completion = usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0;
    const total = usage?.total_tokens ?? (prompt + completion);

    // Accumulate stats
    usageTracker.totalCalls++;
    usageTracker.totalPromptTokens += prompt;
    usageTracker.totalCompletionTokens += completion;
    usageTracker.totalTokens += total;

    _trackBucket(usageTracker.byModel, model, prompt, completion, total);
    _trackBucket(usageTracker.byTask, taskLabel, prompt, completion, total);
    _trackBucket(usageTracker.byProvider, provider, prompt, completion, total);

    // Keep last 100 calls
    usageTracker.history.push({
        timestamp: new Date().toISOString(),
        provider,
        model,
        task: taskLabel,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total
    });
    if (usageTracker.history.length > 100) usageTracker.history.shift();

    // Console log
    console.log(
        `\n📊 ─── TOKEN USAGE [${taskLabel}] ───\n` +
        `   Provider : ${provider}\n` +
        `   Model    : ${model}\n` +
        `   Prompt   : ${prompt} tokens\n` +
        `   Response : ${completion} tokens\n` +
        `   Total    : ${total} tokens\n` +
        `   ── Session Totals ──\n` +
        `   Calls    : ${usageTracker.totalCalls}\n` +
        `   Tokens   : ${usageTracker.totalTokens}\n` +
        `───────────────────────────────────`
    );
}

function getUsageStats() {
    return {
        ...usageTracker,
        uptime: `Since ${usageTracker.startedAt}`
    };
}

function resetUsageStats() {
    usageTracker.totalCalls = 0;
    usageTracker.totalPromptTokens = 0;
    usageTracker.totalCompletionTokens = 0;
    usageTracker.totalTokens = 0;
    usageTracker.byModel = {};
    usageTracker.byTask = {};
    usageTracker.byProvider = {};
    usageTracker.history = [];
    usageTracker.startedAt = new Date().toISOString();
}

/* ---------------------------------------------------------
   CORE AI CALL — Groq → Gemini fallback + token tracking
--------------------------------------------------------- */
async function callAI(messages, options = {}) {
    const {
        temperature = 0.7,
        maxTokens = 2048,
        jsonMode = false,
        model = MODELS.CHAT,
        taskLabel = 'General'
    } = options;

    let lastError = null;

    // --- 1. GROQ (fastest) ---
    if (groq) {
        try {
            console.log(`🤖 [${taskLabel}] Attempting Groq (${model})...`);
            const params = {
                messages,
                model,
                temperature,
                max_tokens: maxTokens
            };
            if (jsonMode) params.response_format = { type: "json_object" };

            const completion = await groq.chat.completions.create(params);

            // Log token usage
            logTokenUsage('Groq', model, completion.usage, taskLabel);

            return completion.choices[0].message.content;
        } catch (err) {
            const isRateLimit = err.status === 429 || err.message?.includes('rate_limit');
            console.error(`⚠️ Groq Failed (${isRateLimit ? 'RATE LIMITED' : 'ERROR'}):`, err.message?.substring(0, 100));
            lastError = err;
            // Fall through to Gemini
        }
    }

    // --- 2. GEMINI (fallback) ---
    if (genAI) {
        const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash-latest"];
        for (const modelName of geminiModels) {
            try {
                console.log(`🤖 [${taskLabel}] Falling back to Gemini (${modelName})...`);
                const geminiModel = genAI.getGenerativeModel({ model: modelName });

                // Convert chat format to Gemini format
                const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
                const result = await geminiModel.generateContent(prompt);
                const response = await result.response;

                // Log token usage from Gemini
                const usageMetadata = response.usageMetadata;
                if (usageMetadata) {
                    logTokenUsage('Gemini', modelName, usageMetadata, taskLabel);
                } else {
                    console.log(`📊 [${taskLabel}] Gemini (${modelName}) — usage metadata unavailable`);
                }

                return response.text();
            } catch (err) {
                console.error(`⚠️ Gemini (${modelName}) Failed:`, err.message?.substring(0, 100));
                lastError = err;
            }
        }
    }

    // --- 3. HUGGING FACE (last resort) ---
    if (hf) {
        try {
            console.log(`🤖 [${taskLabel}] Last resort: HuggingFace...`);
            const completion = await hf.chatCompletion({
                model: "microsoft/Phi-3-mini-4k-instruct",
                messages,
                max_tokens: maxTokens,
                temperature
            });

            console.log(`📊 [${taskLabel}] HuggingFace — token usage not available from this provider`);
            return completion.choices[0].message.content;
        } catch (err) {
            console.error("⚠️ HuggingFace Failed:", err.message?.substring(0, 100));
            lastError = err;
        }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
}

/* ---------------------------------------------------------
   1) CHAT RESPONSE
--------------------------------------------------------- */
async function generateChatResponse(userMessages) {
    const systemPrompt = {
        role: 'system',
        content: `You are an expert AI coding assistant embedded in a developer collaboration platform. You help developers by:
- Answering programming questions clearly and concisely
- Explaining code with examples
- Debugging code and identifying issues
- Suggesting improvements and best practices
- Generating code snippets in any language

Always format your responses using Markdown. Use fenced code blocks with language identifiers for code. Be concise but thorough.`
    };

    const messages = [systemPrompt, ...userMessages];
    return await callAI(messages, {
        temperature: 0.7,
        maxTokens: 2048,
        model: MODELS.CHAT,
        taskLabel: 'Chat'
    });
}

/* ---------------------------------------------------------
   2) CODE EXPLANATION
--------------------------------------------------------- */
async function explainCode(code, language = 'javascript') {
    const messages = [
        {
            role: 'system',
            content: 'You are an expert code explainer. Provide clear, structured explanations with sections for: Overview, Line-by-line breakdown (for short code), Key concepts, and Potential improvements. Use Markdown formatting with code blocks.'
        },
        {
            role: 'user',
            content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
        }
    ];

    return await callAI(messages, {
        temperature: 0.3,
        maxTokens: 2048,
        model: MODELS.CHAT,
        taskLabel: 'Code Explanation'
    });
}

/* ---------------------------------------------------------
   3) AUTOCOMPLETE
--------------------------------------------------------- */
async function autocompleteCode(context, language = 'javascript', cursorPosition = 0) {
    // Check cache first
    const cacheKey = `${language}:${context.slice(-200)}`;
    const cached = getCached(cacheKey);
    if (cached) {
        console.log("🤖 Autocomplete: Cache hit");
        return cached;
    }

    const messages = [
        {
            role: 'system',
            content: `You are a code autocomplete engine. Given a code context, predict the NEXT few lines of code the developer would write. Rules:
- Return ONLY the completion code, no explanations or markdown
- Do NOT repeat any of the existing code
- Keep completions short (1-3 lines typically)
- Match the coding style and indentation of the context
- If you cannot predict a meaningful completion, return an empty string`
        },
        {
            role: 'user',
            content: `Language: ${language}\nComplete the code after the cursor:\n\n${context}`
        }
    ];

    const result = await callAI(messages, {
        temperature: 0.2,
        maxTokens: 150,
        model: MODELS.AUTOCOMPLETE,
        taskLabel: 'Autocomplete'
    });

    // Clean up: remove markdown code fences if AI added them
    let completion = result.trim();
    completion = completion.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();

    // Cache the result
    setCache(cacheKey, completion);

    return completion;
}

/* ---------------------------------------------------------
   4) PROJECT ANALYSIS — Analyze project files to determine run commands
--------------------------------------------------------- */
async function analyzeProject(fileList, packageJsonContent) {
    const fileNames = fileList.map(f => f.path || f).join('\n');

    const messages = [
        {
            role: 'system',
            content: `You are a project analyzer. Given a project's file list and package.json, determine the EXACT commands needed to install dependencies and run the project.

You MUST respond with ONLY a valid JSON object (no markdown, no explanation) with these fields:
{
  "installCmd": "the install command, e.g. npm install",
  "runCmd": "the run command, e.g. npm start or npm run dev or node index.js or npx vite --port PORT or npx http-server . -p PORT",
  "defaultPort": 3001,
  "projectType": "react|node|express|vanilla|python|static|unknown",
  "needsInstall": true,
  "entryFile": "the main entry file like index.js or app.js or server.js",
  "notes": "brief note about the project",
  "errorsToFix": ["list of exact errors or missing files needed to run the project, or empty array if none"]
}

Rules:
- For React/Vite projects, use "npx vite --port PORT" as runCmd
- For Node/Express projects, use "node <entryFile>" as runCmd  
- For static HTML projects, use "npx http-server . -p PORT -c-1" as runCmd
- For Python projects, use "python <entryFile>" as runCmd
- defaultPort should be between 3001-9000 (avoid 5173 and 5000)
- needsInstall is true if there's a package.json with dependencies
- If no package.json exists, set installCmd to "" and needsInstall to false
- ALWAYS respond with valid JSON only, nothing else`
        },
        {
            role: 'user',
            content: `Analyze this project:\n\nFILE LIST:\n${fileNames}\n\nPACKAGE.JSON:\n${packageJsonContent || '(not found)'}`
        }
    ];

    try {
        const result = await callAI(messages, { temperature: 0.1, maxTokens: 500, jsonMode: true });
        
        // Parse JSON response
        let parsed;
        try {
            // Strip markdown code fences if present
            let cleaned = result.trim();
            cleaned = cleaned.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error('AI returned non-JSON response:', result.substring(0, 200));
            // Fallback: try to extract JSON from the response
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse AI response as JSON');
            }
        }

        return {
            installCmd: parsed.installCmd || '',
            runCmd: parsed.runCmd || '',
            defaultPort: parsed.defaultPort || 3001,
            projectType: parsed.projectType || 'unknown',
            needsInstall: parsed.needsInstall !== false,
            entryFile: parsed.entryFile || '',
            notes: parsed.notes || '',
            errorsToFix: Array.isArray(parsed.errorsToFix) ? parsed.errorsToFix : []
        };
    } catch (err) {
        console.error('Project analysis failed:', err.message);
        // Return a safe fallback
        return {
            installCmd: packageJsonContent ? 'npm install' : '',
            runCmd: 'node index.js',
            defaultPort: 3001,
            projectType: 'unknown',
            needsInstall: !!packageJsonContent,
            entryFile: 'index.js',
            notes: 'AI analysis failed, using defaults',
            errorsToFix: ['AI analysis failed. Please check your files manually.']
        };
    }
}

/* ---------------------------------------------------------
   EXPORTS
--------------------------------------------------------- */
module.exports = {
    generateChatResponse,
    explainCode,
    autocompleteCode,
    analyzeProject,
    callAI
};
