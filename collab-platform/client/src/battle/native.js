// battle/native.js — C and C++ battle solutions: wraps the player's function in a small program.
//
// Each hidden test runs as its own program: its arguments arrive on stdin in a simple token format
// (numbers; strings as "<byte length> <bytes>"; arrays as "<length> <items...>"), the harness calls
// the player's function and prints the return value as JSON after a \x1e marker. Anything the player
// prints before that is shown as their log output.
export const NATIVE_LANGUAGES = ['c', 'cpp'];
export const isNative = (language) => NATIVE_LANGUAGES.includes(language);

const utf8Length = (s) => new TextEncoder().encode(s).length;

/** stdin for one test: `args` are the JSON values, `params` their declared types. */
export function encodeArgs(params, args) {
    const parts = [];
    const put = (type, v) => {
        if (type.endsWith('[]')) {
            const inner = type.slice(0, -2);
            parts.push(String(v.length));
            v.forEach(x => put(inner, x));
        } else if (type === 'str') {
            parts.push(`${utf8Length(v)} ${v}`);
        } else if (type === 'bool') {
            parts.push(v ? '1' : '0');
        } else {
            parts.push(String(v));
        }
    };
    params.forEach((p, i) => put(p.type, args[i]));
    return parts.join('\n') + '\n';
}

/* ── C++ ── */
const CPP_READERS = `
static long long __ss_ll() { long long x = 0; if (scanf("%lld", &x) != 1) x = 0; return x; }
static int __ss_i() { return (int)__ss_ll(); }
static bool __ss_b() { return __ss_ll() != 0; }
static double __ss_d() { double x = 0; if (scanf("%lf", &x) != 1) x = 0; return x; }
static std::string __ss_s() {
    long long n = __ss_ll(); getchar();
    std::string s((size_t)(n > 0 ? n : 0), '\\0');
    if (n > 0 && fread(&s[0], 1, (size_t)n, stdin) != (size_t)n) s.clear();
    return s;
}
template <class T> static std::vector<T> __ss_v(T (*read)()) {
    long long n = __ss_ll(); std::vector<T> v; v.reserve((size_t)(n > 0 ? n : 0));
    for (long long i = 0; i < n; i++) v.push_back(read());
    return v;
}
static void __ss_w(int x) { printf("%d", x); }
static void __ss_w(long x) { printf("%ld", x); }
static void __ss_w(long long x) { printf("%lld", x); }
static void __ss_w(unsigned x) { printf("%u", x); }
static void __ss_w(bool b) { fputs(b ? "true" : "false", stdout); }
static void __ss_w(double d) { if (std::isfinite(d)) printf("%.17g", d); else fputs("null", stdout); }
static void __ss_w(char c) { printf("\\"%c\\"", c); }
static void __ss_w(const std::string& s) {
    putchar('"');
    for (unsigned char c : s) {
        if (c == '"') fputs("\\\\\\"", stdout);
        else if (c == '\\\\') fputs("\\\\\\\\", stdout);
        else if (c == '\\n') fputs("\\\\n", stdout);
        else if (c == '\\t') fputs("\\\\t", stdout);
        else if (c == '\\r') fputs("\\\\r", stdout);
        else if (c < 0x20) printf("\\\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}
static void __ss_w(const char* s) { __ss_w(std::string(s ? s : "")); }
template <class T> static void __ss_w(const std::vector<T>& v) {
    putchar('[');
    for (size_t i = 0; i < v.size(); i++) { if (i) putchar(','); __ss_w(v[i]); }
    putchar(']');
}
`;

const cppReader = (type, wide) => {
    const int = wide ? '__ss_ll' : '__ss_i';
    const intT = wide ? 'long long' : 'int';
    return {
        int: `${int}()`,
        float: '__ss_d()',
        bool: '__ss_b()',
        str: '__ss_s()',
        'int[]': `__ss_v<${intT}>(${int})`,
        'str[]': '__ss_v<std::string>(__ss_s)',
        'int[][]': `__ss_v<std::vector<${intT}>>(+[]() { return __ss_v<${intT}>(${int}); })`,
        'str[][]': '__ss_v<std::vector<std::string>>(+[]() { return __ss_v<std::string>(__ss_s); })'
    }[type];
};

function cppSource(code, { fnName, params, wide }) {
    const reads = params.map((p, i) => `    auto __a${i} = ${cppReader(p.type, wide)};`).join('\n');
    return `#include <bits/stdc++.h>
using namespace std;
#line 1 "solution.cpp"
${code}
#line 1 "harness"
${CPP_READERS}
int main() {
${reads}
    auto __r = ${fnName}(${params.map((_, i) => `__a${i}`).join(', ')});
    std::cout.flush(); fflush(stdout);
    fputs("\\n\\x1e", stdout); __ss_w(__r); putchar('\\n');
    return 0;
}
`;
}

