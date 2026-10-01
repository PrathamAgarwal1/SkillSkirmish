// battles/content/tasks.js — "Dev task" battles: practical, job-like coding instead of puzzles.
//
// Three shapes, all judged like the algorithm problems (browser runs, server compares):
//   function tasks  Python or JavaScript, one function           (languages: ['python', 'javascript'])
//   SQL tasks       a query run against a fresh random database   (languages: ['sql'])
//   handler tasks   an Express-style (req, res, db) handler        (languages: ['javascript'])
const { rand } = require('../problems');

const WORDS = ['react', 'node', 'docker', 'cloud', 'api', 'build', 'deploy', 'test', 'cache', 'queue', 'data', 'stream', 'auth', 'login', 'user'];
const NAMES = ['Ann', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lia', 'Max', 'Nia', 'Omar', 'Pia'];
const CATEGORIES = ['food', 'rent', 'travel', 'fun', 'bills', 'health'];

const money = (cents) => {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
};

const FUNCTION_TASKS = [
    {
        id: 'format-price', title: 'Format a Price', difficulty: 'easy', tags: ['formatting'],
        fn: { python: 'format_price', javascript: 'formatPrice' },
        params: [{ name: 'cents', type: 'int' }], returns: 'str',
        statement: 'Prices are stored in cents. Return them formatted for a receipt: a dollar sign, thousands separators and two decimals. Negative amounts (refunds) get a leading minus: `-$5.00`.',
        examples: [{ args: [123456], expected: '$1,234.56' }, { args: [5], expected: '$0.05' }, { args: [-500], expected: '-$5.00' }],
        edge: [[0], [100], [99], [100000000], [-1]],
        generate: (rng) => [rand.int(rng, -5e6, 5e9)],
        solve: money
    },
    {
        id: 'slugify', title: 'Slugify a Title', difficulty: 'easy', tags: ['strings', 'urls'],
        fn: { python: 'slugify', javascript: 'slugify' },
        params: [{ name: 'title', type: 'str' }], returns: 'str',
        statement: 'Turn a blog post title into a URL slug: lowercase, words made of letters and digits only, joined by single hyphens, with no hyphens at the start or end.',
        examples: [{ args: ['Hello, World!'], expected: 'hello-world' }, { args: ['  10 Tips for   React '], expected: '10-tips-for-react' }],
        edge: [['---'], ['A'], ['C++ & C# are cool!!'], ['Already-a-slug']],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 8) }, () => rand.pick(rng, ['', ' ', '  ', '-', '!', '&']) + rand.pick(rng, [...WORDS, 'React', 'API', 'v2', '2024'])).join(rand.pick(rng, [' ', '  ', ' - ', ', ']))],
        solve: (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-')
    },
    {
        id: 'parse-query', title: 'Parse a Query String', difficulty: 'medium', tags: ['urls', 'parsing'],
        fn: { python: 'parse_query', javascript: 'parseQuery' },
        params: [{ name: 'qs', type: 'str' }], returns: 'object',
        statement: 'Parse a URL query string (without the leading `?`) into an object. Decode `%XX` escapes and `+` as a space. A key that appears more than once maps to a list of its values in order. A key without `=` has the value `""`. Ignore empty pieces (`a=1&&b=2`).',
        examples: [
            { args: ['q=react+hooks&page=2'], expected: { q: 'react hooks', page: '2' } },
            { args: ['tag=a&tag=b&debug'], expected: { tag: ['a', 'b'], debug: '' } }
        ],
        edge: [[''], ['a=1&&b=2'], ['name=J%C3%BCrgen'], ['x=1&x=2&x=3']],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 6) }, () => {
            const key = rand.pick(rng, ['q', 'page', 'tag', 'sort', 'debug', 'city']);
            if (rng() < 0.1) return key;
            const v = rand.pick(rng, ['react', 'new%20york', 'a+b', '42', 'caf%C3%A9', '']);
            return `${key}=${v}`;
        }).join('&')],
        solve: (qs) => {
            const out = {};
            for (const part of qs.split('&')) {
                if (!part) continue;
                const i = part.indexOf('=');
                const dec = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
                const k = dec(i < 0 ? part : part.slice(0, i));
                const v = i < 0 ? '' : dec(part.slice(i + 1));
                if (k in out) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
                else out[k] = v;
            }
            return out;
        }
    },
    {
        id: 'password-rules', title: 'Password Rules', difficulty: 'easy', tags: ['validation'],
        fn: { python: 'failed_rules', javascript: 'failedRules' },
        params: [{ name: 'password', type: 'str' }], returns: 'str[]',
        statement: 'Return the rules a password breaks, in this order: `"length"` (fewer than 8 characters), `"uppercase"` (no A–Z), `"number"` (no 0–9), `"symbol"` (no character that is not a letter or digit). Return `[]` if it passes.',
        examples: [{ args: ['hunter2'], expected: ['length', 'uppercase', 'symbol'] }, { args: ['Correct-Horse-9'], expected: [] }],
        edge: [[''], ['ABCDEFGH'], ['aaaaaaa1!'], ['Ab1!']],
        generate: (rng) => [rand.str(rng, rand.int(rng, 0, 14), rand.pick(rng, ['abc', 'abcXYZ', 'abc123', 'aB1!', 'xyz!?', 'AZ09']))],
        solve: (p) => [
            p.length < 8 && 'length',
            !/[A-Z]/.test(p) && 'uppercase',
            !/[0-9]/.test(p) && 'number',
            !/[^A-Za-z0-9]/.test(p) && 'symbol'
        ].filter(Boolean)
    },
    {
        id: 'group-expenses', title: 'Expense Report', difficulty: 'easy', tags: ['data', 'grouping'],
        fn: { python: 'totals_by_category', javascript: 'totalsByCategory' },
        params: [{ name: 'expenses', type: 'object[]' }], returns: 'object',
        statement: 'Each expense is `{ "category": str, "cents": int }`. Return an object mapping each category to its total in cents.',
        examples: [{ args: [[{ category: 'food', cents: 1250 }, { category: 'rent', cents: 90000 }, { category: 'food', cents: 800 }]], expected: { food: 2050, rent: 90000 } }],
        edge: [[[]], [[{ category: 'fun', cents: 0 }]]],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 60) }, () => ({ category: rand.pick(rng, CATEGORIES), cents: rand.int(rng, 1, 50000) }))],
        solve: (ex) => ex.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + e.cents }), {})
    },
    {
        id: 'paginate', title: 'Paginate Results', difficulty: 'easy', tags: ['apis'],
        fn: { python: 'paginate', javascript: 'paginate' },
        params: [{ name: 'items', type: 'int[]' }, { name: 'page', type: 'int' }, { name: 'per_page', type: 'int' }], returns: 'object',
        statement: 'Return `{ "items": [...], "page": page, "total_pages": n, "has_next": bool }` for a 1-based `page`. `total_pages` is at least 1. A page past the end returns an empty `items` list.',
        examples: [
            { args: [[1, 2, 3, 4, 5], 2, 2], expected: { items: [3, 4], page: 2, total_pages: 3, has_next: true } },
            { args: [[], 1, 10], expected: { items: [], page: 1, total_pages: 1, has_next: false } }
        ],
        edge: [[[1, 2, 3], 5, 2], [[1], 1, 1], [[1, 2, 3, 4], 2, 2]],
        generate: (rng) => {
            const items = Array.from({ length: rand.int(rng, 0, 120) }, (_, i) => i + 1);
            const per = rand.int(rng, 1, 25);
            return [items, rand.int(rng, 1, Math.max(1, Math.ceil(items.length / per) + 1)), per];
        },
        solve: (items, page, per) => {
            const total = Math.max(1, Math.ceil(items.length / per));
            return { items: items.slice((page - 1) * per, page * per), page, total_pages: total, has_next: page < total };
        }
    },
    {
        id: 'mask-card', title: 'Mask a Card Number', difficulty: 'easy', tags: ['strings', 'security'],
        fn: { python: 'mask_card', javascript: 'maskCard' },
        params: [{ name: 'number', type: 'str' }], returns: 'str',
        statement: 'A card number may contain spaces or dashes. Keep only the digits, replace every digit except the last four with `*`, then group into blocks of four from the left, separated by single spaces.',
        examples: [{ args: ['4111 1111 1111 1234'], expected: '**** **** **** 1234' }, { args: ['3782-822463-10005'], expected: '**** **** ***0 005' }],
        edge: [['1234'], ['12345'], ['4111111111111111']],
        generate: (rng) => {
            const digits = rand.str(rng, rand.int(rng, 12, 19), '0123456789');
            return [digits.replace(/(\d{4})(?=\d)/g, rand.pick(rng, ['$1 ', '$1-', '$1']))];
        },
        solve: (n) => {
            const d = n.replace(/\D/g, '');
            return ('*'.repeat(Math.max(0, d.length - 4)) + d.slice(-4)).replace(/(.{4})(?=.)/g, '$1 ');
        }
    },
    {
        id: 'parse-duration', title: 'Parse a Duration', difficulty: 'medium', tags: ['parsing'],
        fn: { python: 'to_seconds', javascript: 'toSeconds' },
        params: [{ name: 'text', type: 'str' }], returns: 'int',
        statement: 'Convert a duration like `"1h30m"` or `"2d 4h 5s"` to seconds. Units: `d`, `h`, `m`, `s`; each part is a whole number followed by a unit; parts may be in any order and separated by spaces. A unit can appear more than once (add them up).',
        examples: [{ args: ['1h30m'], expected: 5400 }, { args: ['2d 4h 5s'], expected: 187205 }],
        edge: [['0s'], ['90m'], ['1m1m'], ['10s 1d']],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 4) }, () => `${rand.int(rng, 0, 99)}${rand.pick(rng, ['d', 'h', 'm', 's'])}`).join(rand.pick(rng, ['', ' ']))],
        solve: (t) => [...t.matchAll(/(\d+)([dhms])/g)].reduce((s, [, n, u]) => s + Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[u], 0)
    },
    {
        id: 'compare-versions', title: 'Compare Versions', difficulty: 'medium', tags: ['semver'],
        fn: { python: 'compare_versions', javascript: 'compareVersions' },
        params: [{ name: 'a', type: 'str' }, { name: 'b', type: 'str' }], returns: 'int',
        statement: 'Compare two version strings like `"1.10.2"`. Return `-1` if a is older, `1` if newer, `0` if equal. Compare part by part as numbers; missing parts count as 0 (`"1.2"` equals `"1.2.0"`).',
        examples: [{ args: ['1.2.10', '1.2.9'], expected: 1 }, { args: ['1.2', '1.2.0'], expected: 0 }, { args: ['0.9', '1.0'], expected: -1 }],
        edge: [['1', '1.0.0.0'], ['2.0', '10.0'], ['1.01', '1.1']],
        generate: (rng) => {
            const v = () => Array.from({ length: rand.int(rng, 1, 4) }, () => rand.int(rng, 0, 12)).join('.');
            const a = v();
            return [a, rng() < 0.25 ? a : v()];
        },
        solve: (a, b) => {
            const x = a.split('.').map(Number);
            const y = b.split('.').map(Number);
            for (let i = 0; i < Math.max(x.length, y.length); i++) {
                const d = (x[i] || 0) - (y[i] || 0);
                if (d) return d > 0 ? 1 : -1;
            }
            return 0;
        }
    },
    {
        id: 'time-ago', title: 'Time Ago', difficulty: 'medium', tags: ['formatting', 'dates'],
        fn: { python: 'time_ago', javascript: 'timeAgo' },
        params: [{ name: 'seconds', type: 'int' }], returns: 'str',
        statement: 'Turn "seconds since it happened" into a label. Under 60 s: `"just now"`. Under 1 hour: minutes. Under 1 day: hours. Under 7 days: days. Otherwise weeks. Round down, and use the singular for 1: `"1 minute ago"`, `"5 hours ago"`, `"2 weeks ago"`.',
        examples: [{ args: [30], expected: 'just now' }, { args: [3600], expected: '1 hour ago' }, { args: [200000], expected: '2 days ago' }],
        edge: [[0], [59], [60], [86399], [604800]],
        generate: (rng) => [rand.int(rng, 0, rand.pick(rng, [120, 7200, 200000, 5e6]))],
        solve: (s) => {
            if (s < 60) return 'just now';
            const [n, unit] = s < 3600 ? [Math.floor(s / 60), 'minute'] : s < 86400 ? [Math.floor(s / 3600), 'hour'] : s < 604800 ? [Math.floor(s / 86400), 'day'] : [Math.floor(s / 604800), 'week'];
            return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        }
    },
    {
        id: 'flatten-config', title: 'Flatten a Config', difficulty: 'medium', tags: ['objects', 'recursion'],
        fn: { python: 'flatten', javascript: 'flatten' },
        params: [{ name: 'config', type: 'object' }], returns: 'object',
        statement: 'Flatten nested objects into dotted keys: `{"db": {"host": "x"}}` → `{"db.host": "x"}`. Lists and other values are kept as they are. An empty nested object produces no keys.',
        examples: [{ args: [{ db: { host: 'localhost', port: 5432 }, debug: true }], expected: { 'db.host': 'localhost', 'db.port': 5432, debug: true } }],
        edge: [[{}], [{ a: {} }], [{ a: [1, { b: 2 }] }]],
        generate: (rng) => {
            const build = (depth) => Object.fromEntries(Array.from({ length: rand.int(rng, 1, 4) }, () => [
                rand.pick(rng, ['db', 'host', 'port', 'auth', 'mode', 'tags', 'cache']),
                depth > 0 && rng() < 0.45 ? build(depth - 1) : rand.pick(rng, [1, 'x', true, null, [1, 2], 'prod'])
            ]));
            return [build(3)];
        },
        solve: (obj) => {
            const out = {};
            const walk = (o, prefix) => {
                for (const [k, v] of Object.entries(o)) {
                    const key = prefix ? `${prefix}.${k}` : k;
                    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
                    else out[key] = v;
                }
            };
            walk(obj, '');
            return out;
        }
    },
    {
        id: 'top-words', title: 'Top Words', difficulty: 'medium', tags: ['text', 'counting'],
        fn: { python: 'top_words', javascript: 'topWords' },
        params: [{ name: 'text', type: 'str' }, { name: 'n', type: 'int' }], returns: 'list',
        statement: 'Return the `n` most common words as `[word, count]` pairs, most common first, ties broken alphabetically. Words are runs of letters a–z (case-insensitive, so "React" and "react" are the same word).',
        examples: [{ args: ['The cat and the hat. THE end!', 2], expected: [['the', 3], ['and', 1]] }],
        edge: [['', 3], ['a A a b', 5]],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 80) }, () => {
            const w = rand.pick(rng, WORDS.slice(0, 8));
            return rng() < 0.2 ? w.toUpperCase() : w;
        }).join(rand.pick(rng, [' ', ', ', '. '])), rand.int(rng, 1, 6)],
        solve: (text, n) => {
            const counts = new Map();
            for (const w of text.toLowerCase().match(/[a-z]+/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
        }
    }
];

