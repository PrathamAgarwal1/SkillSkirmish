// Run with: npm test   (uses Node's built-in test runner — no extra dependencies)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { resolveProjectPath, sanitizeRelPath, isInside, getProjectDir, isRoomMember } = require('../utils/access');
const { computeDecay, ONE_WEEK_IN_MS, DECAY_RATE_NORMAL } = require('../workers/skillDecay');
const { parseJSONReply, mapScoreToBucket } = require('../utils/aiHelper');
const { isValidPackageName } = require('../utils/packageManager');
const { detectRunConfig } = require('../sandbox/runConfig');
const { normalizeMcq, computeSessionRating, buildDynamicDifficultyPlan, getKFactor, expectedProbability } =
    require('../routes/assessment')._internals;

const PROJECT = '0123456789abcdef01234567';

describe('path safety', () => {
    test('resolves normal paths inside the project', () => {
        assert.equal(resolveProjectPath(PROJECT, 'src/App.jsx'), path.join(getProjectDir(PROJECT), 'src', 'App.jsx'));
    });

    test('rejects traversal out of the project', () => {
        assert.throws(() => resolveProjectPath(PROJECT, '../../server/index.js'));
        assert.throws(() => resolveProjectPath(PROJECT, 'src/../../other'));
        assert.throws(() => resolveProjectPath(PROJECT, path.resolve('/etc/passwd')));
    });

    test('isInside is not fooled by a shared name prefix', () => {
        const root = path.resolve('projects', 'abc');
        assert.equal(isInside(root, path.resolve('projects', 'abcd', 'x.js')), false);
        assert.equal(isInside(root, path.resolve('projects', 'abc', 'x.js')), true);
    });

    test('sanitizeRelPath normalizes and rejects unsafe input', () => {
        assert.equal(sanitizeRelPath('src\\components\\A.jsx'), 'src/components/A.jsx');
        assert.equal(sanitizeRelPath('/src/./A.jsx'), 'src/A.jsx');
        assert.equal(sanitizeRelPath('../secret'), null);
        assert.equal(sanitizeRelPath('a/../../b'), null);
        assert.equal(sanitizeRelPath(''), null);
        assert.equal(sanitizeRelPath(undefined), null);
        assert.equal(sanitizeRelPath('bad\0name'), null);
    });
});

describe('room membership', () => {
    const room = { owner: 'u1', members: ['u2', { _id: 'u3' }] };
    test('owner and members (raw or populated) are members', () => {
        assert.ok(isRoomMember(room, 'u1'));
        assert.ok(isRoomMember(room, 'u2'));
        assert.ok(isRoomMember(room, 'u3'));
    });
    test('outsiders are not', () => {
        assert.equal(isRoomMember(room, 'u4'), false);
        assert.equal(isRoomMember(null, 'u1'), false);
    });
});

describe('skill decay', () => {
    const now = Date.UTC(2026, 0, 31);

    test('no decay within a week of practice', () => {
        assert.equal(computeDecay({ mastery: 50 }, now - 3 * 24 * 3600e3, now), null);
    });

    test('decays after a week of inactivity', () => {
        assert.equal(computeDecay({ mastery: 50 }, now - ONE_WEEK_IN_MS - 1, now), 50 - DECAY_RATE_NORMAL);
    });

    test('decays at most once per week even though the worker runs daily', () => {
        const skill = { mastery: 50, lastDecayAt: new Date(now - 24 * 3600e3) };
        assert.equal(computeDecay(skill, now - 30 * 24 * 3600e3, now), null);
    });

    test('never goes below zero and skips zero mastery', () => {
        assert.equal(computeDecay({ mastery: 1 }, 0, now), 0);
        assert.equal(computeDecay({ mastery: 0 }, 0, now), null);
    });
});

describe('MCQ normalization', () => {
    const opts = ['Paris', 'London', 'Rome', 'Berlin'];

    test('exact answers pass through', () => {
        assert.deepEqual(normalizeMcq(opts, 'Rome'), { options: opts, answer: 'Rome' });
    });

    test('letter answers map to the option text', () => {
        assert.equal(normalizeMcq(opts, 'B').answer, 'London');
        assert.equal(normalizeMcq(opts, '(D)').answer, 'Berlin');
        assert.equal(normalizeMcq(opts, 'B) London').answer, 'London');
    });

    test('prefixed options match plain answers', () => {
        const prefixed = ['A) Paris', 'B) London'];
        assert.equal(normalizeMcq(prefixed, 'london').answer, 'B) London');
    });

    test('unmatchable answers are rejected', () => {
        assert.equal(normalizeMcq(opts, 'Madrid'), null);
        assert.equal(normalizeMcq(['only one'], 'only one'), null);
        assert.equal(normalizeMcq(undefined, 'A'), null);
    });
});

