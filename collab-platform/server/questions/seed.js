// questions/seed.js — fills the bank on startup from the hand-written quiz questions and the real
// (non-placeholder) questions of the old questionBank.json. Idempotent: existing ones are skipped.
const { QUIZ } = require('../battles/content/quiz');
const legacyBank = require('../questionBank.json');

const RATING = { easy: 1000, medium: 1300, hard: 1600 };

// The old bank padded 25 of 26 skills with generated filler like "What is React primarily used for?
// → Common use: React". Those are dropped.
const FILLER = /Common use:|primarily used for\?|common use case for|For advanced .+ usage, which approach|Building with |Follow best practices and automation|recommended best practice when using|advanced consideration when architecting|Follow official docs|Consider scalability, security/i;
const isFiller = (q) => FILLER.test(`${q.question} ${JSON.stringify(q.options || [])} ${q.answer}`);

function seedQuestions() {
    const out = [];
    for (const [skill, list] of Object.entries(QUIZ)) {
        for (const q of list) {
            out.push({
                skill,
                type: 'mcq',
                text: q.q,
                code: q.code || '',
                options: q.options,
                answer: q.options[q.answer],
                explanation: q.explain,
                rating: RATING[q.difficulty] || 1300,
                source: 'seed'
            });
        }
    }
    for (const [skill, list] of Object.entries(legacyBank)) {
        for (const q of list) {
            if (isFiller(q)) continue;
            if (q.type === 'mcq') {
                if (!Array.isArray(q.options) || !q.options.includes(q.answer)) continue;
                out.push({ skill, type: 'mcq', text: q.question, options: q.options, answer: q.answer, rating: RATING[q.difficulty] || 1300, source: 'legacy' });
            } else {
                // Short written answers ("What will this log?") are graded like subjective answers
                out.push({ skill, type: 'subjective', text: q.question, answer: String(q.answer || ''), rating: RATING[q.difficulty] || 1300, source: 'legacy' });
            }
        }
    }
    return out;
}

module.exports = { seedQuestions, isFiller };