/* ── SQL tasks: the player writes a query; every test runs it against a different random database ── */

const SQL_TASKS = [
    {
        id: 'sql-top-customers', title: 'Top Customers', difficulty: 'easy', tags: ['sql', 'joins', 'aggregation'],
        statement: 'Return the 3 customers who spent the most: columns `name` and `spent` (sum of their order totals). Highest first; break ties by name A→Z. Customers with no orders don\'t count.',
        schema: 'CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total INTEGER);',
        seed: (rng) => {
            const n = rand.int(rng, 3, 10);
            const customers = Array.from({ length: n }, (_, i) => `(${i + 1}, '${NAMES[i]}')`);
            const orders = Array.from({ length: rand.int(rng, 2, 40) }, (_, i) => `(${i + 1}, ${rand.int(rng, 1, n)}, ${rand.int(rng, 1, 30) * 10})`);
            return `INSERT INTO customers VALUES ${customers.join(', ')};\nINSERT INTO orders VALUES ${orders.join(', ')};`;
        },
        reference: 'SELECT c.name, SUM(o.total) AS spent FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name ORDER BY spent DESC, c.name ASC LIMIT 3',
        ordered: true
    },
    {
        id: 'sql-monthly-revenue', title: 'Monthly Revenue', difficulty: 'medium', tags: ['sql', 'dates', 'aggregation'],
        statement: 'For each month with orders, return `month` (as `"YYYY-MM"`) and `revenue` (sum of `total`), oldest month first. `created_at` is a `"YYYY-MM-DD"` string.',
        schema: 'CREATE TABLE orders (id INTEGER PRIMARY KEY, created_at TEXT, total INTEGER);',
        seed: (rng) => {
            const rows = Array.from({ length: rand.int(rng, 1, 50) }, (_, i) => {
                const m = String(rand.int(rng, 1, 12)).padStart(2, '0');
                const d = String(rand.int(rng, 1, 28)).padStart(2, '0');
                return `(${i + 1}, '${rand.pick(rng, ['2023', '2024'])}-${m}-${d}', ${rand.int(rng, 5, 500)})`;
            });
            return `INSERT INTO orders VALUES ${rows.join(', ')};`;
        },
        reference: "SELECT substr(created_at, 1, 7) AS month, SUM(total) AS revenue FROM orders GROUP BY month ORDER BY month",
        ordered: true
    },
    {
        id: 'sql-no-orders', title: 'Users Without Orders', difficulty: 'easy', tags: ['sql', 'joins'],
        statement: 'Return the `email` of every user who has never placed an order, sorted A→Z.',
        schema: 'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, total INTEGER);',
        seed: (rng) => {
            const n = rand.int(rng, 2, 14);
            const users = Array.from({ length: n }, (_, i) => `(${i + 1}, '${NAMES[i].toLowerCase()}@mail.com')`);
            const orders = Array.from({ length: rand.int(rng, 0, 20) }, (_, i) => `(${i + 1}, ${rand.int(rng, 1, n)}, ${rand.int(rng, 1, 99)})`);
            return `INSERT INTO users VALUES ${users.join(', ')};${orders.length ? `\nINSERT INTO orders VALUES ${orders.join(', ')};` : ''}`;
        },
        reference: 'SELECT u.email FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL ORDER BY u.email',
        ordered: true
    },
    {
        id: 'sql-top-earner', title: 'Top Earner per Department', difficulty: 'hard', tags: ['sql', 'window functions', 'subqueries'],
        statement: 'For each department, return `dept` and the `name` of its highest-paid employee. If two people tie, pick the one with the smaller `id`. Sort by department.',
        schema: 'CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER);',
        seed: (rng) => {
            const rows = Array.from({ length: rand.int(rng, 1, 20) }, (_, i) => `(${i + 1}, '${NAMES[i % NAMES.length]}${i}', '${rand.pick(rng, ['eng', 'sales', 'ops', 'design'])}', ${rand.int(rng, 4, 12) * 10000})`);
            return `INSERT INTO employees VALUES ${rows.join(', ')};`;
        },
        reference: 'SELECT dept, name FROM (SELECT dept, name, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC, id ASC) AS rn FROM employees) WHERE rn = 1 ORDER BY dept',
        ordered: true
    }
];

