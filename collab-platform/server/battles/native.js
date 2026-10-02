// battles/native.js — C and C++ for function challenges (compiled in the player's browser with Clang).
//
// Solutions are plain functions with LeetCode-style signatures; the browser wraps them in a harness
// that reads one test's arguments from stdin and prints the result as JSON (see client battle/native.js).
const { rngFrom } = require('./judge');

// Argument / return types the harnesses can read and print
const SIMPLE = new Set(['int', 'float', 'bool', 'str', 'int[]', 'str[]', 'int[][]', 'str[][]']);
const INT32 = 2 ** 31 - 1;

/**
 * True when some numbers in the tests or answers don't fit in a 32-bit int: those challenges use
 * `long long` instead of `int` in C/C++ (checked on a few hundred generated inputs).
 */
function isWide(p) {
    if (!p.generate || !p.solve) return false;
    const rng = rngFrom(12345);
    let wide = false;
    const walk = (v) => {
        if (wide) return;
        if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) > INT32) wide = true;
    };
    const inputs = [...(p.edge || [])];
    for (let i = 0; i < 300; i++) inputs.push(p.generate(rng));
    for (const args of inputs) {
        walk(args);
        walk(p.solve(...JSON.parse(JSON.stringify(args))));
        if (wide) break;
    }
    return wide;
}

/** Which compiled languages a function challenge supports. */
function nativeLanguages(p) {
    const types = [...p.params.map(x => x.type), p.returns];
    if (!types.every(t => SIMPLE.has(t))) return [];
    // C has no reasonable way to return a 2-D array without LeetCode's returnColumnSizes dance
    return /\[\]\[\]$/.test(p.returns) ? ['cpp'] : ['cpp', 'c'];
}

/* ── starter code ── */
const cppType = (t, wide, param) => {
    const int = wide ? 'long long' : 'int';
    const base = {
        int, float: 'double', bool: 'bool', str: 'string',
        'int[]': `vector<${int}>`, 'str[]': 'vector<string>',
        'int[][]': `vector<vector<${int}>>`, 'str[][]': 'vector<vector<string>>'
    }[t];
    return param && (t.endsWith('[]') || t === 'str') ? `${base}&` : base;
};

function starterCpp(p, wide) {
    const params = p.params.map(x => `${cppType(x.type, wide, true)} ${x.name}`).join(', ');
    return `#include <bits/stdc++.h>
using namespace std;

${cppType(p.returns, wide, false)} ${p.fn.cpp}(${params}) {
    // Write your solution here
}
`;
}

const cParams = (x, wide) => {
    const int = wide ? 'long long' : 'int';
    switch (x.type) {
        case 'int': return `${int} ${x.name}`;
        case 'float': return `double ${x.name}`;
        case 'bool': return `bool ${x.name}`;
        case 'str': return `char* ${x.name}`;
        case 'int[]': return `${int}* ${x.name}, int ${x.name}Size`;
        case 'str[]': return `char** ${x.name}, int ${x.name}Size`;
        case 'int[][]': return `${int}** ${x.name}, int ${x.name}Size, int* ${x.name}ColSize`;
        default: return `void* ${x.name}`;
    }
};
const cReturn = (t, wide) => ({ int: wide ? 'long long' : 'int', float: 'double', bool: 'bool', str: 'char*', 'int[]': `${wide ? 'long long' : 'int'}*`, 'str[]': 'char**' }[t]);

function starterC(p, wide) {
    const arrayOut = p.returns === 'int[]' || p.returns === 'str[]';
    const params = [...p.params.map(x => cParams(x, wide)), ...(arrayOut ? ['int* returnSize'] : [])].join(', ');
    const notes = [];
    if (arrayOut) notes.push('Return a malloc()ed array and set *returnSize to its length.');
    if (p.returns === 'str') notes.push('Return a malloc()ed, NUL-terminated string.');
    const doc = notes.length ? `/**\n${notes.map(n => ` * ${n}`).join('\n')}\n */\n` : '';
    return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

${doc}${cReturn(p.returns, wide)} ${p.fn.c}(${params}) {
    // Write your solution here
}
`;
}

module.exports = { nativeLanguages, isWide, starterCpp, starterC };
