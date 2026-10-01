// battles/catalog.js — every battle mode and its content in one place.
//
//   guessr  CodeGuessr: Language Map / Bug Locator / Output Estimate rounds (HP duel)
//   quiz    Skill quiz duel: timed multiple-choice rounds on one skill
//   task    Dev tasks: practical functions, SQL queries, Express-style handlers
//   debug   Debug race: fix the same broken code first
//   css     CSS battle: recreate a picture in HTML/CSS
//   algo    Algorithms: the classic puzzle set (side mode)
const { PROBLEMS } = require('./problems');
const { FUNCTION_TASKS, SQL_TASKS, HANDLER_TASKS, HANDLER_HARNESS } = require('./content/tasks');
const { DEBUG } = require('./content/debug');
const { TARGETS } = require('./content/css');
const { SKILLS } = require('./content/quiz');
const { nativeLanguages, isWide } = require('./native');

const KINDS = {
    guessr: { name: 'CodeGuessr', icon: '🧭', blurb: 'Guess the language, find the bug, estimate the output. Closest guess hits harder.' },
    quiz: { name: 'Skill Quiz', icon: '🧠', blurb: 'Same question, same time. Right and fast wins the round.' },
    task: { name: 'Dev Task', icon: '🛠️', blurb: 'Real-world jobs: format data, write a handler, query a database.' },
    debug: { name: 'Debug Race', icon: '🐛', blurb: 'Same broken code. First to make every test pass wins.' },
    css: { name: 'CSS Battle', icon: '🎨', blurb: 'Recreate the picture in HTML/CSS. Closest pixels win.' },
    algo: { name: 'Algorithms', icon: '🧮', blurb: 'Classic puzzles: arrays, strings, DP. Pass every hidden test first.' }
};
const KIND_IDS = Object.keys(KINDS);
const CODE_KINDS = ['task', 'debug', 'algo'];

// Minutes per battle, by mode and difficulty (round-based modes have their own pacing)
const DURATION_MIN = {
    task: { easy: 10, medium: 15, hard: 20 },
    debug: { easy: 6, medium: 8, hard: 10 },
    algo: { easy: 10, medium: 20, hard: 30 },
    css: { easy: 8, medium: 10, hard: 12 }
};

/* ── code challenges: one shape for algorithms, tasks and debug races ── */
const fnChallenge = (p, kind) => ({
    ...p,
    kind,
    type: 'function',
    languages: ['python', 'javascript'],
    compare: p.compare || 'exact'
});

/** Algorithm puzzles can also be solved in C++ and C (compiled in the browser). */
const algoChallenge = (p) => {
    const ch = fnChallenge(p, 'algo');
    const native = nativeLanguages(p);
    if (!native.length) return ch;
    return {
        ...ch,
        languages: [...ch.languages, ...native],
        fn: { ...p.fn, cpp: p.fn.javascript, c: p.fn.javascript },
        wide: isWide(p)
    };
};

const CODE = new Map();
for (const p of PROBLEMS) CODE.set(`algo:${p.id}`, algoChallenge(p));
for (const t of FUNCTION_TASKS) CODE.set(`task:${t.id}`, fnChallenge(t, 'task'));
for (const t of SQL_TASKS) {
    CODE.set(`task:${t.id}`, {
        ...t,
        kind: 'task',
        type: 'sql',
        languages: ['sql'],
        fn: { sql: 'query' },
        params: [],
        returns: 'rows',
        compare: t.ordered ? 'exact' : 'sorted'
    });
}
for (const t of HANDLER_TASKS) {
    CODE.set(`task:${t.id}`, {
        ...t,
        kind: 'task',
        type: 'handler',
        languages: ['javascript'],
        fn: { javascript: '__ssRun' },
        params: [{ name: 'req', type: 'object' }, { name: 'db', type: 'object' }],
        returns: '{ status, body }',
        harness: HANDLER_HARNESS,
        compare: 'exact',
        starterCode: { javascript: t.starter }
    });
}
for (const d of DEBUG) {
    const base = CODE.get(`task:${d.base}`) || CODE.get(`algo:${d.base}`);
    if (!base) throw new Error(`debug ${d.id}: unknown base ${d.base}`);
    CODE.set(`debug:${d.id}`, {
        ...base,
        id: d.id,
        kind: 'debug',
        difficulty: d.difficulty,
        bugs: d.bugs,
        title: `Fix: ${base.title}`,
        statement: `**This code has ${d.bugs} bug${d.bugs === 1 ? '' : 's'}.** Find and fix ${d.bugs === 1 ? 'it' : 'them'} so every test passes.\n\nWhat it should do: ${base.statement}`,
        starterCode: d.starter,
        // Only the languages the buggy code is written in
        languages: base.languages.filter(l => d.starter[l]),
        tags: ['debugging', ...(base.tags || [])]
    });
}

const codeChallenge = (kind, id) => CODE.get(`${kind}:${id}`) || null;
const codePool = (kind, difficulty) => [...CODE.values()].filter(c => c.kind === kind && (!difficulty || c.difficulty === difficulty));

const cssTarget = (id) => TARGETS.find(t => t.id === id) || null;
const cssPool = (difficulty) => TARGETS.filter(t => !difficulty || t.difficulty === difficulty);

/** What the lobby shows: modes, and the practice list for each */
function catalogSummary(solved = new Set()) {
    const list = (items, kind) => items.map(c => ({ id: c.id, kind, title: c.title, difficulty: c.difficulty, tags: c.tags || [], solved: solved.has(`${kind}:${c.id}`) || (kind === 'algo' && solved.has(c.id)) }));
    return {
        kinds: KINDS,
        skills: SKILLS,
        practice: {
            task: list(codePool('task'), 'task'),
            debug: list(codePool('debug'), 'debug'),
            css: list(TARGETS, 'css'),
            algo: list(codePool('algo'), 'algo')
        },
        durations: DURATION_MIN
    };
}

module.exports = { KINDS, KIND_IDS, CODE_KINDS, DURATION_MIN, codeChallenge, codePool, cssTarget, cssPool, catalogSummary, SKILLS };
