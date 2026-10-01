// battles/content/estimates.js — CodeGuessr "Output Estimate": guess a number a snippet produces.
//
// Every template takes random parameters, so each round is new. `answer` is computed here (trusted
// code, never the player's). Guesses are scored on a log scale: 10% off is great, 10× off is zero.

const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const fib = (n) => { let a = 0; let b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };
const collatz = (n) => { let s = 0; while (n !== 1) { n = n % 2 ? 3 * n + 1 : n / 2; s++; } return s; };

const TEMPLATES = [
    {
        id: 'doubling-nested', difficulty: 'medium', language: 'javascript',
        make: (rng) => {
            const N = pick(rng, [100, 500, 1000, 5000, 20000, 100000]);
            let n = 0;
            for (let i = 1; i < N; i *= 2) n += i;
            return {
                code: `let n = 0;\nfor (let i = 1; i < ${N}; i *= 2) {\n  for (let j = 0; j < i; j++) {\n    n++;\n  }\n}\nconsole.log(n);`,
                answer: n,
                explain: `The inner loop runs 1 + 2 + 4 + … for each power of two below ${N}: that's one less than the next power of two.`
            };
        }
    },
    {
        id: 'triangle-loops', difficulty: 'easy', language: 'python',
        make: (rng) => {
            const N = int(rng, 20, 3000);
            return {
                code: `count = 0\nfor i in range(${N}):\n    for j in range(i):\n        count += 1\nprint(count)`,
                answer: (N * (N - 1)) / 2,
                explain: `0 + 1 + … + ${N - 1} = ${N}·${N - 1}/2.`
            };
        }
    },
    {
        id: 'repeat-length', difficulty: 'easy', language: 'javascript',
        make: (rng) => {
            const word = pick(rng, ['ab', 'hey', 'code', 'skirmish', 'x']);
            const k = int(rng, 3, 400);
            const m = int(rng, 2, 50);
            return {
                code: `const s = '${word}'.repeat(${k});\nconst parts = Array(${m}).fill(s);\nconsole.log(parts.join('').length);`,
                answer: word.length * k * m,
                explain: `${word.length} chars × ${k} repeats × ${m} copies.`
            };
        }
    },
    {
        id: 'fib-calls', difficulty: 'hard', language: 'javascript',
        make: (rng) => {
            const n = int(rng, 8, 27);
            return {
                code: `let calls = 0;\nfunction fib(n) {\n  calls++;\n  return n < 2 ? n : fib(n - 1) + fib(n - 2);\n}\nfib(${n});\nconsole.log(calls);`,
                answer: 2 * fib(n + 1) - 1,
                explain: `Naive recursion makes 2·fib(${n + 1}) − 1 calls, growing about 1.6× per step.`
            };
        }
    },
    {
        id: 'divisible-count', difficulty: 'easy', language: 'python',
        make: (rng) => {
            const N = int(rng, 100, 100000);
            const a = pick(rng, [3, 4, 6, 7]);
            const b = pick(rng, [5, 9, 10, 11]);
            let c = 0;
            for (let x = 0; x < N; x++) if (x % a === 0 || x % b === 0) c++;
            return {
                code: `nums = [x for x in range(${N}) if x % ${a} == 0 or x % ${b} == 0]\nprint(len(nums))`,
                answer: c,
                explain: `Multiples of ${a} plus multiples of ${b}, minus those counted twice (multiples of both).`
            };
        }
    },
    {
        id: 'halving-steps', difficulty: 'easy', language: 'javascript',
        make: (rng) => {
            const n = int(rng, 1000, 2 ** 30);
            return {
                code: `let n = ${n};\nlet steps = 0;\nwhile (n > 1) {\n  n = Math.floor(n / 2);\n  steps++;\n}\nconsole.log(steps);`,
                answer: Math.floor(Math.log2(n)),
                explain: 'Halving until 1 takes ⌊log₂ n⌋ steps.'
            };
        }
    },
    {
        id: 'collatz', difficulty: 'hard', language: 'python',
        make: (rng) => {
            const n = int(rng, 7, 5000);
            return {
                code: `n, steps = ${n}, 0\nwhile n != 1:\n    n = 3 * n + 1 if n % 2 else n // 2\n    steps += 1\nprint(steps)`,
                answer: collatz(n),
                explain: 'Collatz sequences are famously unpredictable; most starting points below 5,000 take tens to a couple hundred steps.'
            };
        }
    },
    {
        id: 'set-size', difficulty: 'medium', language: 'javascript',
        make: (rng) => {
            const N = int(rng, 50, 100000);
            const K = int(rng, 7, 5000);
            return {
                code: `const values = Array.from({ length: ${N} }, (_, i) => (i * 7) % ${K});\nconsole.log(new Set(values).size);`,
                answer: new Set(Array.from({ length: N }, (_, i) => (i * 7) % K)).size,
                explain: `There are at most ${K} different remainders, and only ${N} values to fill them.`
            };
        }
    },
    {
        id: 'power-digits', difficulty: 'medium', language: 'python',
        make: (rng) => {
            const k = int(rng, 10, 3000);
            return {
                code: `print(len(str(2 ** ${k})))`,
                answer: Math.floor(k * Math.log10(2)) + 1,
                explain: `2^${k} has ⌊${k}·log₁₀2⌋ + 1 digits (about 0.3 digits per doubling).`
            };
        }
    },
    {
        id: 'sum-range', difficulty: 'easy', language: 'python',
        make: (rng) => {
            const a = int(rng, 1, 500);
            const b = a + int(rng, 10, 5000);
            return {
                code: `print(sum(range(${a}, ${b})))`,
                answer: ((a + b - 1) * (b - a)) / 2,
                explain: `${b - a} numbers averaging ${(a + b - 1) / 2}.`
            };
        }
    },
    {
        id: 'binary-length', difficulty: 'medium', language: 'javascript',
        make: (rng) => {
            const n = int(rng, 1000, 2 ** 40);
            return {
                code: `const bits = (${n}).toString(2);\nconsole.log(bits.length * 3);`,
                answer: n.toString(2).length * 3,
                explain: `${n} needs ${n.toString(2).length} bits; times 3.`
            };
        }
    },
    {
        id: 'grid-cells', difficulty: 'easy', language: 'javascript',
        make: (rng) => {
            const w = int(rng, 3, 400);
            const h = int(rng, 3, 400);
            return {
                code: `const grid = [];\nfor (let y = 0; y < ${h}; y++) {\n  grid.push(new Array(${w}).fill(0));\n}\nconsole.log(grid.flat().length);`,
                answer: w * h,
                explain: `${h} rows × ${w} columns.`
            };
        }
    },
    {
        id: 'split-count', difficulty: 'medium', language: 'javascript',
        make: (rng) => {
            const word = pick(rng, ['mississippi', 'banana', 'abracadabra', 'committee', 'bookkeeper']);
            const letter = pick(rng, [...new Set(word.split(''))]);
            const k = int(rng, 2, 300);
            return {
                code: `const text = '${word} '.repeat(${k});\nconsole.log(text.split('${letter}').length);`,
                answer: (word.split(letter).length - 1) * k + 1,
                explain: `'${letter}' appears ${word.split(letter).length - 1}× per word, ${k} words; splitting gives one more piece than there are separators.`
            };
        }
    },
    {
        id: 'memo-calls', difficulty: 'hard', language: 'python',
        make: (rng) => {
            const n = int(rng, 20, 900);
            return {
                code: `from functools import lru_cache\ncalls = 0\n\n@lru_cache(maxsize=None)\ndef f(n):\n    global calls\n    calls += 1\n    return n if n < 2 else f(n - 1) + f(n - 2)\n\nf(${n})\nprint(calls)`,
                answer: n + 1,
                explain: `With memoization each of f(0)…f(${n}) runs exactly once: ${n + 1} calls. (Compare with the naive version!)`
            };
        }
    }
];

/** One estimate round: { id, language, code, answer, explain, difficulty } */
function makeEstimate(rng, difficulty) {
    const pool = difficulty ? TEMPLATES.filter(t => t.difficulty === difficulty) : TEMPLATES;
    const t = pick(rng, pool.length ? pool : TEMPLATES);
    return { template: t.id, language: t.language, difficulty: t.difficulty, ...t.make(rng) };
}

module.exports = { TEMPLATES, makeEstimate };
