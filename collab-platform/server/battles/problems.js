// battles/problems.js — the coding problems used in battles and practice.
//
// Players write one function. Each problem has:
//   fn         function name per language
//   params     [{ name, type }] — types: int, float, bool, str, int[], str[], int[][]
//   examples   shown in the statement (inputs and expected outputs are public)
//   edge       fixed hidden inputs (tricky cases)
//   generate   random hidden inputs (rng) — a new set every match, so answers can't be memorized
//   solve      trusted reference solution: computes expected outputs on the server
//   compare    'exact' (default) | 'sorted' | 'float' | 'groups'
//
// Expected outputs never leave the server: players get only inputs, their browser runs their code,
// and the server compares the outputs.

const rand = {
    int: (rng, a, b) => a + Math.floor(rng() * (b - a + 1)),
    pick: (rng, arr) => arr[Math.floor(rng() * arr.length)],
    ints: (rng, n, a, b) => Array.from({ length: n }, () => a + Math.floor(rng() * (b - a + 1))),
    str: (rng, n, alphabet = 'abcdefghijklmnopqrstuvwxyz') => Array.from({ length: n }, () => alphabet[Math.floor(rng() * alphabet.length)]).join(''),
    shuffle: (rng, arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },
    distinct: (rng, n, a, b) => {
        const set = new Set();
        while (set.size < n) set.add(a + Math.floor(rng() * (b - a + 1)));
        return [...set];
    }
};

