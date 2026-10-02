// questions/bank.js — the dynamic question bank behind assessments and quiz duels.
//
// Serving a question never waits for AI unless there is truly nothing left:
//   1. a stored question for the skill & type, rated near the target, that this user hasn't seen
//   2. (multiple choice) a freshly generated template question — templates never run out
//   3. any unseen stored question for the skill & type, whatever its rating
//   4. only then: ask the AI for one (and keep it for everyone after)
// When a pool runs low, a background job asks the AI for a small, validated batch.
//
// Questions are rated like players: each answer moves the question's rating (strong players missing
// it → it's harder than labelled). Reports and suspicious stats send a question to review.
const crypto = require('crypto');
const Question = require('../models/Question');
const QuestionSeen = require('../models/QuestionSeen');
const templates = require('./templates');
const { seedQuestions } = require('./seed');

const TYPES = ['mcq', 'subjective', 'coding'];
const LOW_POOL = 10;              // fewer unseen questions than this near a user's level → top up
const BATCH_SIZE = 6;
const DAILY_AI_CAP = parseInt(process.env.QUESTION_AI_DAILY_CAP, 10) || 200;
const PENDING_SHARE = 0.05;       // how often a new (pending) question is tried
const REVIEW_REPORTS = 3;

/* ── skills ── */
const ALIASES = {
    html5: 'html', css3: 'css', sass: 'css', scss: 'css', tailwind: 'css',
    postgresql: 'sql', postgres: 'sql', mysql: 'sql', sqlite: 'sql',
    'express.js': 'node.js', express: 'node.js', nodejs: 'node.js', node: 'node.js',
    js: 'javascript', ecmascript: 'javascript', ts: 'typescript', 'react.js': 'react', reactjs: 'react',
    mongo: 'mongodb', shell: 'linux', bash: 'linux', 'linux & shell': 'linux'
};
const skillKey = (name) => {
    const k = String(name || '').trim().toLowerCase();
    return ALIASES[k] || k;
};

