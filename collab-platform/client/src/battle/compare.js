// battle/compare.js — compares an answer with an example's expected output in the browser
// (mirrors server/battles/judge.js; the server does the real judging of hidden tests).
const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    if (typeof v === 'number' && Object.is(v, -0)) return 0;
    return v;
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sortedKey = (arr) => [...arr].map(x => JSON.stringify(x)).sort();

export function matches(compare, got, expected) {
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
