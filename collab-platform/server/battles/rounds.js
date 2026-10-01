// battles/rounds.js — round-based modes: CodeGuessr (closeness scoring) and skill quizzes.
//
// A round has a public `prompt` (sent when the round starts) and a secret `answer` (sent only when
// the round is revealed). Every guess is scored 0–5000 (GeoGuessr-style) on the server.
const { LANGUAGES, REGIONS, MAP, byId: languageById } = require('./content/languages');
const { BUGS } = require('./content/bugs');
const { makeEstimate } = require('./content/estimates');
const { QUIZ } = require('./content/quiz');

const MAX_SCORE = 5000;
const DIAGONAL = Math.hypot(MAP.width, MAP.height);
const KM_PER_UNIT = 8; // the map's made-up scale, for "412 km off"

const ROUND_MS = { language: 50000, bug: 60000, estimate: 45000, quiz: 15000 };
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

/* ── CodeGuessr rounds ── */
function languageRound(rng, used) {
    const pool = LANGUAGES.filter(l => !used.has(`language:${l.id}`));
    const lang = pick(rng, pool.length ? pool : LANGUAGES);
    used.add(`language:${lang.id}`);
    const code = pick(rng, lang.snippets);
    return {
        type: 'language',
        limitMs: ROUND_MS.language,
        prompt: { type: 'language', code },
        answer: { id: lang.id, name: lang.name, x: lang.x, y: lang.y, region: REGIONS.find(r => r.id === lang.region)?.name }
    };
}

function bugRound(rng, used) {
    const pool = BUGS.filter(b => !used.has(`bug:${b.id}`));
    const bug = pick(rng, pool.length ? pool : BUGS);
    used.add(`bug:${bug.id}`);
    return {
        type: 'bug',
        limitMs: ROUND_MS.bug,
        prompt: { type: 'bug', language: bug.language, code: bug.code, error: bug.error, lines: bug.lines },
        answer: { lines: bug.answer, explain: bug.explain }
    };
}

function estimateRound(rng, used) {
    let e;
    for (let tries = 0; tries < 5; tries++) {
        e = makeEstimate(rng);
        if (!used.has(`estimate:${e.template}`)) break;
    }
    used.add(`estimate:${e.template}`);
    return {
        type: 'estimate',
        limitMs: ROUND_MS.estimate,
        prompt: { type: 'estimate', language: e.language, code: e.code },
        answer: { value: e.answer, explain: e.explain }
    };
}

const MAKERS = { language: languageRound, bug: bugRound, estimate: estimateRound };

/** `count` CodeGuessr rounds, cycling through the three types in a shuffled order. */
function guessrRounds(rng, count) {
    const used = new Set();
    const rounds = [];
    let order = [];
    while (rounds.length < count) {
        if (!order.length) order = shuffle(rng, Object.keys(MAKERS));
        rounds.push(MAKERS[order.shift()](rng, used));
    }
    return rounds;
}

/* ── quiz rounds ── */
function quizRounds(rng, skill, count = 7) {
    const questions = QUIZ[skill] || QUIZ.JavaScript;
    // A mix of difficulties, easy first
    const order = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];
    const left = shuffle(rng, questions);
    const rounds = [];
    for (let i = 0; i < count && left.length; i++) {
        const want = order[i] || 'medium';
        const idx = Math.max(0, left.findIndex(q => q.difficulty === want));
        const q = left.splice(idx, 1)[0];
        const options = shuffle(rng, q.options.map((text, k) => ({ text, right: k === q.answer })));
        rounds.push({
            type: 'quiz',
            limitMs: ROUND_MS.quiz,
            prompt: { type: 'quiz', q: q.q, code: q.code, options: options.map(o => o.text), difficulty: q.difficulty },
            answer: { index: options.findIndex(o => o.right), explain: q.explain }
        });
    }
    return rounds;
}

/**
 * Quiz rounds from the question bank: questions neither player has seen, rated near their level
 * (easy → hard). Topped up from the built-in quiz content if the bank comes up short.
 */