/* ── C ── */
const C_HELPERS = `
static long long __ss_ll(void) { long long x = 0; if (scanf("%lld", &x) != 1) x = 0; return x; }
static double __ss_d(void) { double x = 0; if (scanf("%lf", &x) != 1) x = 0; return x; }
static char* __ss_s(void) {
    long long n = __ss_ll(); getchar();
    if (n < 0) n = 0;
    char* s = (char*)malloc((size_t)n + 1);
    if (n > 0 && fread(s, 1, (size_t)n, stdin) != (size_t)n) n = 0;
    s[n] = 0;
    return s;
}
static void __ss_wstr(const char* s) {
    putchar('"');
    for (const unsigned char* p = (const unsigned char*)(s ? s : ""); *p; p++) {
        unsigned char c = *p;
        if (c == '"') fputs("\\\\\\"", stdout);
        else if (c == '\\\\') fputs("\\\\\\\\", stdout);
        else if (c == '\\n') fputs("\\\\n", stdout);
        else if (c == '\\t') fputs("\\\\t", stdout);
        else if (c == '\\r') fputs("\\\\r", stdout);
        else if (c < 0x20) printf("\\\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}
static void __ss_wd(double d) { if (isfinite(d)) printf("%.17g", d); else fputs("null", stdout); }
`;