const PROBLEMS = [
    /* ───────────────────────── easy ───────────────────────── */
    {
        id: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        tags: ['arrays', 'hash map'],
        fn: { python: 'two_sum', javascript: 'twoSum' },
        params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
        returns: 'int[]',
        statement: 'Return the indices `[i, j]` (with `i < j`) of the two numbers in `nums` that add up to `target`. Exactly one pair works.',
        examples: [
            { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
            { args: [[3, 2, 4], 6], expected: [1, 2] }
        ],
        edge: [[[3, 3], 6], [[-5, 1, 9, -2], -7], [[0, 4, 3, 0], 0]],
        generate: (rng) => {
            const n = rand.int(rng, 2, 400);
            const nums = rand.distinct(rng, n, -1e6, 1e6);
            const [i, j] = rand.shuffle(rng, [...Array(n).keys()]).slice(0, 2);
            const target = nums[i] + nums[j];
            // Make the pair unique: no other pair may hit the target
            const seen = new Set();
            for (let k = 0; k < n; k++) {
                if (k === i || k === j) continue;
                if (seen.has(target - nums[k]) || nums[k] * 2 === target) nums[k] += 2e6 + k;
                seen.add(nums[k]);
            }
            return [nums, target];
        },
        solve: (nums, target) => {
            const at = new Map();
            for (let j = 0; j < nums.length; j++) {
                if (at.has(target - nums[j])) return [at.get(target - nums[j]), j];
                at.set(nums[j], j);
            }
            return [];
        },
        compare: 'sorted'
    },
    {
        id: 'reverse-words',
        title: 'Reverse the Words',
        difficulty: 'easy',
        tags: ['strings'],
        fn: { python: 'reverse_words', javascript: 'reverseWords' },
        params: [{ name: 's', type: 'str' }],
        returns: 'str',
        statement: 'Return the words of `s` in reverse order, joined by single spaces. Words are separated by one or more spaces; ignore leading and trailing spaces.',
        examples: [
            { args: ['the sky is blue'], expected: 'blue is sky the' },
            { args: ['  hello   world  '], expected: 'world hello' }
        ],
        edge: [['a'], ['   '], ['one']],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 60) }, () => ' '.repeat(rand.int(rng, 0, 3)) + rand.str(rng, rand.int(rng, 1, 8))).join(' ')],
        solve: (s) => s.trim().split(/\s+/).filter(Boolean).reverse().join(' ')
    },
    {
        id: 'valid-palindrome',
        title: 'Valid Palindrome',
        difficulty: 'easy',
        tags: ['strings', 'two pointers'],
        fn: { python: 'is_palindrome', javascript: 'isPalindrome' },
        params: [{ name: 's', type: 'str' }],
        returns: 'bool',
        statement: 'Return `true` if `s` reads the same forwards and backwards after lower-casing it and removing everything except letters and digits.',
        examples: [
            { args: ['A man, a plan, a canal: Panama'], expected: true },
            { args: ['race a car'], expected: false }
        ],
        edge: [[''], [' '], ['0P'], ['ab_a']],
        generate: (rng) => {
            const half = rand.str(rng, rand.int(rng, 0, 40), 'abcAB01 ,.');
            const mid = rng() < 0.5 ? rand.str(rng, 1, 'xyz') : '';
            const mirror = half.split('').reverse().join('');
            const s = half + mid + mirror;
            return [rng() < 0.35 ? s + rand.str(rng, 1, 'qrs') : s];
        },
        solve: (s) => {
            const t = s.toLowerCase().replace(/[^a-z0-9]/g, '');
            return t === t.split('').reverse().join('');
        }
    },
    {
        id: 'fizzbuzz',
        title: 'FizzBuzz',
        difficulty: 'easy',
        tags: ['basics'],
        fn: { python: 'fizz_buzz', javascript: 'fizzBuzz' },
        params: [{ name: 'n', type: 'int' }],
        returns: 'str[]',
        statement: 'Return a list of strings for `1..n`: `"FizzBuzz"` for multiples of 15, `"Fizz"` for multiples of 3, `"Buzz"` for multiples of 5, and the number itself (as a string) otherwise.',
        examples: [{ args: [5], expected: ['1', '2', 'Fizz', '4', 'Buzz'] }, { args: [1], expected: ['1'] }],
        edge: [[15], [0]],
        generate: (rng) => [rand.int(rng, 1, 500)],
        solve: (n) => Array.from({ length: n }, (_, i) => {
            const k = i + 1;
            return k % 15 === 0 ? 'FizzBuzz' : k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : String(k);
        })
    },
    {
        id: 'valid-anagram',
        title: 'Valid Anagram',
        difficulty: 'easy',
        tags: ['strings', 'counting'],
        fn: { python: 'is_anagram', javascript: 'isAnagram' },
        params: [{ name: 's', type: 'str' }, { name: 't', type: 'str' }],
        returns: 'bool',
        statement: 'Return `true` if `t` uses exactly the same letters as `s` (same counts, any order).',
        examples: [{ args: ['anagram', 'nagaram'], expected: true }, { args: ['rat', 'car'], expected: false }],
        edge: [['', ''], ['a', 'aa'], ['ab', 'ba']],
        generate: (rng) => {
            const s = rand.str(rng, rand.int(rng, 1, 300), 'abcde');
            let t = rand.shuffle(rng, s.split('')).join('');
            if (rng() < 0.5) t = t.slice(1) + rand.str(rng, 1, 'abcdef');
            return [s, t];
        },
        solve: (s, t) => s.length === t.length && s.split('').sort().join('') === t.split('').sort().join('')
    },
    {
        id: 'running-sum',
        title: 'Running Sum',
        difficulty: 'easy',
        tags: ['arrays', 'prefix sums'],
        fn: { python: 'running_sum', javascript: 'runningSum' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int[]',
        statement: 'Return an array where element `i` is the sum of `nums[0..i]`.',
        examples: [{ args: [[1, 2, 3, 4]], expected: [1, 3, 6, 10] }, { args: [[3, 1, 2, 10, 1]], expected: [3, 4, 6, 16, 17] }],
        edge: [[[]], [[-5]], [[0, 0, 0]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 1, 500), -1000, 1000)],
        solve: (nums) => { let s = 0; return nums.map(x => (s += x)); }
    },
    {
        id: 'missing-number',
        title: 'Missing Number',
        difficulty: 'easy',
        tags: ['math', 'arrays'],
        fn: { python: 'missing_number', javascript: 'missingNumber' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int',
        statement: '`nums` contains `n` distinct numbers from the range `0..n`. Return the one number in that range that is missing.',
        examples: [{ args: [[3, 0, 1]], expected: 2 }, { args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]], expected: 8 }],
        edge: [[[0]], [[1]], [[1, 2]]],
        generate: (rng) => {
            const n = rand.int(rng, 1, 1000);
            const all = rand.shuffle(rng, [...Array(n + 1).keys()]);
            all.splice(rand.int(rng, 0, n), 1);
            return [all];
        },
        solve: (nums) => (nums.length * (nums.length + 1)) / 2 - nums.reduce((a, b) => a + b, 0)
    },
    {
        id: 'single-number',
        title: 'Single Number',
        difficulty: 'easy',
        tags: ['bits', 'hash map'],
        fn: { python: 'single_number', javascript: 'singleNumber' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int',
        statement: 'Every number in `nums` appears exactly twice, except for one that appears once. Return that one.',
        examples: [{ args: [[2, 2, 1]], expected: 1 }, { args: [[4, 1, 2, 1, 2]], expected: 4 }],
        edge: [[[7]], [[-1, -1, -2]]],
        generate: (rng) => {
            const vals = rand.distinct(rng, rand.int(rng, 1, 300), -1e5, 1e5);
            const nums = [vals[0], ...vals.slice(1).flatMap(v => [v, v])];
            return [rand.shuffle(rng, nums)];
        },
        solve: (nums) => nums.reduce((a, b) => a ^ b, 0)
    },
    {
        id: 'valid-parentheses',
        title: 'Valid Parentheses',
        difficulty: 'easy',
        tags: ['stack', 'strings'],
        fn: { python: 'is_valid', javascript: 'isValid' },
        params: [{ name: 's', type: 'str' }],
        returns: 'bool',
        statement: '`s` contains only `()[]{}`. Return `true` if every bracket is closed by the same type, in the right order.',
        examples: [{ args: ['()[]{}'], expected: true }, { args: ['(]'], expected: false }, { args: ['{[]}'], expected: true }],
        edge: [[''], ['('], [')('], ['(('], ['{[()()]}']],
        generate: (rng) => {
            const pairs = ['()', '[]', '{}'];
            const build = (depth) => {
                let out = '';
                const parts = rand.int(rng, 1, 3);
                for (let i = 0; i < parts; i++) {
                    const p = rand.pick(rng, pairs);
                    out += p[0] + (depth > 0 && rng() < 0.6 ? build(depth - 1) : '') + p[1];
                }
                return out;
            };
            let s = build(rand.int(rng, 1, 5));
            if (rng() < 0.5) {
                const i = rand.int(rng, 0, s.length - 1);
                s = s.slice(0, i) + rand.pick(rng, ['(', ']', '{', ')']) + s.slice(i + 1);
            }
            return [s];
        },
        solve: (s) => {
            const open = { ')': '(', ']': '[', '}': '{' };
            const st = [];
            for (const c of s) {
                if (!open[c]) st.push(c);
                else if (st.pop() !== open[c]) return false;
            }
            return st.length === 0;
        }
    },
    {
        id: 'move-zeroes',
        title: 'Move Zeroes',
        difficulty: 'easy',
        tags: ['arrays', 'two pointers'],
        fn: { python: 'move_zeroes', javascript: 'moveZeroes' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int[]',
        statement: 'Return `nums` with all `0`s moved to the end, keeping the order of the other numbers.',
        examples: [{ args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] }, { args: [[0]], expected: [0] }],
        edge: [[[]], [[1, 2, 3]], [[0, 0, 1]]],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 400) }, () => (rng() < 0.35 ? 0 : rand.int(rng, -50, 50)))],
        solve: (nums) => [...nums.filter(x => x !== 0), ...nums.filter(x => x === 0)]
    },
    {
        id: 'best-time-stock',
        title: 'Best Time to Buy and Sell',
        difficulty: 'easy',
        tags: ['arrays', 'greedy'],
        fn: { python: 'max_profit', javascript: 'maxProfit' },
        params: [{ name: 'prices', type: 'int[]' }],
        returns: 'int',
        statement: '`prices[i]` is a stock\'s price on day `i`. Buy on one day and sell on a later day. Return the largest possible profit, or `0` if no profit is possible.',
        examples: [{ args: [[7, 1, 5, 3, 6, 4]], expected: 5 }, { args: [[7, 6, 4, 3, 1]], expected: 0 }],
        edge: [[[5]], [[1, 2]], [[2, 1]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 1, 800), 1, 10000)],
        solve: (prices) => {
            let low = Infinity;
            let best = 0;
            for (const p of prices) { low = Math.min(low, p); best = Math.max(best, p - low); }
            return best;
        }
    },
    {
        id: 'climbing-stairs',
        title: 'Climbing Stairs',
        difficulty: 'easy',
        tags: ['dynamic programming'],
        fn: { python: 'climb_stairs', javascript: 'climbStairs' },
        params: [{ name: 'n', type: 'int' }],
        returns: 'int',
        statement: 'You climb a staircase of `n` steps, 1 or 2 steps at a time. Return the number of distinct ways to reach the top. (`1 <= n <= 70`)',
        examples: [{ args: [2], expected: 2 }, { args: [3], expected: 3 }],
        edge: [[1], [70]],
        generate: (rng) => [rand.int(rng, 1, 70)],
        solve: (n) => { let a = 1; let b = 1; for (let i = 2; i <= n; i++) [a, b] = [b, a + b]; return b; }
    },

    /* ───────────────────────── medium ───────────────────────── */
    {
        id: 'max-subarray',
        title: 'Maximum Subarray',
        difficulty: 'medium',
        tags: ['arrays', 'dynamic programming'],
        fn: { python: 'max_sub_array', javascript: 'maxSubArray' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int',
        statement: 'Return the largest sum of a non-empty contiguous subarray of `nums`.',
        examples: [{ args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 }, { args: [[5, 4, -1, 7, 8]], expected: 23 }],
        edge: [[[-3]], [[-5, -2, -9]], [[0]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 1, 2000), -1000, 1000)],
        solve: (nums) => {
            let best = nums[0];
            let cur = 0;
            for (const x of nums) { cur = Math.max(x, cur + x); best = Math.max(best, cur); }
            return best;
        }
    },
    {
        id: 'group-anagrams',
        title: 'Group Anagrams',
        difficulty: 'medium',
        tags: ['hash map', 'strings'],
        fn: { python: 'group_anagrams', javascript: 'groupAnagrams' },
        params: [{ name: 'words', type: 'str[]' }],
        returns: 'str[][]',
        statement: 'Group the words that are anagrams of each other. Return the groups in any order, with the words inside each group in any order.',
        examples: [
            { args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], expected: [['bat'], ['nat', 'tan'], ['ate', 'eat', 'tea']] },
            { args: [['']], expected: [['']] }
        ],
        edge: [[['a']], [['ab', 'ba', 'ab']]],
        generate: (rng) => {
            const bases = Array.from({ length: rand.int(rng, 1, 30) }, () => rand.str(rng, rand.int(rng, 1, 6), 'abcdef'));
            return [Array.from({ length: rand.int(rng, 1, 150) }, () => rand.shuffle(rng, rand.pick(rng, bases).split('')).join(''))];
        },
        solve: (words) => {
            const groups = new Map();
            for (const w of words) {
                const k = w.split('').sort().join('');
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(w);
            }
            return [...groups.values()];
        },
        compare: 'groups'
    },
    {
        id: 'longest-unique-substring',
        title: 'Longest Substring Without Repeats',
        difficulty: 'medium',
        tags: ['sliding window', 'strings'],
        fn: { python: 'length_of_longest_substring', javascript: 'lengthOfLongestSubstring' },
        params: [{ name: 's', type: 'str' }],
        returns: 'int',
        statement: 'Return the length of the longest substring of `s` that has no repeated characters.',
        examples: [{ args: ['abcabcbb'], expected: 3 }, { args: ['bbbbb'], expected: 1 }, { args: ['pwwkew'], expected: 3 }],
        edge: [[''], [' '], ['dvdf'], ['abba']],
        generate: (rng) => [rand.str(rng, rand.int(rng, 0, 1500), rand.pick(rng, ['abc', 'abcdefgh', 'abcdefghijklmnopqrstuvwxyz0123456789']))],
        solve: (s) => {
            const last = new Map();
            let start = 0;
            let best = 0;
            for (let i = 0; i < s.length; i++) {
                if (last.has(s[i]) && last.get(s[i]) >= start) start = last.get(s[i]) + 1;
                last.set(s[i], i);
                best = Math.max(best, i - start + 1);
            }
            return best;
        }
    },
    {
        id: 'product-except-self',
        title: 'Product Except Self',
        difficulty: 'medium',
        tags: ['arrays', 'prefix sums'],
        fn: { python: 'product_except_self', javascript: 'productExceptSelf' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int[]',
        statement: 'Return an array where element `i` is the product of every number in `nums` except `nums[i]`. Try it without division.',
        examples: [{ args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] }, { args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] }],
        edge: [[[2, 3]], [[0, 0]], [[0, 4, 5]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 2, 18), -6, 6)],
        solve: (nums) => nums.map((_, i) => nums.reduce((p, x, j) => (j === i ? p : p * x), 1) + 0)
    },
    {
        id: 'merge-intervals',
        title: 'Merge Intervals',
        difficulty: 'medium',
        tags: ['sorting', 'intervals'],
        fn: { python: 'merge', javascript: 'merge' },
        params: [{ name: 'intervals', type: 'int[][]' }],
        returns: 'int[][]',
        statement: 'Merge all overlapping intervals `[start, end]` (touching intervals like `[1,4]` and `[4,5]` count as overlapping). Return the merged intervals sorted by start.',
        examples: [
            { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
            { args: [[[1, 4], [4, 5]]], expected: [[1, 5]] }
        ],
        edge: [[[[1, 1]]], [[[5, 7], [1, 2]]], [[[1, 10], [2, 3], [4, 5]]]],
        generate: (rng) => [Array.from({ length: rand.int(rng, 1, 200) }, () => {
            const a = rand.int(rng, 0, 1000);
            return [a, a + rand.int(rng, 0, 40)];
        })],
        solve: (intervals) => {
            const sorted = intervals.map(x => [...x]).sort((a, b) => a[0] - b[0]);
            const out = [];
            for (const [s, e] of sorted) {
                if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
                else out.push([s, e]);
            }
            return out;
        }
    },
    {
        id: 'top-k-frequent',
        title: 'Top K Frequent',
        difficulty: 'medium',
        tags: ['hash map', 'sorting'],
        fn: { python: 'top_k_frequent', javascript: 'topKFrequent' },
        params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
        returns: 'int[]',
        statement: 'Return the `k` most frequent numbers, most frequent first. Break ties by the smaller number first.',
        examples: [{ args: [[1, 1, 1, 2, 2, 3], 2], expected: [1, 2] }, { args: [[4, 4, 5, 5, 6], 2], expected: [4, 5] }],
        edge: [[[1], 1], [[3, 2, 1], 3]],
        generate: (rng) => {
            const nums = rand.ints(rng, rand.int(rng, 1, 500), -20, 20);
            return [nums, rand.int(rng, 1, new Set(nums).size)];
        },
        solve: (nums, k) => {
            const c = new Map();
            for (const x of nums) c.set(x, (c.get(x) || 0) + 1);
            return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map(e => e[0]);
        }
    },
    {
        id: 'rotate-matrix',
        title: 'Rotate the Matrix',
        difficulty: 'medium',
        tags: ['matrices'],
        fn: { python: 'rotate', javascript: 'rotate' },
        params: [{ name: 'matrix', type: 'int[][]' }],
        returns: 'int[][]',
        statement: 'Return the `n × n` matrix rotated 90° clockwise.',
        examples: [{ args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], expected: [[7, 4, 1], [8, 5, 2], [9, 6, 3]] }],
        edge: [[[[1]]], [[[1, 2], [3, 4]]]],
        generate: (rng) => {
            const n = rand.int(rng, 1, 25);
            return [Array.from({ length: n }, () => rand.ints(rng, n, -99, 99))];
        },
        solve: (m) => m[0].map((_, c) => m.map(row => row[c]).reverse())
    },
    {
        id: 'spiral-order',
        title: 'Spiral Order',
        difficulty: 'medium',
        tags: ['matrices', 'simulation'],
        fn: { python: 'spiral_order', javascript: 'spiralOrder' },
        params: [{ name: 'matrix', type: 'int[][]' }],
        returns: 'int[]',
        statement: 'Return all elements of the `m × n` matrix in clockwise spiral order, starting at the top-left.',
        examples: [
            { args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], expected: [1, 2, 3, 6, 9, 8, 7, 4, 5] },
            { args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]], expected: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7] }
        ],
        edge: [[[[1]]], [[[1], [2], [3]]], [[[1, 2, 3]]]],
        generate: (rng) => {
            const m = rand.int(rng, 1, 20);
            const n = rand.int(rng, 1, 20);
            return [Array.from({ length: m }, () => rand.ints(rng, n, 0, 99))];
        },
        solve: (matrix) => {
            const out = [];
            let top = 0;
            let bottom = matrix.length - 1;
            let left = 0;
            let right = matrix[0].length - 1;
            while (top <= bottom && left <= right) {
                for (let c = left; c <= right; c++) out.push(matrix[top][c]);
                for (let r = top + 1; r <= bottom; r++) out.push(matrix[r][right]);
                if (top < bottom) for (let c = right - 1; c >= left; c--) out.push(matrix[bottom][c]);
                if (left < right) for (let r = bottom - 1; r > top; r--) out.push(matrix[r][left]);
                top++; bottom--; left++; right--;
            }
            return out;
        }
    },
    {
        id: 'coin-change',
        title: 'Coin Change',
        difficulty: 'medium',
        tags: ['dynamic programming'],
        fn: { python: 'coin_change', javascript: 'coinChange' },
        params: [{ name: 'coins', type: 'int[]' }, { name: 'amount', type: 'int' }],
        returns: 'int',
        statement: 'Return the fewest coins needed to make `amount` (unlimited coins of each value), or `-1` if it can\'t be made.',
        examples: [{ args: [[1, 2, 5], 11], expected: 3 }, { args: [[2], 3], expected: -1 }, { args: [[1], 0], expected: 0 }],
        edge: [[[7], 14], [[3, 7], 5], [[186, 419, 83, 408], 6249]],
        generate: (rng) => [rand.distinct(rng, rand.int(rng, 1, 6), 1, 60), rand.int(rng, 0, 3000)],
        solve: (coins, amount) => {
            const dp = new Array(amount + 1).fill(Infinity);
            dp[0] = 0;
            for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
            return dp[amount] === Infinity ? -1 : dp[amount];
        }
    },
    {
        id: 'number-of-islands',
        title: 'Number of Islands',
        difficulty: 'medium',
        tags: ['graphs', 'flood fill'],
        fn: { python: 'num_islands', javascript: 'numIslands' },
        params: [{ name: 'grid', type: 'int[][]' }],
        returns: 'int',
        statement: '`grid` is a map of `1`s (land) and `0`s (water). Return the number of islands: groups of land connected up, down, left or right.',
        examples: [
            { args: [[[1, 1, 0, 0, 0], [1, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 1]]], expected: 3 },
            { args: [[[1, 1, 1], [0, 1, 0], [1, 1, 1]]], expected: 1 }
        ],
        edge: [[[[0]]], [[[1]]], [[[1, 0, 1, 0, 1]]]],
        generate: (rng) => {
            const m = rand.int(rng, 1, 40);
            const n = rand.int(rng, 1, 40);
            const p = 0.3 + rng() * 0.3;
            return [Array.from({ length: m }, () => Array.from({ length: n }, () => (rng() < p ? 1 : 0)))];
        },
        solve: (grid) => {
            const g = grid.map(r => [...r]);
            let count = 0;
            for (let i = 0; i < g.length; i++) {
                for (let j = 0; j < g[0].length; j++) {
                    if (g[i][j] !== 1) continue;
                    count++;
                    const stack = [[i, j]];
                    g[i][j] = 0;
                    while (stack.length) {
                        const [r, c] = stack.pop();
                        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (g[nr]?.[nc] === 1) { g[nr][nc] = 0; stack.push([nr, nc]); }
                        }
                    }
                }
            }
            return count;
        }
    },
    {
        id: 'longest-common-subsequence',
        title: 'Longest Common Subsequence',
        difficulty: 'medium',
        tags: ['dynamic programming', 'strings'],
        fn: { python: 'longest_common_subsequence', javascript: 'longestCommonSubsequence' },
        params: [{ name: 'a', type: 'str' }, { name: 'b', type: 'str' }],
        returns: 'int',
        statement: 'Return the length of the longest sequence of characters that appears in both `a` and `b` in the same order (not necessarily next to each other).',
        examples: [{ args: ['abcde', 'ace'], expected: 3 }, { args: ['abc', 'def'], expected: 0 }],
        edge: [['', 'abc'], ['a', 'a'], ['abc', 'abc']],
        generate: (rng) => [rand.str(rng, rand.int(rng, 0, 400), 'abcd'), rand.str(rng, rand.int(rng, 0, 400), 'abcd')],
        solve: (a, b) => {
            let prev = new Array(b.length + 1).fill(0);
            for (let i = 1; i <= a.length; i++) {
                const cur = new Array(b.length + 1).fill(0);
                for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
                prev = cur;
            }
            return prev[b.length];
        }
    },
    {
        id: 'search-rotated',
        title: 'Search a Rotated Array',
        difficulty: 'medium',
        tags: ['binary search'],
        fn: { python: 'search', javascript: 'search' },
        params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
        returns: 'int',
        statement: '`nums` is a sorted array of distinct numbers that has been rotated (e.g. `[4,5,6,7,0,1,2]`). Return the index of `target`, or `-1` if it isn\'t there. Aim for O(log n).',
        examples: [{ args: [[4, 5, 6, 7, 0, 1, 2], 0], expected: 4 }, { args: [[4, 5, 6, 7, 0, 1, 2], 3], expected: -1 }, { args: [[1], 0], expected: -1 }],
        edge: [[[1], 1], [[3, 1], 1], [[5, 1, 3], 5]],
        generate: (rng) => {
            const sorted = rand.distinct(rng, rand.int(rng, 1, 2000), -1e5, 1e5).sort((x, y) => x - y);
            const k = rand.int(rng, 0, sorted.length - 1);
            const nums = [...sorted.slice(k), ...sorted.slice(0, k)];
            return [nums, rng() < 0.7 ? rand.pick(rng, nums) : rand.int(rng, -1e5, 1e5)];
        },
        solve: (nums, target) => nums.indexOf(target)
    },
    {
        id: 'kth-largest',
        title: 'Kth Largest Element',
        difficulty: 'medium',
        tags: ['heap', 'sorting'],
        fn: { python: 'find_kth_largest', javascript: 'findKthLargest' },
        params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
        returns: 'int',
        statement: 'Return the `k`-th largest number in `nums` (counting duplicates: in `[3,3,2]` the 2nd largest is `3`).',
        examples: [{ args: [[3, 2, 1, 5, 6, 4], 2], expected: 5 }, { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], expected: 4 }],
        edge: [[[1], 1], [[2, 2, 2], 3]],
        generate: (rng) => {
            const nums = rand.ints(rng, rand.int(rng, 1, 2000), -1e4, 1e4);
            return [nums, rand.int(rng, 1, nums.length)];
        },
        solve: (nums, k) => [...nums].sort((a, b) => b - a)[k - 1]
    },

    /* ───────────────────────── hard ───────────────────────── */
    {
        id: 'trapping-rain-water',
        title: 'Trapping Rain Water',
        difficulty: 'hard',
        tags: ['two pointers', 'arrays'],
        fn: { python: 'trap', javascript: 'trap' },
        params: [{ name: 'height', type: 'int[]' }],
        returns: 'int',
        statement: '`height` describes an elevation map where each bar is 1 wide. Return how much rain water it can trap.',
        examples: [{ args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], expected: 6 }, { args: [[4, 2, 0, 3, 2, 5]], expected: 9 }],
        edge: [[[]], [[3]], [[3, 0, 3]], [[1, 2, 3]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 0, 3000), 0, rand.pick(rng, [5, 50, 1000]))],
        solve: (h) => {
            let l = 0;
            let r = h.length - 1;
            let lm = 0;
            let rm = 0;
            let water = 0;
            while (l < r) {
                if (h[l] < h[r]) { lm = Math.max(lm, h[l]); water += lm - h[l]; l++; } else { rm = Math.max(rm, h[r]); water += rm - h[r]; r--; }
            }
            return water;
        }
    },
    {
        id: 'edit-distance',
        title: 'Edit Distance',
        difficulty: 'hard',
        tags: ['dynamic programming', 'strings'],
        fn: { python: 'min_distance', javascript: 'minDistance' },
        params: [{ name: 'a', type: 'str' }, { name: 'b', type: 'str' }],
        returns: 'int',
        statement: 'Return the minimum number of single-character insertions, deletions or replacements needed to turn `a` into `b`.',
        examples: [{ args: ['horse', 'ros'], expected: 3 }, { args: ['intention', 'execution'], expected: 5 }],
        edge: [['', ''], ['', 'abc'], ['abc', 'abc'], ['a', 'b']],
        generate: (rng) => [rand.str(rng, rand.int(rng, 0, 300), 'abcde'), rand.str(rng, rand.int(rng, 0, 300), 'abcde')],
        solve: (a, b) => {
            let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
            for (let i = 1; i <= a.length; i++) {
                const cur = [i];
                for (let j = 1; j <= b.length; j++) {
                    cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
                }
                prev = cur;
            }
            return prev[b.length];
        }
    },
    {
        id: 'longest-increasing-subsequence',
        title: 'Longest Increasing Subsequence',
        difficulty: 'hard',
        tags: ['dynamic programming', 'binary search'],
        fn: { python: 'length_of_lis', javascript: 'lengthOfLIS' },
        params: [{ name: 'nums', type: 'int[]' }],
        returns: 'int',
        statement: 'Return the length of the longest strictly increasing subsequence of `nums`.',
        examples: [{ args: [[10, 9, 2, 5, 3, 7, 101, 18]], expected: 4 }, { args: [[7, 7, 7, 7]], expected: 1 }],
        edge: [[[1]], [[1, 2, 3, 4]], [[4, 3, 2, 1]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 1, 2500), -1e4, 1e4)],
        solve: (nums) => {
            const tails = [];
            for (const x of nums) {
                let lo = 0;
                let hi = tails.length;
                while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
                tails[lo] = x;
            }
            return tails.length;
        }
    },
    {
        id: 'median-two-sorted',
        title: 'Median of Two Sorted Arrays',
        difficulty: 'hard',
        tags: ['binary search', 'arrays'],
        fn: { python: 'find_median_sorted_arrays', javascript: 'findMedianSortedArrays' },
        params: [{ name: 'a', type: 'int[]' }, { name: 'b', type: 'int[]' }],
        returns: 'float',
        statement: '`a` and `b` are sorted. Return the median of all their numbers combined (the average of the two middle numbers when the total count is even). At least one array is non-empty.',
        examples: [{ args: [[1, 3], [2]], expected: 2 }, { args: [[1, 2], [3, 4]], expected: 2.5 }],
        edge: [[[], [1]], [[2], []], [[1, 1], [1, 1]]],
        generate: (rng) => {
            const a = rand.ints(rng, rand.int(rng, 0, 1000), -1e5, 1e5).sort((x, y) => x - y);
            const b = rand.ints(rng, rand.int(rng, a.length ? 0 : 1, 1000), -1e5, 1e5).sort((x, y) => x - y);
            return [a, b];
        },
        solve: (a, b) => {
            const all = [...a, ...b].sort((x, y) => x - y);
            const n = all.length;
            return n % 2 ? all[(n - 1) / 2] : (all[n / 2 - 1] + all[n / 2]) / 2;
        },
        compare: 'float'
    },
    {
        id: 'min-window-substring',
        title: 'Minimum Window Substring',
        difficulty: 'hard',
        tags: ['sliding window', 'strings'],
        fn: { python: 'min_window', javascript: 'minWindow' },
        params: [{ name: 's', type: 'str' }, { name: 't', type: 'str' }],
        returns: 'str',
        statement: 'Return the shortest substring of `s` that contains every character of `t` (including duplicates). If several are equally short, return the leftmost one. Return `""` if there is none.',
        examples: [{ args: ['ADOBECODEBANC', 'ABC'], expected: 'BANC' }, { args: ['a', 'a'], expected: 'a' }, { args: ['a', 'aa'], expected: '' }],
        edge: [['ab', 'b'], ['aa', 'aa'], ['abc', 'cba'], ['bba', 'ab']],
        generate: (rng) => [rand.str(rng, rand.int(rng, 1, 1500), 'abcdef'), rand.str(rng, rand.int(rng, 1, 6), 'abcdefg')],
        solve: (s, t) => {
            const need = new Map();
            for (const c of t) need.set(c, (need.get(c) || 0) + 1);
            let missing = t.length;
            let best = [0, Infinity];
            let l = 0;
            for (let r = 0; r < s.length; r++) {
                if ((need.get(s[r]) || 0) > 0) missing--;
                need.set(s[r], (need.get(s[r]) || 0) - 1);
                while (missing === 0) {
                    if (r - l < best[1] - best[0]) best = [l, r];
                    need.set(s[l], need.get(s[l]) + 1);
                    if (need.get(s[l]) > 0) missing++;
                    l++;
                }
            }
            return best[1] === Infinity ? '' : s.slice(best[0], best[1] + 1);
        }
    },
    {
        id: 'n-queens',
        title: 'N-Queens',
        difficulty: 'hard',
        tags: ['backtracking'],
        fn: { python: 'total_n_queens', javascript: 'totalNQueens' },
        params: [{ name: 'n', type: 'int' }],
        returns: 'int',
        statement: 'Return the number of ways to place `n` queens on an `n × n` chessboard so that no two attack each other. (`1 <= n <= 10`)',
        examples: [{ args: [4], expected: 2 }, { args: [1], expected: 1 }],
        edge: [[2], [3], [10]],
        generate: (rng) => [rand.int(rng, 1, 9)],
        solve: (n) => {
            let count = 0;
            const go = (row, cols, d1, d2) => {
                if (row === n) { count++; return; }
                for (let c = 0; c < n; c++) {
                    if (cols & (1 << c) || d1 & (1 << (row + c)) || d2 & (1 << (row - c + n))) continue;
                    go(row + 1, cols | (1 << c), d1 | (1 << (row + c)), d2 | (1 << (row - c + n)));
                }
            };
            go(0, 0, 0, 0);
            return count;
        }
    },
    {
        id: 'word-break',
        title: 'Word Break',
        difficulty: 'hard',
        tags: ['dynamic programming', 'strings'],
        fn: { python: 'word_break', javascript: 'wordBreak' },
        params: [{ name: 's', type: 'str' }, { name: 'words', type: 'str[]' }],
        returns: 'bool',
        statement: 'Return `true` if `s` can be split into a sequence of one or more dictionary `words` (each word can be used any number of times).',
        examples: [{ args: ['leetcode', ['leet', 'code']], expected: true }, { args: ['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']], expected: false }],
        edge: [['a', ['a']], ['aaaaaaaaaaaaaaaaaaaaaaaaaab', ['a', 'aa', 'aaa']], ['ab', ['a']]],
        generate: (rng) => {
            const words = Array.from({ length: rand.int(rng, 1, 8) }, () => rand.str(rng, rand.int(rng, 1, 4), 'abc'));
            let s = Array.from({ length: rand.int(rng, 1, 40) }, () => rand.pick(rng, words)).join('');
            if (rng() < 0.4) s += rand.str(rng, 1, 'abcd');
            return [s, words];
        },
        solve: (s, words) => {
            const set = new Set(words);
            const ok = [true];
            for (let i = 1; i <= s.length; i++) {
                ok[i] = false;
                for (let j = 0; j < i && !ok[i]; j++) if (ok[j] && set.has(s.slice(j, i))) ok[i] = true;
            }
            return ok[s.length];
        }
    },
    {
        id: 'largest-rectangle',
        title: 'Largest Rectangle in a Histogram',
        difficulty: 'hard',
        tags: ['stack', 'arrays'],
        fn: { python: 'largest_rectangle_area', javascript: 'largestRectangleArea' },
        params: [{ name: 'heights', type: 'int[]' }],
        returns: 'int',
        statement: '`heights` are the bar heights of a histogram where every bar is 1 wide. Return the area of the largest rectangle that fits inside it.',
        examples: [{ args: [[2, 1, 5, 6, 2, 3]], expected: 10 }, { args: [[2, 4]], expected: 4 }],
        edge: [[[1]], [[0, 0]], [[3, 3, 3]], [[1, 2, 3, 4, 5]]],
        generate: (rng) => [rand.ints(rng, rand.int(rng, 1, 3000), 0, rand.pick(rng, [10, 1000, 1e4]))],
        solve: (h) => {
            const st = [];
            let best = 0;
            for (let i = 0; i <= h.length; i++) {
                const cur = i === h.length ? 0 : h[i];
                while (st.length && h[st[st.length - 1]] >= cur) {
                    const height = h[st.pop()];
                    const left = st.length ? st[st.length - 1] + 1 : 0;
                    best = Math.max(best, height * (i - left));
                }
                st.push(i);
            }
            return best;
        }
    }
];

const byId = new Map(PROBLEMS.map(p => [p.id, p]));

// Battle length per difficulty (minutes)
const DURATION_MIN = { easy: 10, medium: 20, hard: 30 };

module.exports = { PROBLEMS, byId, rand, DURATION_MIN };
