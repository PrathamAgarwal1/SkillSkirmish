// questions/templates.js — question generators that never run out (no AI, no cost).
//
// Each template makes a new multiple-choice question from random values, with the answer computed
// here and wrong options built from typical mistakes (off-by-one, wrong operator, wrong method...).
const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const js = (v) => JSON.stringify(v).replace(/,/g, ', ');
const py = (v) => (Array.isArray(v) ? `[${v.map(py).join(', ')}]` : typeof v === 'string' ? `'${v}'` : String(v));

const TEMPLATES = [
    {
        id: 'js-filter-map', skill: 'JavaScript', difficulty: 'easy',
        make: (rng) => {
            const nums = Array.from({ length: 5 }, () => int(rng, 1, 9));
            const k = int(rng, 2, 6);
            const m = int(rng, 2, 4);
            const answer = nums.filter(x => x > k).map(x => x * m);
            return {
                text: 'What does this log?',
                code: `const nums = ${js(nums)};\nconsole.log(nums.filter(x => x > ${k}).map(x => x * ${m}));`,
                answer: js(answer),
                distractors: [js(nums.map(x => x * m)), js(nums.filter(x => x >= k).map(x => x * m)), js(nums.filter(x => x > k))],
                explanation: `filter keeps values greater than ${k}, then map multiplies each by ${m}.`
            };
        }
    },
    {
        id: 'js-slice', skill: 'JavaScript', difficulty: 'easy',
        make: (rng) => {
            const word = pick(rng, ['skirmish', 'javascript', 'developer', 'function', 'promises', 'callback']);
            const i = int(rng, 1, 3);
            const j = int(rng, i + 2, word.length - 1);
            return {
                text: 'What does this log?',
                code: `console.log('${word}'.slice(${i}, ${j}));`,
                answer: `"${word.slice(i, j)}"`,
                distractors: [`"${word.slice(i, j + 1)}"`, `"${word.slice(i - 1, j)}"`, `"${word.substr(i, j)}"`],
                explanation: `slice(start, end) includes index ${i} and stops before index ${j}.`
            };
        }
    },
    {
        id: 'js-loop-sum', skill: 'JavaScript', difficulty: 'medium',
        make: (rng) => {
            const a = int(rng, 0, 4);
            const b = a + int(rng, 5, 14);
            const c = int(rng, 2, 3);
            let s = 0;
            for (let i = a; i < b; i += c) s += i;
            let incl = 0;
            for (let i = a; i <= b; i += c) incl += i;
            let ones = 0;
            for (let i = a; i < b; i++) ones += i;
            return {
                text: 'What does this log?',
                code: `let s = 0;\nfor (let i = ${a}; i < ${b}; i += ${c}) {\n  s += i;\n}\nconsole.log(s);`,
                answer: String(s),
                distractors: [String(incl === s ? s + b : incl), String(ones), String(s + c)],
                explanation: `i takes the values ${Array.from({ length: Math.ceil((b - a) / c) }, (_, n) => a + n * c).join(', ')} (it stops before ${b}).`
            };
        }
    },
    {
        id: 'js-spread-merge', skill: 'JavaScript', difficulty: 'medium',
        make: (rng) => {
            const x = int(rng, 1, 9);
            const y = int(rng, 10, 19);
            const z = int(rng, 20, 29);
            const key = pick(rng, ['b', 'c', 'a']);
            const merged = { ...{ a: x, b: y }, ...{ b: z, c: x + z } };
            return {
                text: `What is \`merged.${key}\`?`,
                code: `const first = { a: ${x}, b: ${y} };\nconst second = { b: ${z}, c: ${x + z} };\nconst merged = { ...first, ...second };`,
                answer: String(merged[key]),
                distractors: [...new Set([String(y), String(z), String(x), 'undefined', String(x + z)].filter(v => v !== String(merged[key])))].slice(0, 3),
                explanation: 'With object spread, later properties overwrite earlier ones with the same key.'
            };
        }
    },
    {
        id: 'js-nullish', skill: 'JavaScript', difficulty: 'medium',
        make: (rng) => {
            const [label, value] = pick(rng, [['0', 0], ['""', ''], ['false', false], ['null', null], ['undefined', undefined]]);
            const fallback = int(rng, 1, 99);
            const op = pick(rng, ['??', '||']);
            const result = op === '??' ? (value ?? fallback) : (value || fallback);
            const show = (v) => (v === '' ? '""' : String(v));
            return {
                text: 'What does this log?',
                code: `const value = ${label};\nconsole.log(value ${op} ${fallback});`,
                answer: show(result),
                distractors: [...new Set([show(fallback), show(value), 'undefined', 'null', '0'].filter(v => v !== show(result)))].slice(0, 3),
                explanation: '`??` only falls back for null/undefined; `||` falls back for any falsy value (0, "", false, null, undefined).'
            };
        }
    },
    {
        id: 'js-reduce', skill: 'JavaScript', difficulty: 'hard',
        make: (rng) => {
            const nums = Array.from({ length: 4 }, () => int(rng, 1, 6));
            const k = int(rng, 2, 3);
            const start = int(rng, 0, 10);
            const answer = nums.reduce((acc, x) => acc + x * k, start);
            return {
                text: 'What does this log?',
                code: `const total = ${js(nums)}.reduce((acc, x) => acc + x * ${k}, ${start});\nconsole.log(total);`,
                answer: String(answer),
                distractors: [String(answer - start), String(nums.reduce((a, x) => a + x, start) * k), String(answer + k)],
                explanation: `Start at ${start}, then add each number × ${k}.`
            };
        }
    },
    {
        id: 'py-slice', skill: 'Python', difficulty: 'easy',
        make: (rng) => {
            const nums = Array.from({ length: 7 }, (_, i) => i * int(rng, 1, 3) + int(rng, 0, 2));
            const a = int(rng, 0, 2);
            const b = int(rng, 4, 7);
            const step = pick(rng, [1, 2]);
            const take = (s, e, st) => nums.filter((_, i) => i >= s && i < e && (i - s) % st === 0);
            const answer = take(a, b, step);
            return {
                text: 'What does this print?',
                code: `nums = ${py(nums)}\nprint(nums[${a}:${b}${step > 1 ? `:${step}` : ''}])`,
                answer: py(answer),
                distractors: [py(take(a, b + 1, step)), py(take(a + 1, b, step)), py(take(a, b, step === 1 ? 2 : 1))],
                explanation: `Slicing [${a}:${b}${step > 1 ? `:${step}` : ''}] starts at index ${a} and stops before index ${b}.`
            };
        }
    },
    {
        id: 'py-floor-mod', skill: 'Python', difficulty: 'easy',
        make: (rng) => {
            const a = int(rng, 10, 99) * (rng() < 0.3 ? -1 : 1);
            const b = int(rng, 3, 9);
            const fl = Math.floor(a / b);
            const mod = ((a % b) + b) % b;
            return {
                text: 'What does this print?',
                code: `print(${a} // ${b}, ${a} % ${b})`,
                answer: `${fl} ${mod}`,
                distractors: [`${Math.trunc(a / b)} ${a % b}`, `${(a / b).toFixed(1)} ${mod}`, `${fl + 1} ${mod}`, `${fl} ${(b - mod) % b}`, `${fl - 1} ${mod}`],
                explanation: '`//` rounds down (towards −∞) and `%` takes the sign of the divisor in Python.'
            };
        }
    },
    {
        id: 'py-comprehension', skill: 'Python', difficulty: 'medium',
        make: (rng) => {
            const n = int(rng, 6, 12);
            const k = int(rng, 2, 3);
            let s = 0;
            for (let x = 0; x < n; x++) if (x % k === 0) s += x * x;
            let incl = 0;
            for (let x = 0; x <= n; x++) if (x % k === 0) incl += x * x;
            let all = 0;
            for (let x = 0; x < n; x++) all += x * x;
            return {
                text: 'What does this print?',
                code: `print(sum(x * x for x in range(${n}) if x % ${k} == 0))`,
                answer: String(s),
                distractors: [...new Set([String(incl), String(all), String(s / 2 | 0), String(s + n)].filter(v => v !== String(s)))].slice(0, 3),
                explanation: `range(${n}) stops at ${n - 1}; only multiples of ${k} are squared and added.`
            };
        }
    },
    {
        id: 'py-dict-get', skill: 'Python', difficulty: 'easy',
        make: (rng) => {
            const keys = ['a', 'b', 'c'];
            const d = Object.fromEntries(keys.map(k => [k, int(rng, 1, 9)]));
            const key = pick(rng, ['a', 'b', 'x', 'y']);
            const def = int(rng, 0, 9);
            const answer = key in d ? d[key] : def;
            return {
                text: 'What does this print?',
                code: `counts = {${keys.map(k => `'${k}': ${d[k]}`).join(', ')}}\nprint(counts.get('${key}', ${def}))`,
                answer: String(answer),
                distractors: [...new Set(['None', 'KeyError', String(def), String(d.a)].filter(v => v !== String(answer)))].slice(0, 3),
                explanation: '`dict.get(key, default)` returns the default when the key is missing, instead of raising KeyError.'
            };
        }
    },
    {
        id: 'py-join-reverse', skill: 'Python', difficulty: 'medium',
        make: (rng) => {
            const words = ['api', 'db', 'cache', 'queue', 'auth'].sort(() => rng() - 0.5).slice(0, 3);
            const sep = pick(rng, ['-', '/', '.']);
            return {
                text: 'What does this print?',
                code: `parts = ${py(words)}\nprint('${sep}'.join(parts[::-1]))`,
                answer: words.slice().reverse().join(sep),
                distractors: [words.join(sep), words.slice().reverse().join(''), `${sep}${words.slice().reverse().join(sep)}`],
                explanation: '`[::-1]` reverses the list, then join puts the separator between items.'
            };
        }
    },
    {
        id: 'sql-count-where', skill: 'SQL', difficulty: 'medium',
        make: (rng) => {
            const rows = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, total: int(rng, 1, 20) * 5, status: pick(rng, ['paid', 'paid', 'refunded']) }));
            const min = pick(rng, [20, 30, 40, 50]);
            const answer = rows.filter(r => r.status === 'paid' && r.total >= min).length;
            const loose = rows.filter(r => r.total >= min).length;
            return {
                text: 'How many rows does this count?',
                code: `-- orders\n${rows.map(r => `(${r.id}, ${r.total}, '${r.status}')`).join('\n')}\n\nSELECT COUNT(*) FROM orders\nWHERE status = 'paid' AND total >= ${min};`,
                answer: String(answer),
                distractors: [...new Set([String(loose), String(rows.filter(r => r.status === 'paid').length), String(rows.filter(r => r.status === 'paid' && r.total > min).length), String(answer + 1), String(Math.abs(answer - 1)), String(answer + 2)].filter(v => v !== String(answer)))].slice(0, 3),
                explanation: `Both conditions must hold: status 'paid' AND total at least ${min}.`
            };
        }
    }
];

const RATING = { easy: 1000, medium: 1300, hard: 1600 };

/** Templates that can make questions for a skill key (lowercase). */
const templatesFor = (skillKey) => TEMPLATES.filter(t => t.skill.toLowerCase() === skillKey);

/** One generated question (plain object) or null if the template couldn't make 3 distinct wrong options. */
function generate(template, rng) {
    const q = template.make(rng);
    const distractors = [...new Set(q.distractors.map(String))].filter(d => d !== String(q.answer)).slice(0, 3);
    if (distractors.length < 3) return null;
    return {
        skill: template.skill,
        type: 'mcq',
        text: q.text,
        code: q.code,
        options: [String(q.answer), ...distractors],
        answer: String(q.answer),
        explanation: q.explanation,
        rating: RATING[template.difficulty],
        source: 'template',
        templateId: template.id
    };
}

module.exports = { TEMPLATES, templatesFor, generate };