/* ── handler tasks: Express-style (req, res, db) functions, called with a mock res ── */

// Appended to the player's code (and the reference) in the browser: calls `handler` with a fake
// response object and returns { status, body } for comparison.
const HANDLER_HARNESS = `
function __ssRun(req, db) {
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  if (typeof handler !== 'function') throw new Error('Define a function named handler(req, res, db)');
  return Promise.resolve(handler(req, res, db)).then(() => ({ status: res.statusCode, body: res.body === undefined ? null : res.body }));
}`;

const HANDLER_TASKS = [
    {
        id: 'handler-get-user', title: 'GET /users/:id', difficulty: 'easy', tags: ['express', 'rest'],
        statement: 'Write `handler(req, res, db)` for `GET /users/:id`. `req.params.id` is a string; `db.users` is an array of `{ id, name }`.\n\n- If the id isn\'t a positive whole number → `400 { "error": "Invalid id" }`\n- If no user has that id → `404 { "error": "User not found" }`\n- Otherwise → `200` with the user object.',
        starter: "function handler(req, res, db) {\n  // res.status(404).json({ error: 'User not found' })\n}\n",
        examples: [
            { args: [{ params: { id: '2' } }, { users: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }] }], expected: { status: 200, body: { id: 2, name: 'Ben' } } },
            { args: [{ params: { id: 'abc' } }, { users: [] }], expected: { status: 400, body: { error: 'Invalid id' } } }
        ],
        edge: [[{ params: { id: '0' } }, { users: [{ id: 0, name: 'Zero' }] }], [{ params: { id: '7' } }, { users: [] }], [{ params: { id: '1.5' } }, { users: [{ id: 1, name: 'A' }] }]],
        generate: (rng) => {
            const users = Array.from({ length: rand.int(rng, 0, 8) }, (_, i) => ({ id: i * rand.int(rng, 1, 3) + 1, name: NAMES[i] }));
            const id = rand.pick(rng, [String(rand.int(rng, 1, 20)), String(users[0]?.id ?? 1), '-3', 'x9', '']);
            return [{ params: { id } }, { users }];
        },
        solve: (req, db) => {
            const id = req.params.id;
            if (!/^[1-9]\d*$/.test(id)) return { status: 400, body: { error: 'Invalid id' } };
            const user = db.users.find(u => u.id === Number(id));
            return user ? { status: 200, body: user } : { status: 404, body: { error: 'User not found' } };
        }
    },
    {
        id: 'handler-create-todo', title: 'POST /todos', difficulty: 'medium', tags: ['express', 'validation'],
        statement: 'Write `handler(req, res, db)` for `POST /todos`. `req.body` should look like `{ title, done? }`; `db.nextId` is the id to use.\n\n- `title` must be a string that isn\'t empty after trimming → else `400 { "error": "Title is required" }`\n- trimmed title over 100 characters → `400 { "error": "Title is too long" }`\n- `done`, if given, must be a boolean → else `400 { "error": "done must be true or false" }`\n- Otherwise → `201 { "id": db.nextId, "title": <trimmed>, "done": <done or false> }`',
        starter: 'function handler(req, res, db) {\n  const { title, done } = req.body || {};\n\n}\n',
        examples: [
            { args: [{ body: { title: '  Buy milk ' } }, { nextId: 7 }], expected: { status: 201, body: { id: 7, title: 'Buy milk', done: false } } },
            { args: [{ body: { title: '   ' } }, { nextId: 1 }], expected: { status: 400, body: { error: 'Title is required' } } }
        ],
        edge: [[{}, { nextId: 1 }], [{ body: { title: 'x'.repeat(101) } }, { nextId: 2 }], [{ body: { title: 'ok', done: 'yes' } }, { nextId: 3 }], [{ body: { title: 42 } }, { nextId: 4 }]],
        generate: (rng) => {
            const title = rand.pick(rng, ['  Ship it ', 'Write tests', '', '   ', 'y'.repeat(rand.int(rng, 95, 105)), 7, null]);
            const body = { title };
            if (rng() < 0.5) body.done = rand.pick(rng, [true, false, 'true', 1]);
            return [{ body }, { nextId: rand.int(rng, 1, 999) }];
        },
        solve: (req, db) => {
            const { title, done } = req.body || {};
            if (typeof title !== 'string' || !title.trim()) return { status: 400, body: { error: 'Title is required' } };
            if (title.trim().length > 100) return { status: 400, body: { error: 'Title is too long' } };
            if (done !== undefined && typeof done !== 'boolean') return { status: 400, body: { error: 'done must be true or false' } };
            return { status: 201, body: { id: db.nextId, title: title.trim(), done: done ?? false } };
        }
    },
    {
        id: 'handler-list-products', title: 'GET /products?page&limit&sort', difficulty: 'hard', tags: ['express', 'pagination', 'sorting'],
        statement: 'Write `handler(req, res, db)` for a product list. Query values (`req.query`) are strings and all optional; `db.products` is an array of `{ id, name, price }`.\n\n- `page`: whole number ≥ 1, default 1. `limit`: whole number 1–50, default 10. Invalid → `400 { "error": "Invalid page" }` / `{ "error": "Invalid limit" }` (check page first).\n- `sort`: `"price"` (low→high), `"-price"` (high→low) or `"name"` (A→Z); default keeps the original order; anything else → `400 { "error": "Invalid sort" }`. Ties keep their original order.\n- Respond `200 { "items": [...], "total": <all products>, "page": page }`.',
        starter: 'function handler(req, res, db) {\n  const { page = "1", limit = "10", sort } = req.query;\n\n}\n',
        examples: [
            { args: [{ query: { sort: '-price', limit: '2' } }, { products: [{ id: 1, name: 'Pen', price: 2 }, { id: 2, name: 'Bag', price: 30 }, { id: 3, name: 'Cup', price: 8 }] }], expected: { status: 200, body: { items: [{ id: 2, name: 'Bag', price: 30 }, { id: 3, name: 'Cup', price: 8 }], total: 3, page: 1 } } },
            { args: [{ query: { page: '0' } }, { products: [] }], expected: { status: 400, body: { error: 'Invalid page' } } }
        ],
        edge: [[{ query: {} }, { products: [] }], [{ query: { limit: '51' } }, { products: [] }], [{ query: { sort: 'price;drop' } }, { products: [] }], [{ query: { page: '3', limit: '1', sort: 'name' } }, { products: [{ id: 1, name: 'b', price: 1 }, { id: 2, name: 'a', price: 1 }, { id: 3, name: 'c', price: 1 }] }]],
        generate: (rng) => {
            const products = Array.from({ length: rand.int(rng, 0, 30) }, (_, i) => ({ id: i + 1, name: rand.pick(rng, WORDS), price: rand.int(rng, 1, 60) }));
            const query = {};
            if (rng() < 0.7) query.page = rand.pick(rng, ['1', '2', '3', String(rand.int(rng, 1, 6)), '0', 'x']);
            if (rng() < 0.7) query.limit = rand.pick(rng, ['5', '10', '50', String(rand.int(rng, 1, 12)), '0', '99']);
            if (rng() < 0.7) query.sort = rand.pick(rng, ['price', '-price', 'name', 'bogus']);
            return [{ query }, { products }];
        },
        solve: (req, db) => {
            const q = req.query || {};
            const whole = (s, lo, hi) => /^\d+$/.test(s) && Number(s) >= lo && Number(s) <= hi;
            const page = q.page ?? '1';
            const limit = q.limit ?? '10';
            if (!whole(page, 1, Infinity)) return { status: 400, body: { error: 'Invalid page' } };
            if (!whole(limit, 1, 50)) return { status: 400, body: { error: 'Invalid limit' } };
            const sorters = { price: (a, b) => a.price - b.price, '-price': (a, b) => b.price - a.price, name: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) };
            if (q.sort !== undefined && !sorters[q.sort]) return { status: 400, body: { error: 'Invalid sort' } };
            const list = q.sort ? [...db.products].sort(sorters[q.sort]) : db.products;
            const p = Number(page);
            const l = Number(limit);
            return { status: 200, body: { items: list.slice((p - 1) * l, p * l), total: db.products.length, page: p } };
        }
    }
];

module.exports = { FUNCTION_TASKS, SQL_TASKS, HANDLER_TASKS, HANDLER_HARNESS };