async function bankQuizRounds(rng, { userIds, skill, target, count = 7 }) {
    const bank = require('../questions/bank');
    let docs = [];
    try {
        docs = await bank.quizSet({ userIds, skill, target, count });
    } catch (err) {
        console.warn('[battle] question bank unavailable:', err.message);
    }
    const label = (r) => (r < 1150 ? 'easy' : r < 1450 ? 'medium' : 'hard');
    const out = docs.map((doc) => {
        const options = shuffle(rng, doc.options.map(text => ({ text, right: text === doc.answer })));
        return {
            type: 'quiz',
            limitMs: ROUND_MS.quiz,
            prompt: { type: 'quiz', q: doc.text, code: doc.code || undefined, options: options.map(o => o.text), difficulty: label(doc.rating), questionId: String(doc._id) },
            answer: { index: options.findIndex(o => o.right), explain: doc.explanation }
        };
    });
    if (out.length < count) {
        const have = new Set(out.map(r => r.prompt.q + (r.prompt.code || '')));
        const extra = quizRounds(rng, skill, count).filter(r => !have.has(r.prompt.q + (r.prompt.code || '')));
        out.push(...extra.slice(0, count - out.length));
    }
    return out;
}

/* ── scoring ── */
const nearestLanguage = (x, y) => LANGUAGES.reduce((best, l) => {
    const d = Math.hypot(l.x - x, l.y - y);
    return d < best.d ? { d, lang: l } : best;
}, { d: Infinity, lang: null }).lang;

/**
 * Scores one guess. Returns { score, detail } or null when the guess is malformed.
 * `elapsedMs` matters for quizzes (faster right answers score more).
 */
function scoreGuess(round, guess, elapsedMs = 0) {
    if (!guess || typeof guess !== 'object') return null;
    switch (round.type) {
        case 'language': {
            const x = Number(guess.x);
            const y = Number(guess.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAP.width || y > MAP.height) return null;
            const d = Math.hypot(x - round.answer.x, y - round.answer.y);
            const near = nearestLanguage(x, y);
            return {
                score: d < 4 ? MAX_SCORE : Math.round(MAX_SCORE * Math.exp((-7 * d) / DIAGONAL)),
                detail: { x, y, km: Math.round(d * KM_PER_UNIT), near: near ? near.name : null }
            };
        }
        case 'bug': {
            const line = Math.round(Number(guess.line));
            if (!Number.isFinite(line) || line < 1 || line > round.prompt.lines) return null;
            const d = Math.min(...round.answer.lines.map(a => Math.abs(a - line)));
            return { score: Math.round(MAX_SCORE * Math.exp(-d / 3)), detail: { line, off: d } };
        }
        case 'estimate': {
            const value = Number(guess.value);
            if (!Number.isFinite(value) || value <= 0 || value > 1e12) return null;
            const d = Math.abs(Math.log10(value) - Math.log10(round.answer.value));
            return { score: d >= 1 ? 0 : Math.round(MAX_SCORE * (1 - d) ** 1.6), detail: { value, ratio: value / round.answer.value } };
        }
        case 'quiz': {
            const index = Number(guess.index);
            if (!Number.isInteger(index) || index < 0 || index >= round.prompt.options.length) return null;
            const right = index === round.answer.index;
            const left = Math.max(0, round.limitMs - elapsedMs);
            return { score: right ? 500 + Math.round((500 * left) / round.limitMs) : 0, detail: { index, right } };
        }
        default:
            return null;
    }
}

/* ── duel damage (CodeGuessr): the closer guess hits for the difference, and hits harder later ── */
const START_HP = 6000;
const multiplierFor = (roundIndex) => (roundIndex < 3 ? 1 : 1 + 0.5 * (roundIndex - 2));

const SOLO_ROUNDS = 5;
const MAX_DUEL_ROUNDS = 15;
const QUIZ_ROUNDS = 7;

module.exports = {
    guessrRounds, quizRounds, bankQuizRounds, scoreGuess, multiplierFor, nearestLanguage,
    START_HP, MAX_SCORE, SOLO_ROUNDS, MAX_DUEL_ROUNDS, QUIZ_ROUNDS, ROUND_MS,
    MAP, REGIONS, LANGUAGES, languageById
};
