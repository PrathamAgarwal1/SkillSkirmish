// Question bank: validation, duplicates, rating updates, auto-review, templates and seed content.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const bank = require('../questions/bank');
const templates = require('../questions/templates');
const { seedQuestions, isFiller } = require('../questions/seed');

const fresh = (extra = {}) => ({
    rating: 1300, attempts: 0, scoreSum: 0, timeSumMs: 0,
    raterSumRight: 0, rightCount: 0, raterSumWrong: 0, wrongCount: 0,
    reports: [], status: 'active', type: 'mcq', ...extra
});

describe('question bank', () => {
    test('skill names map to one key', () => {
        assert.equal(bank.skillKey('HTML5'), 'html');
        assert.equal(bank.skillKey('PostgreSQL'), 'sql');
        assert.equal(bank.skillKey('Express.js'), 'node.js');
        assert.equal(bank.skillKey(' JavaScript '), 'javascript');
    });

    test('validate rejects broken multiple-choice questions', () => {
        const ok = { skill: 'JavaScript', type: 'mcq', text: 'What does typeof null return?', options: ['"object"', '"null"', '"undefined"'], answer: '"object"' };
        assert.ok(bank.validate(ok));
        assert.equal(bank.validate({ ...ok, answer: '"number"' }), null, 'answer must be one of the options');
        assert.equal(bank.validate({ ...ok, options: ['a', 'a', 'b'], answer: 'a' }), null, 'options must be distinct');
        assert.equal(bank.validate({ ...ok, options: ['"object"', 'x'] }), null, 'needs at least 3 options');
        assert.equal(bank.validate({ ...ok, text: 'hi' }), null);
        assert.equal(bank.validate({ skill: 'X', type: 'subjective', text: 'Explain closures in detail', answer: '' }), null, 'written questions need a model answer');
    });

    test('the same question hashes the same regardless of spacing/case', () => {
        const a = { skill: 'JavaScript', type: 'mcq', text: 'What does this log?', code: 'console.log(1+1)' };
        const b = { skill: 'javascript', type: 'mcq', text: '  what does THIS log ', code: 'console.log(1 + 1)' };
        assert.equal(bank.hashOf(a), bank.hashOf(b));
        assert.notEqual(bank.hashOf(a), bank.hashOf({ ...a, code: 'console.log(1+2)' }));
    });

    test('near-duplicates are detected', () => {
        assert.ok(bank.similarity('What is the difference between let and const in JavaScript?', 'What is the difference between let and const in modern JavaScript?') > 0.6);
        assert.ok(bank.similarity('What is the difference between let and const?', 'How does the event loop handle microtasks?') < 0.2);
    });

    test('a question gets harder when people miss it and easier when they get it', () => {
        const missed = bank.applyAnswer(fresh(), { userRating: 1300, score: 0 });
        assert.ok(missed.rating > 1300);
        const solved = bank.applyAnswer(fresh(), { userRating: 1300, score: 1 });
        assert.ok(solved.rating < 1300);
        // A weak player missing a hard question barely moves it
        const expectedMiss = bank.applyAnswer(fresh({ rating: 1700 }), { userRating: 1000, score: 0 });
        assert.ok(expectedMiss.rating - 1700 < 3);
    });

    test('new questions become active after enough answers', () => {
        const q = fresh({ status: 'pending' });
        for (let i = 0; i < 7; i++) bank.applyAnswer(q, { userRating: 1300, score: i % 2 });
        assert.equal(q.status, 'pending');
        bank.applyAnswer(q, { userRating: 1300, score: 1 });
        assert.equal(q.status, 'active');
    });

    test('a question strong players miss more than weak ones goes to review (likely wrong answer key)', () => {
        const q = fresh();
        for (let i = 0; i < 6; i++) bank.applyAnswer(q, { userRating: 1800, score: 0 });
        for (let i = 0; i < 6; i++) bank.applyAnswer(q, { userRating: 1000, score: 1 });
        assert.equal(q.status, 'review');
        assert.match(q.statusReason, /stronger players/);
    });

    test('three different reporters send a question to review', () => {
        const q = fresh({ reports: [{ user: 'a' }, { user: 'a' }, { user: 'b' }] });
        assert.equal(bank.lifecycle(q).status, 'active');
        q.reports.push({ user: 'c' });
        assert.equal(bank.lifecycle(q).status, 'review');
    });

    test('retired questions stay retired', () => {
        const q = fresh({ status: 'retired', reports: [{ user: 'a' }, { user: 'b' }, { user: 'c' }] });
        assert.equal(bank.lifecycle(q).status, 'retired');
    });
});

describe('question templates', () => {
    test('every template produces valid questions with the answer among 4 distinct options', () => {
        let rng = 1;
        const random = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
        for (const t of templates.TEMPLATES) {
            let made = 0;
            for (let i = 0; i < 30; i++) {
                const q = templates.generate(t, random);
                if (!q) continue;
                made++;
                assert.equal(q.options.length, 4, t.id);
                assert.equal(new Set(q.options).size, 4, t.id);
                assert.ok(q.options.includes(q.answer), t.id);
                assert.ok(bank.validate(q), t.id);
            }
            assert.ok(made > 10, `${t.id} rarely produces a question`);
        }
    });

    test('templates are found by skill key', () => {
        assert.ok(templates.templatesFor('javascript').length >= 5);
        assert.ok(templates.templatesFor('python').length >= 4);
        assert.equal(templates.templatesFor('cobol').length, 0);
    });
});

describe('seed questions', () => {
    const seeds = seedQuestions();
    test('no generated filler made it into the bank', () => {
        assert.ok(seeds.length > 150);
        for (const q of seeds) assert.ok(!isFiller({ question: q.text, options: q.options, answer: q.answer }), q.text);
    });
    test('every seed question is valid and unique', () => {
        const hashes = new Set();
        for (const q of seeds) {
            const v = bank.validate(q);
            assert.ok(v, q.text);
            hashes.add(bank.hashOf(v));
        }
        assert.ok(hashes.size >= seeds.length - 2, 'seed questions should not repeat');
    });
});