describe('ELO rating', () => {
    test('expected probability is 0.5 for equal ratings', () => {
        assert.equal(expectedProbability(1200, 1200), 0.5);
    });

    test('K-factor tiers', () => {
        assert.equal(getKFactor(5, 1500), 40);   // provisional
        assert.equal(getKFactor(40, 1500), 20);  // default
        assert.equal(getKFactor(40, 2400), 10);  // top tier
    });

    test('worked example: 1200 user beats a 1330 question at K=40', () => {
        const { ratingChange, newRating } = computeSessionRating(1200, 0, [{ difficultyElo: 1330, scorePercentage: 100 }]);
        assert.equal(ratingChange, 27);
        assert.equal(newRating, 1227);
    });

    test('fallback (unrated) questions do not move the rating', () => {
        const result = computeSessionRating(1200, 0, [{ difficultyElo: 1200, scorePercentage: 100, isFallback: true }]);
        assert.equal(result.ratingChange, 0);
        assert.equal(result.ratedCount, 0);
    });

    test('difficulty plan stays within the designed band around the user', () => {
        const plan = buildDynamicDifficultyPlan(1500);
        assert.equal(plan.length, 20);
        for (const elo of plan) {
            assert.ok(elo >= 1500 - 180 && elo <= 1500 + 180, `out of band: ${elo}`);
        }
        assert.deepEqual([...plan].sort((a, b) => a - b), plan);
    });
});

describe('AI helpers', () => {
    test('parses fenced / chatty JSON replies', () => {
        assert.deepEqual(parseJSONReply('```json\n{"score": 80}\n```'), { score: 80 });
        assert.deepEqual(parseJSONReply('Sure! {"score": 10, "feedback": "ok"} Hope that helps'), { score: 10, feedback: 'ok' });
    });

    test('score buckets', () => {
        assert.equal(mapScoreToBucket(90), 100);
        assert.equal(mapScoreToBucket(70), 75);
        assert.equal(mapScoreToBucket(40), 50);
        assert.equal(mapScoreToBucket(20), 25);
        assert.equal(mapScoreToBucket(5), 0);
    });
});

describe('package name validation', () => {
    for (const good of ['lodash', '@tanstack/react-query', 'react@18.3.1', 'numpy==1.26.4', 'uvicorn[standard]>=0.29', 'scikit-learn']) {
        test(`accepts ${good}`, () => assert.equal(isValidPackageName(good), true));
    }
    for (const bad of ['lodash; rm -rf /', 'a && b', '$(whoami)', "x' y", '../evil', '"quoted"', '']) {
        test(`rejects ${JSON.stringify(bad)}`, () => assert.equal(isValidPackageName(bad), false));
    }
});

