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

describe('coding battles', () => {
    const { PROBLEMS } = require('../battles/problems');
    const { buildTests, grade, matches, publicProblem } = require('../battles/judge');
    const { eloUpdate, decide } = require('../battles/battleManager');

    test('every reference solution reproduces its own examples', () => {
        for (const p of PROBLEMS) {
            for (const ex of p.examples) {
                assert.ok(matches(p.compare || 'exact', p.solve(...JSON.parse(JSON.stringify(ex.args))), ex.expected), `${p.id}: ${JSON.stringify(ex.args)}`);
            }
        }
    });

    test('tests are deterministic per seed and different across seeds', () => {
        const a = buildTests('max-subarray', 42);
        assert.deepEqual(a, buildTests('max-subarray', 42));
        assert.notDeepEqual(a.map(t => t.args), buildTests('max-subarray', 43).map(t => t.args));
    });

    test('players never get expected outputs', () => {
        for (const p of PROBLEMS) {
            const pub = publicProblem(p);
            assert.equal(pub.solve, undefined);
            assert.equal(pub.generate, undefined);
            assert.ok(pub.starter.python.includes(`def ${p.fn.python}(`));
            assert.ok(pub.starter.javascript.includes(`function ${p.fn.javascript}(`));
        }
    });

    test('grading: right, wrong, errors, order-insensitive and float answers', () => {
        const tests = buildTests('two-sum', 7);
        const right = tests.map(t => ({ ok: true, value: JSON.stringify([...t.expected].reverse()) }));
        assert.equal(grade('two-sum', tests, right).passed, tests.length);
        const wrong = right.map((o, i) => (i === 2 ? { ok: true, value: '[0,0]' } : o));
        const r = grade('two-sum', tests, wrong);
        assert.equal(r.passed, tests.length - 1);
        assert.equal(r.firstFail.index, 2);
        assert.equal(r.firstFail.expected, undefined, 'the expected answer is never revealed');
        assert.equal(grade('two-sum', tests, [{ ok: false, error: 'boom' }]).passed, 0);
        assert.ok(matches('float', 2.5000000001, 2.5));
        assert.ok(matches('groups', [['tea', 'eat'], ['bat']], [['bat'], ['eat', 'tea']]));
        assert.ok(!matches('exact', [1, 2], [2, 1]));
    });

    test('Elo: upsets move ratings more, totals are roughly conserved', () => {
        const [a, b] = eloUpdate(1200, 1200, 1);
        assert.ok(a > 1200 && b < 1200 && Math.abs((a - 1200) + (b - 1200)) <= 1);
        const [low] = eloUpdate(1000, 1400, 1);
        const [high] = eloUpdate(1400, 1000, 1);
        assert.ok(low - 1000 > high - 1400);
    });

    test('deciding a winner', () => {
        const player = (id, passed, at, solvedMs = null) => ({ userId: id, best: { passed, at }, solvedMs, forfeited: false });
        const m = (a, b) => ({ mode: 'ranked', players: [a, b] });
        assert.equal(decide(m(player('a', 3, 1), player('b', 15, 9, 5000)), 'time').winner, 'b');
        assert.equal(decide(m(player('a', 15, 1, 4000), player('b', 15, 2, 5000)), 'solved').winner, 'a');
        assert.equal(decide(m(player('a', 7, 5), player('b', 4, 1)), 'time').winner, 'a');
        assert.equal(decide(m(player('a', 7, 5), player('b', 7, 9)), 'time').winner, 'a');
        assert.equal(decide(m(player('a', 0, null), player('b', 0, null)), 'time').result, 'draw');
        const quitter = { ...player('b', 9, 1), forfeited: true };
        assert.equal(decide(m(player('a', 0, null), quitter), 'forfeit').winner, 'a');
    });
});