/* ── identity & duplicates ── */
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); // words only (similarity)
const normText = (s) => String(s || '').toLowerCase().replace(/[?.!,;:]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const normCode = (s) => String(s || '').replace(/\s+/g, '');
const hashOf = (q) => crypto.createHash('sha1').update([q.type, skillKey(q.skill), normText(q.text), normCode(q.code)].join('|')).digest('hex');
const shingles = (s) => {
    const w = normalize(s).split(' ').filter(Boolean);
    const out = new Set();
    for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    if (!out.size && w.length) out.add(w.join(' '));
    return out;
};
const similarity = (a, b) => {
    const A = shingles(a);
    const B = shingles(b);
    let common = 0;
    for (const x of A) if (B.has(x)) common++;
    return common / Math.max(1, A.size + B.size - common);
};

/** Checks the shape of a question. Returns a cleaned copy or null. */
function validate(q) {
    if (!q || !TYPES.includes(q.type) || typeof q.text !== 'string' || q.text.trim().length < 8) return null;
    const clean = {
        skill: String(q.skill || '').slice(0, 60),
        type: q.type,
        text: q.text.trim().slice(0, 2000),
        code: String(q.code || '').slice(0, 4000),
        title: String(q.title || '').slice(0, 120),
        answer: String(q.answer ?? '').slice(0, 8000),
        explanation: String(q.explanation || '').slice(0, 1500),
        options: [],
        codeTemplate: String(q.codeTemplate || '').slice(0, 4000),
        testCases: Array.isArray(q.testCases) ? q.testCases.slice(0, 10).map(t => ({ input: String(t?.input ?? ''), output: String(t?.output ?? '') })) : []
    };
    if (!clean.skill) return null;
    if (q.type === 'mcq') {
        const options = (q.options || []).map(o => String(o).trim()).filter(Boolean);
        if (options.length < 3 || options.length > 6 || new Set(options.map(o => o.toLowerCase().replace(/\s+/g, ' '))).size !== options.length) return null;
        if (!options.includes(clean.answer.trim())) return null;
        clean.options = options;
        clean.answer = clean.answer.trim();
    }
    if (q.type !== 'mcq' && !clean.answer) return null;
    return clean;
}

/** Stores a question (or returns the existing copy). `status`: active | pending. */
async function addQuestion(q, { status = 'active', source, rating, templateId } = {}) {
    const clean = validate(q);
    if (!clean) return null;
    const hash = hashOf(clean);
    const existing = await Question.findOne({ hash });
    if (existing) return existing;
    try {
        return await Question.create({
            ...clean,
            skills: [skillKey(clean.skill)],
            rating: Math.round(rating ?? q.rating ?? 1300),
            status,
            source: source || q.source,
            templateId: templateId || q.templateId,
            hash
        });
    } catch (err) {
        if (err.code === 11000) return Question.findOne({ hash });
        throw err;
    }
}

/* ── seeding ── */
let seeded = null;
/** Adds the hand-written / legacy questions that aren't in the bank yet (safe to run every start). */
function seedBank() {
    seeded ??= (async () => {
        const seeds = seedQuestions()
            .map(src => ({ src, q: validate(src) }))
            .filter(x => x.q)
            .map(x => ({ ...x, hash: hashOf(x.q) }));
        const have = new Set((await Question.find({ hash: { $in: seeds.map(x => x.hash) } }).select('hash').lean()).map(x => x.hash));
        const fresh = [];
        for (const { src, q, hash } of seeds) {
            if (have.has(hash)) continue;
            have.add(hash);
            fresh.push({ ...q, skills: [skillKey(q.skill)], rating: src.rating ?? 1300, status: 'active', source: src.source || 'seed', hash });
        }
        if (fresh.length) await Question.insertMany(fresh, { ordered: false }).catch(err => { if (err.code !== 11000) throw err; });
        return fresh.length;
    })().catch((err) => { seeded = null; throw err; });
    return seeded;
}

/* ── seen ── */
const seenIds = async (userIds, key) => {
    const ids = (userIds || []).filter(Boolean);
    if (!ids.length) return [];
    return QuestionSeen.find({ user: { $in: ids }, skill: key }).distinct('question');
};

async function markSeen(userIds, question) {
    const key = question.skills?.[0] || skillKey(question.skill);
    await Promise.all((userIds || []).filter(Boolean).map(user =>
        QuestionSeen.updateOne({ user, question: question._id }, { $setOnInsert: { skill: key, at: new Date() } }, { upsert: true }).catch(() => {})
    ));
}

/* ── picking ── */
async function sampleOne({ key, type, target, seen, status, window }) {
    const match = { skills: key, type, status: Array.isArray(status) ? { $in: status } : status };
    if (seen.length) match._id = { $nin: seen };
    if (Number.isFinite(window)) match.rating = { $gte: target - window, $lte: target + window };
    const [doc] = await Question.aggregate([{ $match: match }, { $sample: { size: 1 } }]);
    return doc ? Question.hydrate(doc) : null;
}

/** A new template question near `target` that the user hasn't seen, or null. */
async function fromTemplate(key, seen, target) {
    const list = templates.templatesFor(key);
    if (!list.length) return null;
    const seenSet = new Set(seen.map(String));
    const rating = { easy: 1000, medium: 1300, hard: 1600 };
    // Prefer templates whose difficulty is close to the target
    const ordered = [...list].sort((a, b) => Math.abs(rating[a.difficulty] - target) - Math.abs(rating[b.difficulty] - target) || Math.random() - 0.5);
    for (let attempt = 0; attempt < 12; attempt++) {
        const t = ordered[attempt % Math.min(ordered.length, 3)] || ordered[0];
        const made = templates.generate(t, Math.random);
        if (!made) continue;
        const doc = await addQuestion(made, { source: 'template', status: 'active', templateId: t.id });
        if (doc && !seenSet.has(String(doc._id))) return doc;
    }
    return null;
}

/* ── AI supply ── */
const deficits = new Map(); // "key|type|band" -> { skill, type, target, count }
let aiToday = { day: '', used: 0 };
const aiBudget = (n) => {
    const day = new Date().toISOString().slice(0, 10);
    if (aiToday.day !== day) aiToday = { day, used: 0 };
    if (aiToday.used + n > DAILY_AI_CAP) return false;
    aiToday.used += n;
    return true;
};

function noteDeficit(skill, type, target) {
    const band = Math.round(target / 200) * 200;
    const k = `${skillKey(skill)}|${type}|${band}`;
    const d = deficits.get(k) || { skill, type, target: band, count: 0 };
    d.count++;
    deficits.set(k, d);
}

const PROMPT_RULES = {
    mcq: '- type "mcq": exactly 4 options; "answer" is copied exactly from one option; one clearly correct option.',
    subjective: '- type "subjective": an open question answered in a few sentences; "answer" is a model answer; no options.',
    coding: '- type "coding": a small function to write; "codeTemplate" is ONLY the empty function skeleton; "testCases" has 2–4 {input, output}; "answer" is a correct solution; no options.'
};
const level = (r) => (r < 1100 ? 'beginner' : r < 1450 ? 'intermediate' : r < 1750 ? 'advanced' : 'expert');

/** Asks the AI for `count` questions; returns validated, de-duplicated plain objects (not yet stored). */
async function aiGenerate(skill, type, target, count) {
    const { generateJSON } = require('../utils/aiHelper');
    const key = skillKey(skill);
    const existing = await Question.find({ skills: key, type }).select('text').limit(400).lean();
    const avoid = existing.slice(-25).map(q => q.text.slice(0, 70));
    const prompt = `Write ${count} distinct, accurate ${type} questions about ${skill} for a ${level(target)} developer (difficulty rating about ${target}).
Rules:
${PROMPT_RULES[type]}
- Test real understanding (behaviour, trade-offs, gotchas), not trivia about the technology's name or history.
- Put any code the question refers to in "code" (not inside "question").
- "explanation": 1–2 sentences on why the answer is right.
- Don't repeat these: ${JSON.stringify(avoid)}
Return JSON only: {"questions": [{"question": "", "code": "", "options": [], "answer": "", "explanation": "", "title": "", "codeTemplate": "", "testCases": []}]}`;
    const data = await generateJSON(prompt, { taskLabel: 'QuestionBank', temperature: 0.8 });
    const raw = Array.isArray(data?.questions) ? data.questions : [];
    const out = [];
    for (const r of raw) {
        const q = validate({ ...r, text: r.question, skill, type });
        if (!q) continue;
        if (existing.some(e => similarity(e.text, q.text) > 0.6) || out.some(o => similarity(o.text, q.text) > 0.6)) continue;
        out.push(q);
    }
    if (type !== 'mcq' || !out.length) return out;

    // Second opinion: answer the questions without the key; keep only those it gets right
    const check = await generateJSON(`Answer each multiple-choice question. Return JSON only: {"answers": [<option index, 0-based>, ...]}.
${out.map((q, i) => `${i + 1}. ${q.text}${q.code ? `\n${q.code}` : ''}\n${q.options.map((o, j) => `   ${j}) ${o}`).join('\n')}`).join('\n\n')}`, { taskLabel: 'QuestionBankCheck', temperature: 0 }).catch(() => null);
    const answers = Array.isArray(check?.answers) ? check.answers : [];
    return out.filter((q, i) => q.options[Number(answers[i])] === q.answer);
}

// After the AI fails (no keys, outage, rate limit), leave it alone for a while instead of retrying per request
const AI_COOLDOWN_MS = 5 * 60000;
let aiPausedUntil = 0;
const aiAvailable = () => Date.now() >= aiPausedUntil;
async function withAI(fn) {
    try {
        return await fn();
    } catch (err) {
        if (aiAvailable()) console.warn(`[questions] AI generation failed, pausing it for ${AI_COOLDOWN_MS / 60000} min:`, err.message);
        aiPausedUntil = Date.now() + AI_COOLDOWN_MS;
        throw err;
    }
}

/** Generates and stores a batch for a skill/type/level (background). Returns how many were added. */
async function topUp(skill, type, target, count = BATCH_SIZE) {
    if (!aiAvailable() || !aiBudget(count)) return 0;
    const made = await withAI(() => aiGenerate(skill, type, target, count));
    let added = 0;
    for (const q of made) if (await addQuestion(q, { source: 'ai', status: 'pending', rating: target })) added++;
    return added;
}

let topUpRunning = false;
/** Works through the most-needed pools, a couple at a time. */
async function processDeficits(max = 2) {
    if (topUpRunning || !aiAvailable()) return 0;
    topUpRunning = true;
    let added = 0;
    try {
        const queue = [...deficits.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, max);
        for (const [k, d] of queue) {
            deficits.delete(k);
            try {
                added += await topUp(d.skill, d.type, d.target);
            } catch {
                if (!deficits.has(k)) deficits.set(k, d); // try again after the pause
                break;
            }
        }
    } finally {
        topUpRunning = false;
    }
    return added;
}

/** On-demand: the user is waiting and nothing else is left. One question, stored for reuse. */
async function generateOnDemand(skill, type, target) {
    if (!aiAvailable() || !aiBudget(1)) return null;
    try {
        const [q] = await withAI(() => aiGenerate(skill, type, target, 1));
        return q ? addQuestion(q, { source: 'ai', status: 'pending', rating: target }) : null;
    } catch {
        return null;
    }
}

/* ── serving ── */
/**
 * The next question for `userIds` (one person for assessments, both players for quiz duels).
 * `target` is the rating to aim for. Returns a Question document or null. It's marked as seen
 * unless `mark` is false (quiz duels mark each question when its round is actually played).
 */
async function serveQuestion({ userIds, skill, type = 'mcq', target = 1300, exclude = [], mark = true }) {
    await seedBank().catch(() => {});
    const key = skillKey(skill);
    const seen = [...(await seenIds(userIds, key)), ...exclude];
    let q = null;
    if (Math.random() < PENDING_SHARE) q = await sampleOne({ key, type, target, seen, status: 'pending', window: 400 });
    for (const window of [100, 200, 400]) {
        if (q) break;
        q = await sampleOne({ key, type, target, seen, status: 'active', window });
    }
    if (!q && type === 'mcq') q = await fromTemplate(key, seen, target);
    if (!q) q = await sampleOne({ key, type, target, seen, status: ['active', 'pending'], window: Infinity });

    // Running low near this level? Ask for more in the background.
    const unseenNear = await Question.countDocuments({ skills: key, type, status: { $in: ['active', 'pending'] }, rating: { $gte: target - 200, $lte: target + 200 }, _id: { $nin: seen } });
    if (unseenNear < LOW_POOL) {
        noteDeficit(skill, type, target);
        if (unseenNear < 3) processDeficits().catch(() => {}); // nearly dry: don't wait for the timer
    }

    if (!q) q = await generateOnDemand(skill, type, target);
    if (q && mark) await markSeen(userIds, q);
    return q;
}

/** `count` multiple-choice questions for a quiz duel, none seen by any of the players (not marked yet). */
async function quizSet({ userIds, skill, target = 1300, count = 7 }) {
    const out = [];
    // Easy → hard across the match
    const spread = [-250, -150, -50, 0, 50, 150, 250];
    for (let i = 0; i < count; i++) {
        const q = await serveQuestion({ userIds, skill, type: 'mcq', target: target + (spread[i] ?? 0), exclude: out.map(x => x._id), mark: false });
        if (q) out.push(q);
    }
    return out;
}

/* ── learning from answers ── */
const avg = (sum, n) => (n ? sum / n : 0);

function lifecycle(q) {
    const reporters = new Set((q.reports || []).map(r => String(r.user)));
    if (reporters.size >= REVIEW_REPORTS) return review(q, `reported by ${reporters.size} people`);
    if (q.attempts >= 12 && q.rightCount >= 3 && q.wrongCount >= 3 && avg(q.raterSumWrong, q.wrongCount) - avg(q.raterSumRight, q.rightCount) > 150) {
        return review(q, 'stronger players miss it more often than weaker ones (check the answer)');
    }
    if (q.type === 'mcq' && q.attempts >= 25 && q.scoreSum / q.attempts < 0.05) return review(q, 'almost nobody gets it right (check the answer)');
    if (q.status === 'pending' && q.attempts >= 8) q.status = 'active';
    return q;
}
function review(q, reason) {
    if (q.status !== 'retired') {
        q.status = 'review';
        q.statusReason = reason;
    }
    return q;
}

/**
 * Records one answer: moves the question's rating (it "plays" against the user), updates its stats
 * and status. `score` is 0–1; `userRating` is the user's rating in that skill.
 */
async function recordAnswer({ questionId, userRating = 1200, score, timeMs = 0 }) {
    if (!Number.isFinite(score)) return null;
    // Optimistic: only write if nobody else answered it in between, otherwise re-read and retry
    for (let attempt = 0; attempt < 20; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, Math.random() * 20 * attempt));
        const q = await Question.findById(questionId).lean();
        if (!q) return null;
        const before = q.attempts;
        applyAnswer(q, { userRating, score, timeMs });
        const fields = ['rating', 'attempts', 'scoreSum', 'timeSumMs', 'raterSumRight', 'rightCount', 'raterSumWrong', 'wrongCount', 'status', 'statusReason'];
        const { matchedCount } = await Question.updateOne({ _id: q._id, attempts: before }, { $set: Object.fromEntries(fields.filter(f => q[f] !== undefined).map(f => [f, q[f]])) });
        if (matchedCount) return q;
    }
    return null;
}