function cSource(code, { fnName, params, returns, wide }) {
    const intT = wide ? 'long long' : 'int';
    const lines = [];
    const args = [];
    params.forEach((p, i) => {
        const a = `__a${i}`;
        switch (p.type) {
            case 'int': lines.push(`${intT} ${a} = (${intT})__ss_ll();`); args.push(a); break;
            case 'float': lines.push(`double ${a} = __ss_d();`); args.push(a); break;
            case 'bool': lines.push(`bool ${a} = __ss_ll() != 0;`); args.push(a); break;
            case 'str': lines.push(`char* ${a} = __ss_s();`); args.push(a); break;
            case 'int[]':
                lines.push(`int ${a}n = (int)__ss_ll(); ${intT}* ${a} = (${intT}*)malloc(sizeof(${intT}) * (${a}n > 0 ? ${a}n : 1));`,
                    `for (int i = 0; i < ${a}n; i++) ${a}[i] = (${intT})__ss_ll();`);
                args.push(a, `${a}n`); break;
            case 'str[]':
                lines.push(`int ${a}n = (int)__ss_ll(); char** ${a} = (char**)malloc(sizeof(char*) * (${a}n > 0 ? ${a}n : 1));`,
                    `for (int i = 0; i < ${a}n; i++) ${a}[i] = __ss_s();`);
                args.push(a, `${a}n`); break;
            case 'int[][]':
                lines.push(`int ${a}n = (int)__ss_ll(); ${intT}** ${a} = (${intT}**)malloc(sizeof(${intT}*) * (${a}n > 0 ? ${a}n : 1)); int* ${a}c = (int*)malloc(sizeof(int) * (${a}n > 0 ? ${a}n : 1));`,
                    `for (int i = 0; i < ${a}n; i++) { ${a}c[i] = (int)__ss_ll(); ${a}[i] = (${intT}*)malloc(sizeof(${intT}) * (${a}c[i] > 0 ? ${a}c[i] : 1)); for (int j = 0; j < ${a}c[i]; j++) ${a}[i][j] = (${intT})__ss_ll(); }`);
                args.push(a, `${a}n`, `${a}c`); break;
            default: throw new Error(`C doesn't support ${p.type} arguments`);
        }
    });
    let call;
    let print;
    switch (returns) {
        case 'int': call = `${intT} __r = ${fnName}(${args.join(', ')});`; print = `printf("%lld", (long long)__r);`; break;
        case 'float': call = `double __r = ${fnName}(${args.join(', ')});`; print = '__ss_wd(__r);'; break;
        case 'bool': call = `bool __r = ${fnName}(${args.join(', ')});`; print = 'fputs(__r ? "true" : "false", stdout);'; break;
        case 'str': call = `char* __r = ${fnName}(${args.join(', ')});`; print = '__ss_wstr(__r);'; break;
        case 'int[]':
            call = `int __rs = 0; ${intT}* __r = ${fnName}(${[...args, '&__rs'].join(', ')});`;
            print = 'putchar(\'[\'); for (int i = 0; __r && i < __rs; i++) { if (i) putchar(\',\'); printf("%lld", (long long)__r[i]); } putchar(\']\');';
            break;
        case 'str[]':
            call = `int __rs = 0; char** __r = ${fnName}(${[...args, '&__rs'].join(', ')});`;
            print = 'putchar(\'[\'); for (int i = 0; __r && i < __rs; i++) { if (i) putchar(\',\'); __ss_wstr(__r[i]); } putchar(\']\');';
            break;
        default: throw new Error(`C doesn't support returning ${returns}`);
    }
    return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>
#include <limits.h>
#include <ctype.h>
#include <stdint.h>
#line 1 "solution.c"
${code}
#line 1 "harness"
${C_HELPERS}
int main(void) {
    ${lines.join('\n    ')}
    ${call}
    fflush(stdout);
    fputs("\\n\\x1e", stdout); ${print} putchar('\\n');
    return 0;
}
`;
}

/** The full program to compile for one solution. */
export function nativeSource(language, code, signature) {
    return language === 'c' ? cSource(code, signature) : cppSource(code, signature);
}

/** Replaces <bits/stdc++.h> (GCC-only) for Clang. */
export const STDCPP_HEADER = ['algorithm', 'array', 'bitset', 'cassert', 'cctype', 'cfloat', 'climits', 'cmath', 'complex',
    'cstdint', 'cstdio', 'cstdlib', 'cstring', 'deque', 'functional', 'iomanip', 'iostream', 'iterator', 'limits', 'list',
    'map', 'memory', 'numeric', 'optional', 'queue', 'random', 'set', 'sstream', 'stack', 'string', 'string_view',
    'tuple', 'unordered_map', 'unordered_set', 'utility', 'vector'].map(h => `#include <${h}>`).join('\n') + '\n';

/**
 * Runs a compiled WASI (preview1) program once, synchronously: `stdin` bytes in, stdout/stderr out.
 * Self-contained on purpose: the code runner injects it into its worker with toString().
 */
export function runWasi(module, stdin, { maxOutput = 1 << 20 } = {}) {
    const ENOSYS = 52;
    const EBADF = 8;
    let memory = null;
    let pos = 0;
    let total = 0;
    const out = [];
    const err = [];
    const view = () => new DataView(memory.buffer);
    const bytes = () => new Uint8Array(memory.buffer);
    function Exit(code) { this.code = code; }
    const sys = {
        args_sizes_get(argc, size) { view().setUint32(argc, 1, true); view().setUint32(size, 4, true); return 0; },
        args_get(argv, buf) { view().setUint32(argv, buf, true); bytes().set([115, 111, 108, 0], buf); return 0; },
        environ_sizes_get(count, size) { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
        environ_get() { return 0; },
        fd_write(fd, iovs, len, written) {
            const v = view();
            let n = 0;
            for (let i = 0; i < len; i++) {
                const ptr = v.getUint32(iovs + i * 8, true);
                const size = v.getUint32(iovs + i * 8 + 4, true);
                if ((fd === 1 || fd === 2) && total < maxOutput) {
                    (fd === 1 ? out : err).push(bytes().slice(ptr, ptr + size));
                    total += size;
                }
                n += size;
            }
            v.setUint32(written, n, true);
            return fd === 1 || fd === 2 ? 0 : EBADF;
        },
        fd_read(fd, iovs, len, read) {
            if (fd !== 0) return EBADF;
            const v = view();
            let n = 0;
            for (let i = 0; i < len; i++) {
                const ptr = v.getUint32(iovs + i * 8, true);
                const size = v.getUint32(iovs + i * 8 + 4, true);
                const chunk = stdin.subarray(pos, pos + size);
                bytes().set(chunk, ptr);
                pos += chunk.length;
                n += chunk.length;
                if (chunk.length < size) break;
            }
            v.setUint32(read, n, true);
            return 0;
        },
        fd_fdstat_get(fd, buf) {
            if (fd > 2) return EBADF;
            const v = view();
            v.setUint8(buf, 2); // character device
            v.setUint16(buf + 2, 0, true);
            v.setBigUint64(buf + 8, 0xffffffffn, true);
            v.setBigUint64(buf + 16, 0xffffffffn, true);
            return 0;
        },
        fd_close() { return 0; },
        fd_seek() { return 70; }, // ESPIPE: stdin/stdout aren't seekable
        fd_prestat_get() { return EBADF; }, // no directories
        fd_prestat_dir_name() { return EBADF; },
        proc_exit(code) { throw new Exit(code); },
        clock_time_get(id, precision, time) { view().setBigUint64(time, BigInt(Math.round(performance.now() * 1e6)), true); return 0; },
        random_get(buf, len) { crypto.getRandomValues(bytes().subarray(buf, buf + len)); return 0; },
        sched_yield() { return 0; }
    };
    const imports = { wasi_snapshot_preview1: new Proxy(sys, { get: (target, name) => target[name] || (() => ENOSYS) }) };
    const instance = new WebAssembly.Instance(module, imports);
    memory = instance.exports.memory;
    let code = 0;
    let trap = null;
    try {
        instance.exports._start();
    } catch (e) {
        if (e instanceof Exit) code = e.code;
        else trap = e;
    }
    const join = (parts) => {
        const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
        let o = 0;
        for (const p of parts) { all.set(p, o); o += p.length; }
        return new TextDecoder().decode(all);
    };
    return { stdout: join(out), stderr: join(err), code, trap: trap ? String(trap.message || trap) : null, truncated: total >= maxOutput };
}
