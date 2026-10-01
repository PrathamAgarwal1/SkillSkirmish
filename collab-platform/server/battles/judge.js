// battles/judge.js — builds a match's hidden tests and checks players' outputs against them.
//
// Inputs are generated per match from a seed; expected outputs come from trusted reference solutions
// (or, for SQL, the reference query run on the server with sql.js) and stay on the server. The
// browser runs a player's code on the inputs and sends back the outputs, which are compared here.
const HIDDEN_RANDOM = 12;
const SQL_TESTS = 8;
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

/* ── SQL (sql.js: SQLite compiled to WebAssembly) ── */
let sqlPromise = null;
const sqlJs = () => (sqlPromise ??= require('sql.js')());

/** Runs `schema + seed`, then `query`; returns the last result set's rows (arrays of values). */
async function runSql(schema, seed, query) {
    const SQL = await sqlJs();
    const db = new SQL.Database();
    try {
        db.run(`${schema}\n${seed}`);
        const results = db.exec(query);
        return results.length ? results[results.length - 1].values : [];
    } finally {
        db.close();
    }
}

/** The tables of a SQL example database, for showing in the statement: [{ name, columns, rows }] */
async function sqlTables(schema, seed) {
    const SQL = await sqlJs();
    const db = new SQL.Database();
    try {
        db.run(`${schema}\n${seed}`);
        const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid")[0]?.values.map(r => r[0]) || [];
        return names.map(name => {
            const r = db.exec(`SELECT * FROM ${name}`)[0];
            return { name, columns: r?.columns || [], rows: r?.values || [] };
        });
    } finally {
        db.close();
    }
}

/** Hidden tests for one match: [{ args, expected }] */
async function buildTests(ch, seed) {
    const rng = rngFrom(seed);
    if (ch.type === 'sql') {
        const tests = [];
        for (let i = 0; i < SQL_TESTS; i++) {
            const data = ch.seed(rng);
            tests.push({ args: [data], expected: await runSql(ch.schema, data, ch.reference) });
        }
        return tests;
    }
    const inputs = [...(ch.edge || []).map(clone)];
    for (let i = 0; i < HIDDEN_RANDOM; i++) inputs.push(ch.generate(rng));
    return inputs.map(args => ({ args, expected: ch.solve(...clone(args)) }));
}

/* ── what players see ── */
const PY_TYPES = { int: 'int', float: 'float', bool: 'bool', str: 'str', 'int[]': 'list[int]', 'str[]': 'list[str]', 'int[][]': 'list[list[int]]', 'str[][]': 'list[list[str]]', object: 'dict', 'object[]': 'list[dict]', list: 'list' };
const JS_TYPES = { int: 'number', float: 'number', bool: 'boolean', str: 'string', 'int[]': 'number[]', 'str[]': 'string[]', 'int[][]': 'number[][]', 'str[][]': 'string[][]', object: 'object', 'object[]': 'object[]', list: 'Array' };

const starterPython = (p) =>
    `def ${p.fn.python}(${p.params.map(x => `${x.name}: ${PY_TYPES[x.type] || 'object'}`).join(', ')}) -> ${PY_TYPES[p.returns] || 'object'}:\n    # Write your solution here\n    pass\n`;
const starterJs = (p) =>
    `/**\n${p.params.map(x => ` * @param {${JS_TYPES[x.type] || '*'}} ${x.name}`).join('\n')}\n * @return {${JS_TYPES[p.returns] || '*'}}\n */\nfunction ${p.fn.javascript}(${p.params.map(x => x.name).join(', ')}) {\n    // Write your solution here\n}\n`;

const exampleCache = new Map();

/** The problem as players see it: statement, examples, starter code. Never hidden expected outputs. */
async function publicChallenge(ch) {
    const base = {
        id: ch.id,
        kind: ch.kind,
        type: ch.type,
        title: ch.title,
        difficulty: ch.difficulty,
        tags: ch.tags || [],
        statement: ch.statement,
        languages: ch.languages,
        fn: ch.fn,
        params: ch.params,
        returns: ch.returns,
        compare: ch.compare || 'exact',
        bugs: ch.bugs
    };
    if (ch.type === 'sql') {
        if (!exampleCache.has(ch.id)) {
            const data = ch.seed(rngFrom(1));
            exampleCache.set(ch.id, {
                tables: await sqlTables(ch.schema, data),
                expected: await runSql(ch.schema, data, ch.reference),
                data
            });
        }
        const ex = exampleCache.get(ch.id);
        return {
            ...base,
            schema: ch.schema,
            sample: { tables: ex.tables },
            examples: [{ args: [ex.data], expected: ex.expected }],
            starter: { sql: '-- Your query (SQLite)\nSELECT\n' }
        };
    }
    return {
        ...base,
        examples: ch.examples,
        harness: ch.harness,
        starter: ch.starterCode || { python: starterPython(ch), javascript: starterJs(ch) }
    };
}

/* ── comparing outputs ── */
const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    if (typeof v === 'number' && Object.is(v, -0)) return 0;
    return v;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sortedKey = (arr) => [...arr].map(x => JSON.stringify(canonical(x))).sort();

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
 * Returns { passed, total, results: [{ pass, reason }], firstFail: { index, args, output, reason } | null }.
 */
function grade(ch, tests, outputs) {
    const compare = ch?.compare || 'exact';
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
        // SQL inputs are whole databases: show which test, not the data dump
        args: ch?.type === 'sql' ? null : tests[i].args,
        output: typeof outputs?.[i]?.value === 'string' ? outputs[i].value.slice(0, 2000) : null,
        reason: results[i].reason
    };
    return { passed, total: tests.length, results, firstFail };
}

module.exports = { buildTests, publicChallenge, grade, matches, rngFrom, runSql, sqlTables };