/** The pure part of recordAnswer: updates rating, stats and status on `q` in place. */
function applyAnswer(q, { userRating, score, timeMs = 0 }) {
    score = Math.max(0, Math.min(1, score));
    const ur = Number.isFinite(userRating) ? userRating : 1200;
    const expected = 1 / (1 + 10 ** ((q.rating - ur) / 400));
    const k = q.attempts < 20 ? 24 : 8;
    q.rating = Math.round(q.rating + k * (expected - score));
    q.attempts += 1;
    q.scoreSum += score;
    q.timeSumMs += Math.max(0, Math.min(timeMs || 0, 30 * 60000));
    if (score >= 0.5) { q.raterSumRight += ur; q.rightCount += 1; } else { q.raterSumWrong += ur; q.wrongCount += 1; }
    return lifecycle(q);
}

/** A user flags a question as wrong or unclear. */
async function report(questionId, userId, reason) {
    const q = await Question.findById(questionId);
    if (!q) return null;
    if (!q.reports.some(r => String(r.user) === String(userId))) {
        q.reports.push({ user: userId, reason: String(reason || '').slice(0, 300) });
        lifecycle(q);
        await q.save();
    }
    return q;
}

/** Starts the background top-up (every few minutes, only when pools ran low and AI is configured). */
function startTopUp(intervalMs = 5 * 60000) {
    const timer = setInterval(() => processDeficits().catch(() => {}), intervalMs);
    timer.unref?.();
    return timer;
}

module.exports = {
    serveQuestion, quizSet, recordAnswer, report, markSeen, seedBank, startTopUp, processDeficits, topUp,
    addQuestion, validate, hashOf, similarity, skillKey, noteDeficit, deficits, lifecycle, applyAnswer
};