describe('run config detection', () => {
    const fs = require('fs');
    const os = require('os');
    const { TEMPLATES } = require('../sandbox/templates');

    const detectFor = (type) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-detect-'));
        for (const f of TEMPLATES[type]) {
            fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
            fs.writeFileSync(path.join(dir, f.path), f.content);
        }
        const cfg = detectRunConfig(dir, type);
        fs.rmSync(dir, { recursive: true, force: true });
        return cfg;
    };

    const expectations = {
        'React App': ['node', 'static'],
        'MERN Stack': ['node', 'server'],
        'Next.js': ['node', 'server'],
        'Node.js API': ['node', 'server'],
        'Express + EJS': ['node', 'server'],
        'Vanilla Web': ['node', 'static'],
        'Python API (FastAPI)': ['python', 'server'],
        'Python Script': ['python', null],
        'Machine Learning (Jupyter)': ['ml', 'server'],
        'Android (Expo)': ['node', 'static']
    };

    for (const [type, [env, kind]] of Object.entries(expectations)) {
        test(`${type} → ${env} environment, deploys as ${kind}`, () => {
            const cfg = detectFor(type);
            assert.equal(cfg.env, env);
            assert.equal(cfg.deploy.kind, kind);
            assert.ok(cfg.targets.length > 0, 'has something to run');
        });
    }

    const detectFiles = (type, files) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-detect-'));
        for (const [p, content] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
            fs.writeFileSync(path.join(dir, p), content);
        }
        const cfg = detectRunConfig(dir, type);
        fs.rmSync(dir, { recursive: true, force: true });
        return cfg;
    };

    test('a top-level index.html is a static site, despite serve.py or a nested package.json', () => {
        const cfg = detectFiles('React App', {
            'index.html': '<h1>hi</h1>', 'style.css': '', 'DESIGN.md': '',
            'serve.py': 'import http.server\nhttp.server.test()',
            'src/package.json': '{"name":"tools"}', 'src/main.js': ''
        });
        assert.equal(cfg.label, 'Static website');
        assert.equal(cfg.install.length, 0);
        assert.equal(cfg.deploy.kind, 'static');
    });

    test('a site inside one folder runs from there, ignoring a script-less package.json at the top', () => {
        const cfg = detectFiles('React App', {
            'package.json': '{"dependencies":{"vite":"^8.0.0"}}',
            'My Portfolio/index.html': '<h1>hi</h1>', 'My Portfolio/serve.py': 'import http.server',
            'My Portfolio/src/app.js': ''
        });
        assert.equal(cfg.label, 'Static website (My Portfolio/)');
        assert.equal(cfg.deploy.output, 'My Portfolio');
        assert.match(cfg.targets[0].cmd, /^http-server 'My Portfolio' /);
    });

    test('a real Vite project at the top level is still a Vite app', () => {
        const cfg = detectFiles('React App', {
            'package.json': '{"scripts":{"dev":"vite","build":"vite build"},"devDependencies":{"vite":"^8.0.0"}}',
            'index.html': '<div id="root"></div>'
        });
        assert.notEqual(cfg.label.startsWith('Static'), true);
    });

    test('index.html next to a Flask app still runs the Python app', () => {
        const cfg = detectFiles('Vanilla Web', { 'index.html': '', 'app.py': 'from flask import Flask\napp = Flask(__name__)' });
        assert.equal(cfg.env, 'python');
    });

    test('ML projects offer JupyterLab and the Streamlit app', () => {
        assert.deepEqual(detectFor('Machine Learning (Jupyter)').targets.map(t => t.id), ['jupyter', 'streamlit']);
    });
});

describe('secrets', () => {
    const { encrypt, decrypt, validateKey } = require('../utils/secrets');
    process.env.SECRETS_KEY = process.env.SECRETS_KEY || 'test-key';

    test('round-trips and uses a fresh IV each time', () => {
        const a = encrypt('hunter2');
        assert.notEqual(a, encrypt('hunter2'));
        assert.equal(decrypt(a), 'hunter2');
    });

    test('tampering is detected', () => {
        const parts = encrypt('value').split(':');
        parts[3] = Buffer.from('forged').toString('base64');
        assert.throws(() => decrypt(parts.join(':')));
    });

    test('reserved and malformed names are rejected', () => {
        assert.equal(validateKey('KAGGLE_KEY'), null);
        assert.ok(validateKey('PORT'));
        assert.ok(validateKey('LD_PRELOAD'));
        assert.ok(validateKey('1BAD'));
        assert.ok(validateKey('A-B'));
    });
});

