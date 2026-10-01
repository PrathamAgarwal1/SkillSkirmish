// battles/judge.js — builds a match's hidden tests and checks players' outputs against them.
//
// Inputs are generated per match from a seed; expected outputs come from the problems' trusted
// reference solutions and stay on the server. The browser runs a player's code on the inputs and
// sends back the outputs (as JSON text), which are compared here.
const { byId } = require('./problems');

const HIDDEN_RANDOM = 12;
const MAX_OUTPUT_CHARS = 200 * 1024;

/** Small, fast seeded PRNG (mulberry32). */
const rngFrom = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Hidden tests for one match: [{ args, expected }]. Edge cases first, then random ones. */
function buildTests(problemId, seed) {
    const p = byId.get(problemId);
    if (!p) throw new Error(`Unknown problem ${problemId}`);
    const rng = rngFrom(seed);
    const inputs = [...(p.edge || []).map(clone)];
    for (let i = 0; i < HIDDEN_RANDOM; i++) inputs.push(p.generate(rng));
    return inputs.map(args => ({ args, expected: p.solve(...clone(args)) }));
}

/** What players see: the statement, examples, starter code. Never the hidden expected outputs. */
function publicProblem(p) {
    return {
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        tags: p.tags,
        statement: p.statement,
        fn: p.fn,
        params: p.params,
        returns: p.returns,
        examples: p.examples,
        compare: p.compare || 'exact',
        starter: { python: starterPython(p), javascript: starterJs(p) }
    };
}

const PY_TYPES = { int: 'int', float: 'float', bool: 'bool', str: 'str', 'int[]': 'list[int]', 'str[]': 'list[str]', 'int[][]': 'list[list[int]]', 'str[][]': 'list[list[str]]' };
const JS_TYPES = { int: 'number', float: 'number', bool: 'boolean', str: 'string', 'int[]': 'number[]', 'str[]': 'string[]', 'int[][]': 'number[][]', 'str[][]': 'string[][]' };

const starterPython = (p) =>
    `def ${p.fn.python}(${p.params.map(x => `${x.name}: ${PY_TYPES[x.type] || 'object'}`).join(', ')}) -> ${PY_TYPES[p.returns] || 'object'}:\n    # Write your solution here\n    pass\n`;

const starterJs = (p) =>
    `/**\n${p.params.map(x => ` * @param {${JS_TYPES[x.type] || '*'}} ${x.name}`).join('\n')}\n * @return {${JS_TYPES[p.returns] || '*'}}\n */\nfunction ${p.fn.javascript}(${p.params.map(x => x.name).join(', ')}) {\n    // Write your solution here\n}\n`;

/* ── comparing outputs ── */

const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    if (typeof v === 'number' && Object.is(v, -0)) return 0;
    return v;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sortedKey = (arr) => [...arr].map(x => JSON.stringify(x)).sort();

function matches(compare, got, expected) {
    switch (compare) {
        case 'float':
            return typeof got === 'number' && Math.abs(got - expected) <= 1e-6 * Math.max(1, Math.abs(expected));
        case 'sorted':
            return Array.isArray(got) && same(sortedKey(got), sortedKey(expected));
        case 'groups': {
            if (!Array.isArray(got) || !got.every(Array.isArray)) return false;
            const norm = (groups) => groups.map(g => JSON.stringify([...g].sort())).sort();
            return same(norm(got), norm(expected));
        }
        default:
            return same(got, expected);
    }
}

/**
 * Checks a player's outputs. `outputs` is [{ ok, value?: JSON text, error?, ms? }] in test order.
 * Returns { passed, total, results: [{ pass, reason }], firstFail: { index, args, output, error } | null }.
 */
function grade(problemId, tests, outputs) {
    const p = byId.get(problemId);
    const compare = p?.compare || 'exact';
    const results = tests.map((t, i) => {
        const o = Array.isArray(outputs) ? outputs[i] : null;
        if (!o) return { pass: false, reason: 'not run' };
        if (!o.ok) return { pass: false, reason: String(o.error || 'error').slice(0, 300) };
        if (typeof o.value !== 'string' || o.value.length > MAX_OUTPUT_CHARS) return { pass: false, reason: 'invalid output' };
        let got;
        try { got = JSON.parse(o.value); } catch { return { pass: false, reason: 'output is not valid JSON' }; }
        return matches(compare, got, t.expected) ? { pass: true } : { pass: false, reason: 'wrong answer' };
    });
    const passed = results.filter(r => r.pass).length;
    const i = results.findIndex(r => !r.pass);
    const firstFail = i < 0 ? null : {
        index: i,
        args: tests[i].args,
        // The player's own output for the failing input (never the expected one)
        output: typeof outputs?.[i]?.value === 'string' ? outputs[i].value.slice(0, 2000) : null,
        reason: results[i].reason
    };
    return { passed, total: tests.length, results, firstFail };
}

module.exports = { buildTests, publicProblem, grade, matches, rngFrom };