describe('browser mode (free hosting)', () => {
    const fs = require('fs');
    const os = require('os');
    const { TEMPLATES } = require('../sandbox/templates');
    const { browserPlan, parseRequirements } = require('../sandbox/browserPlan');
    const { listFiles } = require('../sandbox/runConfig');
    const { prefixAbsoluteUrls } = require('../sandbox/siteServer');

    const planFor = (type) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-plan-'));
        for (const f of TEMPLATES[type]) {
            fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
            fs.writeFileSync(path.join(dir, f.path), f.content);
        }
        const plan = browserPlan(detectRunConfig(dir, type), dir, listFiles(dir));
        fs.rmSync(dir, { recursive: true, force: true });
        return plan;
    };

    test('JavaScript projects run in a WebContainer on port 3000', () => {
        const plan = planFor('React App');
        assert.equal(plan.runtime, 'node');
        assert.equal(plan.targets[0].engine, 'wc');
        assert.match(plan.targets[0].cmd, /--port 3000/);
        assert.equal(plan.deploy.build, 'npx vite build --base=./');
    });

    test('static sites use npx http-server (not preinstalled in the browser)', () => {
        assert.match(planFor('Vanilla Web').targets[0].cmd, /^npx --yes http-server/);
    });

    test('Expo gets a phone target through Expo Snack', () => {
        assert.deepEqual(planFor('Android (Expo)').targets.map(t => t.engine), ['wc', 'snack']);
    });

    test('server apps explain why they cannot be hosted for free', () => {
        const plan = planFor('Node.js API');
        assert.equal(plan.deploy.kind, null);
        assert.match(plan.deploy.reason, /static/);
    });

    test('ML projects: Streamlit via stlite, notebooks and scripts via Pyodide', () => {
        const plan = planFor('Machine Learning (Jupyter)');
        assert.equal(plan.runtime, 'python');
        assert.deepEqual(plan.targets.map(t => t.engine), ['streamlit', 'notebook', 'python']);
        assert.equal(plan.deploy.engine, 'stlite');
    });

    test('FastAPI projects open the in-browser API tester', () => {
        const plan = planFor('Python API (FastAPI)');
        assert.equal(plan.targets[0].engine, 'api');
        assert.equal(plan.targets[0].framework, 'fastapi');
    });

    test('requirements that cannot run in the browser are flagged', () => {
        const reqs = parseRequirements('pandas>=2\n# comment\ntorch==2.3\nuvicorn[standard]\n-r other.txt\n');
        assert.deepEqual(reqs.map(r => [r.name, r.supported]), [['pandas', true], ['torch', false], ['uvicorn', false]]);
    });

    test('deployed HTML gets its absolute URLs moved under /apps/<slug>', () => {
        const html = '<script src="/assets/a.js"></script><link href="/style.css"><a href="//cdn.x/y">x</a><img src="rel.png">';
        assert.equal(prefixAbsoluteUrls(html, '/apps/demo'),
            '<script src="/apps/demo/assets/a.js"></script><link href="/apps/demo/style.css"><a href="//cdn.x/y">x</a><img src="rel.png">');
    });
});

describe('voice calls', () => {
    const crypto = require('crypto');
    const { coturnCredentials, getIceServers } = require('../voice/iceServers');

    test('coturn time-limited credentials follow the TURN REST API format', () => {
        const now = Date.UTC(2026, 0, 1);
        const { username, credential } = coturnCredentials('s3cret', 'user42', now);
        const [expiry, user] = username.split(':');
        assert.equal(user, 'user42');
        assert.equal(Number(expiry), now / 1000 + 12 * 3600);
        assert.equal(credential, crypto.createHmac('sha1', 's3cret').update(username).digest('base64'));
    });

    test('STUN only when no TURN is configured', async () => {
        const saved = { ...process.env };
        delete process.env.TURN_URLS; delete process.env.CLOUDFLARE_TURN_KEY_ID;
        const servers = await getIceServers('u1');
        assert.ok(servers.length >= 1);
        assert.ok(servers.every(s => [].concat(s.urls).every(u => u.startsWith('stun:'))));
        Object.assign(process.env, saved);
    });

    test('static TURN credentials are passed through', async () => {
        const saved = { ...process.env };
        Object.assign(process.env, { TURN_URLS: 'turn:turn.example.com:3478,turns:turn.example.com:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
        delete process.env.TURN_SECRET;
        const turn = (await getIceServers('u1')).find(s => [].concat(s.urls).some(u => u.startsWith('turn')));
        assert.deepEqual(turn, { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'u', credential: 'p' });
        for (const k of ['TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL']) delete process.env[k];
        Object.assign(process.env, saved);
    });
});

describe('battles', () => {
    const catalog = require('../battles/catalog');
    const { buildTests, grade, matches, publicChallenge } = require('../battles/judge');
    const { eloUpdate, decide } = require('../battles/battleManager');
    const rounds = require('../battles/rounds');
    const { draw, targetImage } = require('../battles/rasterize');
    const { TARGETS } = require('../battles/content/css');
    const { rngFrom } = require('../battles/judge');

    test('every mode has content', () => {
        for (const kind of ['task', 'debug', 'algo']) assert.ok(catalog.codePool(kind).length >= 10, kind);
        assert.ok(catalog.cssPool().length >= 8);
        assert.ok(catalog.SKILLS.length >= 10);
    });

    test('every function reference reproduces its own examples', () => {
        for (const kind of ['task', 'algo']) {
            for (const ch of catalog.codePool(kind).filter(c => c.type !== 'sql')) {
                for (const ex of ch.examples) {
                    assert.ok(matches(ch.compare, ch.solve(...JSON.parse(JSON.stringify(ex.args))), ex.expected), `${ch.id}: ${JSON.stringify(ex.args)}`);
                }
            }
        }
    });

    test('tests are deterministic per seed and different across seeds', async () => {
        const ch = catalog.codeChallenge('algo', 'max-subarray');
        const a = await buildTests(ch, 42);
        assert.deepEqual(a, await buildTests(ch, 42));
        assert.notDeepEqual(a.map(t => t.args), (await buildTests(ch, 43)).map(t => t.args));
    });

    test('SQL tasks: expected rows come from the reference query on a fresh database', async () => {
        const ch = catalog.codeChallenge('task', 'sql-no-orders');
        const tests = await buildTests(ch, 9);
        assert.ok(tests.length >= 5);
        for (const t of tests) assert.ok(Array.isArray(t.expected));
        const pub = await publicChallenge(ch);
        assert.ok(pub.sample.tables.some(t => t.name === 'users'));
        assert.deepEqual(pub.languages, ['sql']);
    });

    test('players never get expected outputs or reference code', async () => {
        for (const kind of ['task', 'debug', 'algo']) {
            for (const ch of catalog.codePool(kind)) {
                const pub = await publicChallenge(ch);
                assert.equal(pub.solve, undefined);
                assert.equal(pub.generate, undefined);
                assert.equal(pub.reference, undefined);
                for (const lang of pub.languages) assert.ok(pub.starter[lang], `${ch.id} starter for ${lang}`);
            }
        }
    });

    test('debug races start from the buggy code', async () => {
        const pub = await publicChallenge(catalog.codeChallenge('debug', 'debug-slugify'));
        assert.match(pub.starter.javascript, /split\(\/\[\^a-z\]\+\/\)/);
        assert.match(pub.statement, /2 bugs/);
    });

    test('grading: right, wrong, errors; the expected answer is never revealed', async () => {
        const ch = catalog.codeChallenge('algo', 'two-sum');
        const tests = await buildTests(ch, 7);
        const right = tests.map(t => ({ ok: true, value: JSON.stringify([...t.expected].reverse()) }));
        assert.equal(grade(ch, tests, right).passed, tests.length);
        const wrong = right.map((o, i) => (i === 2 ? { ok: true, value: '[0,0]' } : o));
        const r = grade(ch, tests, wrong);
        assert.equal(r.passed, tests.length - 1);
        assert.equal(r.firstFail.index, 2);
        assert.equal(r.firstFail.expected, undefined);
        assert.equal(grade(ch, tests, [{ ok: false, error: 'boom' }]).passed, 0);
        assert.ok(matches('float', 2.5000000001, 2.5));
        assert.ok(matches('groups', [['tea', 'eat'], ['bat']], [['bat'], ['eat', 'tea']]));
    });

    test('CodeGuessr: closer guesses score more', () => {
        const [lang] = rounds.guessrRounds(rngFrom(1), 3).filter(r => r.type === 'language');
        const exact = rounds.scoreGuess(lang, { x: lang.answer.x, y: lang.answer.y });
        const near = rounds.scoreGuess(lang, { x: lang.answer.x + 40, y: lang.answer.y });
        const far = rounds.scoreGuess(lang, { x: (lang.answer.x + 500) % 1000, y: (lang.answer.y + 300) % 620 });
        assert.equal(exact.score, 5000);
        assert.ok(near.score > far.score && near.score < 5000);
        assert.equal(rounds.scoreGuess(lang, { x: -5, y: 10 }), null, 'off the map');

        const bug = rounds.guessrRounds(rngFrom(2), 3).find(r => r.type === 'bug');
        assert.equal(rounds.scoreGuess(bug, { line: bug.answer.lines[0] }).score, 5000);
        assert.ok(rounds.scoreGuess(bug, { line: bug.answer.lines[0] + 1 }).score > rounds.scoreGuess(bug, { line: bug.answer.lines[0] + 4 })?.score || bug.prompt.lines < bug.answer.lines[0] + 4);

        const est = rounds.guessrRounds(rngFrom(3), 3).find(r => r.type === 'estimate');
        assert.equal(rounds.scoreGuess(est, { value: est.answer.value }).score, 5000);
        assert.equal(rounds.scoreGuess(est, { value: est.answer.value * 20 }).score, 0, '10x+ off scores nothing');
        assert.ok(rounds.scoreGuess(est, { value: est.answer.value * 1.1 }).score > 4000);
    });

    test('quiz: options are shuffled, the answer stays on the server, fast right answers score more', () => {
        const qs = rounds.quizRounds(rngFrom(5), 'JavaScript', 7);
        assert.equal(qs.length, 7);
        assert.ok(qs.some(q => q.answer.index !== 0), 'right answers are not always first');
        for (const q of qs) assert.equal(q.prompt.answer, undefined);
        const q = qs[0];
        const fast = rounds.scoreGuess(q, { index: q.answer.index }, 1000).score;
        const slow = rounds.scoreGuess(q, { index: q.answer.index }, 14000).score;
        assert.ok(fast > slow && slow >= 500);
        assert.equal(rounds.scoreGuess(q, { index: (q.answer.index + 1) % 4 }, 1000).score, 0);
    });

    test('CodeGuessr damage grows in later rounds', () => {
        assert.equal(rounds.multiplierFor(0), 1);
        assert.ok(rounds.multiplierFor(6) > rounds.multiplierFor(3));
    });

    test('CSS targets render to a 400×300 PNG', () => {
        const px = draw(TARGETS[0]);
        assert.equal(px.length, 400 * 300 * 4);
        assert.match(targetImage(TARGETS[1]), /^data:image\/png;base64,/);
    });

    test('Elo: upsets move ratings more, totals are roughly conserved', () => {
        const [a, b] = eloUpdate(1200, 1200, 1);
        assert.ok(a > 1200 && b < 1200 && Math.abs((a - 1200) + (b - 1200)) <= 1);
        const [low] = eloUpdate(1000, 1400, 1);
        const [high] = eloUpdate(1400, 1000, 1);
        assert.ok(low - 1000 > high - 1400);
    });

    test('deciding a winner in each engine', () => {
        const player = (id, o = {}) => ({ userId: id, best: { passed: 0, score: 0, at: null, ...o.best }, solvedMs: o.solvedMs ?? null, forfeited: !!o.forfeited, hp: o.hp ?? 6000, points: o.points ?? 0 });
        const m = (kind, engine, a, b) => ({ kind, engine, mode: 'ranked', players: [a, b] });
        // code
        assert.equal(decide(m('algo', 'code', player('a', { best: { passed: 3, at: 1 } }), player('b', { best: { passed: 15, at: 9 }, solvedMs: 5000 })), 'time').winner, 'b');
        assert.equal(decide(m('task', 'code', player('a', { best: { passed: 7, at: 5 } }), player('b', { best: { passed: 7, at: 9 } })), 'time').winner, 'a');
        // rounds
        assert.equal(decide(m('guessr', 'rounds', player('a', { hp: 0 }), player('b', { hp: 1200 })), 'knockout').winner, 'b');
        assert.equal(decide(m('quiz', 'rounds', player('a', { points: 3100 }), player('b', { points: 2900 })), 'rounds').winner, 'a');
        assert.equal(decide(m('quiz', 'rounds', player('a', { points: 900 }), player('b', { points: 900 })), 'rounds').result, 'draw');
        // css
        assert.equal(decide(m('css', 'css', player('a', { best: { score: 97.5, at: 3 } }), player('b', { best: { score: 92, at: 1 } })), 'time').winner, 'a');
        // forfeits
        assert.equal(decide(m('guessr', 'rounds', player('a'), player('b', { forfeited: true })), 'forfeit').winner, 'a');
    });
});

describe('friends and app access', () => {
    const { pairKey } = require('../utils/friends');
    const { issuePass, readPass, cookieName, canView } = require('../sandbox/appAccess');

    test('a friendship has one key per pair, whoever asked', () => {
        assert.equal(pairKey('b', 'a'), pairKey('a', 'b'));
    });

    test('access passes are tied to one app', () => {
        const prev = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-secret';
        const pass = issuePass('my-app', 'u1');
        assert.equal(readPass(pass, 'my-app').sub, 'u1');
        assert.equal(readPass(pass, 'other-app'), null, 'a pass for one app does not open another');
        assert.equal(readPass(`${pass}x`, 'my-app'), null);
        process.env.JWT_SECRET = prev;
    });

    test('cookie names are safe and per app', () => {
        assert.equal(cookieName('my-app-12ab'), 'ss_app_my_app_12ab');
    });

    test('public apps are open to everyone, others need a signed-in user', async () => {
        assert.equal(await canView({ visibility: 'public' }, null), true);
        assert.equal(await canView({}, null), true);
        assert.equal(await canView({ visibility: 'private', project: 'x' }, null), false);
        assert.equal(await canView({ visibility: 'friends', project: 'x' }, null), false);
    });
});
