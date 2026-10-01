// runtime/git/gitCli.js — `git` for the in-browser terminal (browser mode), built on isomorphic-git.
//
// Works on the project's files inside the WebContainer. clone/fetch/pull/push go through the API
// server's git relay (/api/git-proxy), because git hosts don't allow requests from web pages.
// The repository itself is saved in this browser (see store.js).
import axios from 'axios';
import { boot, mountKey } from '../webcontainer';
import { createWcFs, removeTree } from './wcfs';
import { saveRepo, restoreRepo } from './store';

let libs = null;
const load = () => {
    if (!libs) {
        libs = Promise.all([import('isomorphic-git'), import('isomorphic-git/http/web'), import('diff')])
            .then(([g, h, d]) => ({ git: g.default || g, http: h.default || h, diff: d }))
            .catch((err) => { libs = null; throw err; });
    }
    return libs;
};

let restoredFor = null;

const TOKEN_KEY = 'ss-git-token';
const GLOBAL_KEY = 'ss-git-global';

export const getGitToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setGitToken = (token) => {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token.trim());
        else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage blocked */ }
};
const globalConfig = () => { try { return JSON.parse(localStorage.getItem(GLOBAL_KEY) || '{}'); } catch { return {}; } };
const setGlobalConfig = (key, value) => {
    const cfg = globalConfig();
    if (value === undefined) delete cfg[key]; else cfg[key] = value;
    try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ }
};

/** Splits a command line like a shell: quotes and backslash escapes. */
export const splitArgs = (line) => {
    const out = [];
    let cur = '';
    let quote = null;
    let has = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === quote) quote = null;
            else if (c === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
            else cur += c;
        } else if (c === '"' || c === "'") { quote = c; has = true; }
        else if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; }
        else if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; }
        else { cur += c; has = true; }
    }
    if (cur || has) out.push(cur);
    return out;
};

// Never part of a repository, even without a .gitignore
const NOISE = /(^|\/)(node_modules|\.pydeps|__pycache__|\.ipynb_checkpoints)(\/|$)/;
const notNoise = (fp) => !NOISE.test(fp);

const joinPath = (...parts) => {
    const out = [];
    for (const seg of parts.filter(Boolean).join('/').split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') out.pop(); else out.push(seg);
    }
    return out.join('/');
};

const short = (oid) => String(oid || '').slice(0, 7);

// statusMatrix rows are [file, HEAD, WORKDIR, STAGE]: 0 = absent, 1 = same as HEAD, 2 = same as the
// working copy, 3 = different from both
const isStaged = (h, w, s) => (h === 0 && s !== 0) || (h === 1 && s === 0) || (h === 1 && (s === 2 || s === 3));
const isUnstaged = (h, w, s) => (s !== 0 && w === 0) || (w === 2 && s === 1) || s === 3;
const isUntracked = (h, w, s) => (h === 0 && w === 2 && s === 0) || (h === 1 && w === 2 && s === 0);

const HOST_AUTH = {
    'github.com': (t) => ({ username: t, password: 'x-oauth-basic' }),
    'gitlab.com': (t) => ({ username: 'oauth2', password: t }),
    'bitbucket.org': (t) => ({ username: 'x-token-auth', password: t }),
    'codeberg.org': (t) => ({ username: t, password: 'x-oauth-basic' })
};

/** https URL for a remote ("git@github.com:me/repo.git" becomes https), or throws. */
const normalizeUrl = (url) => {
    let u = String(url || '').trim();
    const ssh = /^git@([^:]+):(.+)$/.exec(u);
    if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
    if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, 'https:');
    if (!/^https:\/\//i.test(u)) throw new Error(`unsupported remote URL: ${url}. Use an https:// URL, e.g. https://github.com/user/repo.git`);
    const host = new URL(u).hostname.toLowerCase();
    if (!HOST_AUTH[host] && host !== 'gist.github.com') throw new Error(`${host} isn't supported. Use GitHub, GitLab, Bitbucket or Codeberg.`);
    return u;
};

const HELP = `usage: git <command> [<args>]

  start      init · clone <url> [dir] [--depth N] [-b branch]
  changes    status · add <path|.> · rm [--cached] <path> · restore [--staged] <path>
             commit -m "msg" [-a] · reset [--hard] [<path>] · diff [--staged] [<path>] · stash [pop|list|drop]
  history    log [--oneline] [-n N]
  branches   branch [-a] [-d] [<name>] · checkout [-b] <branch> · switch [-c] <branch> · merge <branch> · tag [<name>]
  remotes    remote [-v] · remote add <name> <url> · fetch · pull · push [-u] [--force] [<remote> <branch>]
  settings   config [--global] user.name|user.email [<value>]

Private repos and pushing need an access token: click 🔑 Token in the terminal bar.
Your repository is saved in this browser; share work with teammates by pushing to GitHub.`;

/**
 * Runs one `git ...` command line. ctx: { projectId, cwd, out(text, type), author: {name, email} }.
 * Returns { worktreeChanged } so the caller can sync files back to the project.
 */
export async function runGit(line, ctx) {
    const args = splitArgs(line).slice(1);
    const out = (text, type = 'info') => ctx.out(text, type);
    const cmd = args.shift();
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { out(HELP); return {}; }
    if (cmd === '--version' || cmd === 'version') {
        const { git } = await load();
        out(`git version 2 (isomorphic-git ${git.version()}, running in your browser)`);
        return {};
    }

    const { git, http, diff } = await load();
    await boot();
    const { fs, changes } = createWcFs();

    // Repositories saved in this browser come back after a reload / project switch (once per mount)
    if (restoredFor !== mountKey()) {
        restoredFor = mountKey();
        const hasRepo = await fs.promises.stat('/.git').then(() => true).catch(() => false);
        if (!hasRepo) await restoreRepo(ctx.projectId).catch(() => false);
    }

    const cwdAbs = `/${ctx.cwd || ''}`.replace(/\/+$/, '') || '/';
    const findRoot = async () => {
        try { return await git.findRoot({ fs, filepath: cwdAbs }); } catch { return null; }
    };

    const proxy = `${(axios.defaults.baseURL || '').replace(/\/+$/, '')}/api/git-proxy`;
    const remoteOpts = (url) => {
        const host = url ? new URL(url).hostname.toLowerCase() : 'github.com';
        return {
            http,
            corsProxy: proxy,
            headers: { 'x-auth-token': localStorage.getItem('token') || '' },
            onAuth: () => {
                const token = getGitToken();
                if (!token) return { cancel: true };
                return (HOST_AUTH[host] || HOST_AUTH['github.com'])(token);
            },
            onAuthFailure: () => ({ cancel: true }),
            onProgress: progress()
        };
    };

    let lastPhase = '';
    let lastPct = -1;
    function progress() {
        return ({ phase, loaded, total }) => {
            if (!total) {
                if (phase !== lastPhase) { out(`${phase}…`, 'system'); lastPhase = phase; lastPct = -1; }
                return;
            }
            const pct = Math.floor((loaded / total) * 100);
            const step = Math.floor(pct / 25) * 25;
            if (phase !== lastPhase || step > lastPct) {
                out(`${phase}: ${step}% (${loaded}/${total})`, 'system');
                lastPhase = phase;
                lastPct = step;
            }
        };
    }

    const author = async (dir) => {
        const name = (await git.getConfig({ fs, dir, path: 'user.name' }).catch(() => null)) || globalConfig()['user.name'] || ctx.author?.name || 'SkillSkirmish user';
        const email = (await git.getConfig({ fs, dir, path: 'user.email' }).catch(() => null)) || globalConfig()['user.email'] || ctx.author?.email || `${name.replace(/\s+/g, '-')}@users.noreply.skillskirmish.app`;
        return { name, email };
    };

    const flags = (list) => {
        const opts = {};
        const rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            const spec = list.find(s => s.names.includes(a));
            if (spec) opts[spec.key] = spec.value ? args[++i] : true;
            else if (/^-n?\d+$/.test(a) && list.some(s => s.key === 'n')) opts.n = a.replace(/^-n?/, '');
            else rest.push(a);
        }
        return { opts, rest };
    };

    const result = { worktreeChanged: false };
    const save = async () => { await saveRepo(ctx.projectId, changes).catch(err => out(`warning: couldn't save the repository in this browser: ${err.message}`, 'warning')); };

    try {
        if (cmd === 'init') {
            const { opts, rest } = flags([{ names: ['-b', '--initial-branch'], key: 'b', value: true }, { names: ['-q', '--quiet'], key: 'q' }]);
            const target = joinPath(ctx.cwd, rest[0] || '');
            const dir = `/${target}`;
            const existed = await fs.promises.stat(`${dir}/.git`.replace(/^\/+/, '/')).then(() => true).catch(() => false);
            await git.init({ fs, dir, defaultBranch: opts.b || 'main' });
            await save();
            out(`${existed ? 'Reinitialized existing' : 'Initialized empty'} Git repository in ~/project/${target ? `${target}/` : ''}.git/`, 'success');
            return result;
        }

        if (cmd === 'clone') {
            const { opts, rest } = flags([
                { names: ['--depth'], key: 'depth', value: true },
                { names: ['-b', '--branch'], key: 'branch', value: true },
                { names: ['--single-branch'], key: 'single' }
            ]);
            if (!rest[0]) { out('usage: git clone <https-url> [<directory>]', 'error'); return result; }
            const url = normalizeUrl(rest[0]);
            const name = rest[1] ?? url.replace(/\/+$/, '').split('/').pop().replace(/\.git$/, '');
            const target = joinPath(ctx.cwd, name);
            const dir = `/${target}`;
            if (target && rest[1] !== '.') {
                const exists = await fs.promises.stat(dir).then(() => true).catch(() => false);
                if (exists && (await fs.promises.readdir(dir)).length) {
                    out(`fatal: destination path '${name}' already exists and is not an empty directory.`, 'error');
                    return result;
                }
            }
            out(`Cloning into '${rest[1] === '.' ? '.' : name}'…`);
            try {
                await git.clone({
                    fs, dir, url, ...remoteOpts(url),
                    ref: opts.branch, singleBranch: true,
                    depth: opts.depth ? parseInt(opts.depth, 10) : undefined
                });
            } catch (err) {
                if (target && rest[1] !== '.') await removeTree(target);
                throw err;
            }
            await save();
            const branch = await git.currentBranch({ fs, dir }).catch(() => '');
            const files = (await git.listFiles({ fs, dir }).catch(() => [])).length;
            out(`✓ Cloned ${url} (${branch || 'detached'}, ${files} files)${target !== (ctx.cwd || '') ? ` into ${name}/` : ''}`, 'success');
            if (rest[1] !== '.') out(`Tip: \`cd ${name}\` to work in it.`, 'system');
            result.worktreeChanged = true;
            return result;
        }

        // Everything else needs a repository
        const root = await findRoot();
        if (!root) {
            out('fatal: not a git repository (or any of the parent directories): .git', 'error');
            out('Run `git init` to start one here, or `git clone <url>` to copy one from GitHub.', 'system');
            return result;
        }
        const dir = root;
        const rootRel = root.replace(/^\/+/, '');
        // Paths from the command line are relative to the current folder; isomorphic-git wants repo-relative
        const repoPath = (p) => {
            const abs = joinPath(ctx.cwd, p);
            if (!rootRel) return abs || '.';
            return abs === rootRel ? '.' : abs.startsWith(`${rootRel}/`) ? abs.slice(rootRel.length + 1) : null;
        };
        const branchName = async () => git.currentBranch({ fs, dir, fullname: false }).catch(() => undefined);
        const headOid = async () => git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);
        const matrix = async (prefixes) => {
            const rows = await git.statusMatrix({ fs, dir, filter: notNoise });
            if (!prefixes || prefixes.includes('.')) return rows;
            return rows.filter(([fp]) => prefixes.some(p => fp === p || fp.startsWith(`${p}/`)));
        };
        const mergeHead = async () => {
            try { return (await fs.promises.readFile(`${dir}/.git/MERGE_HEAD`, 'utf8')).trim(); } catch { return null; }
        };
        const remoteUrl = async (remote = 'origin') => git.getConfig({ fs, dir, path: `remote.${remote}.url` }).catch(() => null);

        switch (cmd) {
            case 'status': {
                const { opts } = flags([{ names: ['-s', '--short'], key: 's' }]);
                const branch = await branchName();
                const head = await headOid();
                const rows = await matrix();
                const staged = [];
                const unstaged = [];
                const untracked = [];
                for (const [fp, h, w, s] of rows) {
                    if (isStaged(h, w, s)) staged.push([h === 0 ? 'new file' : s === 0 ? 'deleted' : 'modified', fp]);
                    if (isUnstaged(h, w, s)) unstaged.push([w === 0 ? 'deleted' : 'modified', fp]);
                    if (isUntracked(h, w, s)) untracked.push(fp);
                }
                if (opts.s) {
                    const codes = new Map();
                    for (const [k, fp] of staged) codes.set(fp, [k === 'new file' ? 'A' : k === 'deleted' ? 'D' : 'M', ' ']);
                    for (const [k, fp] of unstaged) codes.set(fp, [(codes.get(fp) || [' '])[0], k === 'deleted' ? 'D' : 'M']);
                    for (const [fp, [x, y]] of codes) out(`${x}${y} ${fp}`, x !== ' ' ? 'success' : 'error');
                    for (const fp of untracked) out(`?? ${fp}`, 'error');
                    return result;
                }
                out(branch ? `On branch ${branch}` : `HEAD detached at ${short(head)}`);
                if (branch && head) {
                    const tracking = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` }).catch(() => null);
                    if (tracking === head) out(`Your branch is up to date with 'origin/${branch}'.`);
                    else if (tracking) {
                        const [mine, theirs] = await Promise.all([
                            git.log({ fs, dir, ref: head, depth: 300 }).catch(() => []),
                            git.log({ fs, dir, ref: tracking, depth: 300 }).catch(() => [])
                        ]);
                        const theirSet = new Set(theirs.map(c => c.oid));
                        const mineSet = new Set(mine.map(c => c.oid));
                        const ahead = mine.filter(c => !theirSet.has(c.oid)).length;
                        const behind = theirs.filter(c => !mineSet.has(c.oid)).length;
                        if (ahead && behind) out(`Your branch and 'origin/${branch}' have diverged (${ahead} and ${behind} different commits). Use "git pull".`, 'warning');
                        else if (ahead) out(`Your branch is ahead of 'origin/${branch}' by ${ahead} commit${ahead > 1 ? 's' : ''}. Use "git push" to publish.`);
                        else if (behind) out(`Your branch is behind 'origin/${branch}' by ${behind} commit${behind > 1 ? 's' : ''}. Use "git pull" to update.`);
                    }
                }
                if (!head) out('\nNo commits yet');
                if (await mergeHead()) out('\nYou have unmerged paths. Fix the conflicts, then "git add" and "git commit".', 'warning');
                if (staged.length) {
                    out('\nChanges to be committed:');
                    for (const [k, fp] of staged) out(`        ${(k + ':').padEnd(12)}${fp}`, 'success');
                }
                if (unstaged.length) {
                    out('\nChanges not staged for commit:');
                    for (const [k, fp] of unstaged) out(`        ${(k + ':').padEnd(12)}${fp}`, 'error');
                }
                if (untracked.length) {
                    out('\nUntracked files:');
                    for (const fp of untracked.slice(0, 200)) out(`        ${fp}`, 'error');
                    if (untracked.length > 200) out(`        … and ${untracked.length - 200} more`, 'error');
                }
                if (!staged.length && !unstaged.length && !untracked.length) out(`\nnothing to commit, working tree clean`);
                else if (!staged.length) out(`\nno changes added to commit (use "git add" and/or "git commit -a")`);
                return result;
            }

            case 'add': {
                const { opts, rest } = flags([{ names: ['-A', '--all'], key: 'all' }, { names: ['-u', '--update'], key: 'u' }]);
                if (!rest.length && !opts.all && !opts.u) { out('Nothing specified, nothing added. Maybe you wanted to say "git add ."?', 'warning'); return result; }
                const targets = opts.all ? ['.'] : rest.map(repoPath);
                if (targets.some(t => t === null)) { out('fatal: path is outside the repository', 'error'); return result; }
                const rows = await matrix(opts.u && !rest.length ? ['.'] : targets);
                if (!rows.length) { out(`fatal: pathspec '${rest[0]}' did not match any files`, 'error'); return result; }
                let n = 0;
                for (const [fp, h, w, s] of rows) {
                    if (opts.u && h === 0 && s === 0) continue; // -u: only files git already knows
                    if (w === 0 && s !== 0) { await git.remove({ fs, dir, filepath: fp }); n++; }
                    else if (w === 2 && s !== 2) { await git.add({ fs, dir, filepath: fp }); n++; }
                }
                await save();
                out(n ? `Staged ${n} change${n > 1 ? 's' : ''}.` : 'Nothing new to stage.', n ? 'success' : 'info');
                return result;
            }

            case 'rm': {
                const { opts, rest } = flags([{ names: ['--cached'], key: 'cached' }, { names: ['-r', '-f', '-rf'], key: 'r' }]);
                for (const p of rest) {
                    const fp = repoPath(p);
                    if (fp === null) continue;
                    const tracked = (await git.listFiles({ fs, dir })).filter(f => f === fp || f.startsWith(`${fp}/`));
                    if (!tracked.length) { out(`fatal: pathspec '${p}' did not match any files`, 'error'); continue; }
                    for (const f of tracked) {
                        await git.remove({ fs, dir, filepath: f });
                        if (!opts.cached) { await removeTree(joinPath(rootRel, f)); result.worktreeChanged = true; }
                        out(`rm '${f}'`);
                    }
                }
                await save();
                return result;
            }

            case 'restore': {
                const { opts, rest } = flags([{ names: ['--staged', '-S'], key: 'staged' }, { names: ['--worktree', '-W'], key: 'worktree' }]);
                const paths = rest.map(repoPath).filter(p => p !== null);
                if (!paths.length) { out('fatal: you must specify path(s) to restore', 'error'); return result; }
                if (opts.staged) {
                    for (const fp of paths) for (const [f] of await matrix([fp])) await git.resetIndex({ fs, dir, filepath: f });
                }
                if (!opts.staged || opts.worktree) {
                    await git.checkout({ fs, dir, ref: (await branchName()) || 'HEAD', filepaths: paths, force: true });
                    result.worktreeChanged = true;
                }
                await save();
                out('Restored.', 'success');
                return result;
            }

            case 'commit': {
                const { opts, rest } = flags([
                    { names: ['-m', '--message'], key: 'm', value: true },
                    { names: ['-a', '--all'], key: 'a' },
                    { names: ['-am'], key: 'am', value: true },
                    { names: ['--allow-empty'], key: 'empty' }
                ]);
                // -m can be given more than once: each becomes a paragraph
                const messages = [];
                for (let i = 0; i < args.length; i++) if (['-m', '--message', '-am'].includes(args[i])) messages.push(args[i + 1]);
                const message = messages.filter(Boolean).join('\n\n');
                if (!message) { out('error: please give a commit message, e.g. git commit -m "Add login page"', 'error'); return result; }
                if (rest.length) { out(`error: pathspec commits aren't supported; "git add" the files, then commit`, 'error'); return result; }
                if (opts.a || opts.am) {
                    for (const [fp, h, w, s] of await matrix()) {
                        if (h !== 1) continue;
                        if (w === 0 && s !== 0) await git.remove({ fs, dir, filepath: fp });
                        else if (w === 2 && s !== 2) await git.add({ fs, dir, filepath: fp });
                    }
                }
                const rows = await matrix();
                const stagedCount = rows.filter(([, h, w, s]) => isStaged(h, w, s)).length;
                const merging = await mergeHead();
                if (!stagedCount && !opts.empty && !merging) {
                    const dirty = rows.some(([, h, w, s]) => !(h === 1 && w === 1 && s === 1));
                    out(dirty ? 'no changes added to commit (use "git add" and/or "git commit -a")' : 'nothing to commit, working tree clean', 'warning');
                    return result;
                }
                const head = await headOid();
                const oid = await git.commit({
                    fs, dir, message, author: await author(dir),
                    ...(merging && head ? { parent: [head, merging] } : {})
                });
                if (merging) {
                    await fs.promises.unlink(`${dir}/.git/MERGE_HEAD`).catch(() => {});
                    await fs.promises.unlink(`${dir}/.git/MERGE_MSG`).catch(() => {});
                }
                await save();
                const branch = await branchName();
                out(`[${branch || 'detached HEAD'}${head ? '' : ' (root-commit)'} ${short(oid)}] ${message.split('\n')[0]}`, 'success');
                out(` ${stagedCount} file${stagedCount === 1 ? '' : 's'} changed`);
                return result;
            }

            case 'log': {
                const { opts, rest } = flags([{ names: ['--oneline'], key: 'oneline' }, { names: ['-n', '--max-count'], key: 'n', value: true }, { names: ['--all'], key: 'all' }]);
                const depth = opts.n ? parseInt(opts.n, 10) : 30;
                if (!(await headOid())) { out(`fatal: your current branch '${(await branchName()) || 'main'}' does not have any commits yet`, 'error'); return result; }
                const commits = await git.log({ fs, dir, ref: rest[0] || 'HEAD', depth });
                const branch = await branchName();
                commits.forEach((c, i) => {
                    const deco = i === 0 && !rest[0] ? ` (HEAD${branch ? ` -> ${branch}` : ''})` : '';
                    const first = c.commit.message.split('\n')[0];
                    if (opts.oneline) { out(`${short(c.oid)}${deco} ${first}`, i === 0 ? 'warning' : 'info'); return; }
                    out(`commit ${c.oid}${deco}`, 'warning');
                    out(`Author: ${c.commit.author.name} <${c.commit.author.email}>`);
                    out(`Date:   ${new Date(c.commit.author.timestamp * 1000).toString()}`);
                    out(`\n    ${c.commit.message.trim().split('\n').join('\n    ')}\n`);
                });
                if (commits.length === depth) out(`(showing the last ${depth}; use -n <count> for more)`, 'system');
                return result;
            }

            case 'diff': {
                const { opts, rest } = flags([{ names: ['--staged', '--cached'], key: 'staged' }, { names: ['--stat'], key: 'stat' }, { names: ['--name-only'], key: 'names' }]);
                const prefixes = rest.length ? rest.map(repoPath).filter(p => p !== null) : null;
                const rows = await matrix(prefixes);
                const changed = rows.filter(([, h, w, s]) => (opts.staged ? isStaged(h, w, s) : isUnstaged(h, w, s)));
                if (!changed.length) { out(opts.staged ? 'No staged changes.' : 'No unstaged changes. (Staged changes: git diff --staged)', 'system'); return result; }
                if (opts.names) { changed.forEach(([fp]) => out(fp)); return result; }

                // Blob ids in the index, for the "before" side of unstaged diffs / "after" side of staged ones
                const want = new Set(changed.map(([fp]) => fp));
                const stageOids = new Map();
                await git.walk({
                    fs, dir, trees: [git.STAGE()],
                    map: async (fp, [entry]) => {
                        if (entry && want.has(fp)) stageOids.set(fp, await entry.oid());
                        return true;
                    }
                });
                const head = await headOid();
                const text = (bytes) => (bytes ? new TextDecoder().decode(bytes) : '');
                const isBinary = (bytes) => !!bytes && bytes.subarray(0, 8000).includes(0);
                const readHead = async (fp) => (head ? (await git.readBlob({ fs, dir, oid: head, filepath: fp }).catch(() => null))?.blob : null);
                const readStage = async (fp) => (stageOids.has(fp) ? (await git.readBlob({ fs, dir, oid: stageOids.get(fp) }).catch(() => null))?.blob : null);
                const readWork = async (fp) => fs.promises.readFile(`${dir}/${fp}`.replace(/^\/\//, '/')).catch(() => null);

                let printed = 0;
                const LIMIT = 600;
                for (const [fp] of changed) {
                    const [before, after] = opts.staged
                        ? [await readHead(fp), await readStage(fp)]
                        : [await readStage(fp), await readWork(fp)];
                    if (isBinary(before) || isBinary(after)) { out(`Binary file ${fp} differs`, 'warning'); continue; }
                    const patch = diff.structuredPatch(`a/${fp}`, `b/${fp}`, text(before), text(after), '', '', { context: 3 });
                    if (opts.stat) {
                        let plus = 0;
                        let minus = 0;
                        for (const h of patch.hunks) for (const l of h.lines) { if (l[0] === '+') plus++; else if (l[0] === '-') minus++; }
                        out(` ${fp} | ${plus + minus} ${'+'.repeat(Math.min(plus, 40))}${'-'.repeat(Math.min(minus, 40))}`);
                        continue;
                    }
                    out(`diff --git a/${fp} b/${fp}`, 'warning');
                    out(`--- ${before ? `a/${fp}` : '/dev/null'}`, 'warning');
                    out(`+++ ${after ? `b/${fp}` : '/dev/null'}`, 'warning');
                    for (const h of patch.hunks) {
                        out(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, 'system');
                        for (const l of h.lines) {
                            if (++printed > LIMIT) break;
                            out(l, l[0] === '+' ? 'success' : l[0] === '-' ? 'error' : 'info');
                        }
                        if (printed > LIMIT) break;
                    }
                    if (printed > LIMIT) { out(`… diff truncated after ${LIMIT} lines (use git diff <path> to see one file)`, 'system'); break; }
                }
                return result;
            }

            case 'branch': {
                const { opts, rest } = flags([
                    { names: ['-a', '--all'], key: 'all' }, { names: ['-r', '--remotes'], key: 'remotes' },
                    { names: ['-d', '-D', '--delete'], key: 'del' }, { names: ['-m', '-M', '--move'], key: 'move' }
                ]);
                if (opts.del) {
                    for (const b of rest) { await git.deleteBranch({ fs, dir, ref: b }); out(`Deleted branch ${b}.`, 'success'); }
                    await save();
                    return result;
                }
                if (opts.move) {
                    const [from, to] = rest.length === 2 ? rest : [await branchName(), rest[0]];
                    await git.renameBranch({ fs, dir, oldref: from, ref: to, checkout: from === await branchName() });
                    await save();
                    out(`Renamed ${from} to ${to}.`, 'success');
                    return result;
                }
                if (rest[0]) {
                    if (!(await headOid())) { out(`fatal: not a valid object name: '${(await branchName()) || 'main'}' (make a first commit)`, 'error'); return result; }
                    await git.branch({ fs, dir, ref: rest[0], object: rest[1] || 'HEAD' });
                    await save();
                    out(`Created branch ${rest[0]}. Switch to it with: git checkout ${rest[0]}`, 'success');
                    return result;
                }
                const current = await branchName();
                if (!opts.remotes) for (const b of await git.listBranches({ fs, dir })) out(`${b === current ? '*' : ' '} ${b}`, b === current ? 'success' : 'info');
                if (opts.all || opts.remotes) {
                    for (const r of await git.listRemotes({ fs, dir })) {
                        for (const b of await git.listBranches({ fs, dir, remote: r.remote })) if (b !== 'HEAD') out(`  remotes/${r.remote}/${b}`, 'error');
                    }
                }
                return result;
            }

            case 'checkout':
            case 'switch': {
                const createFlags = cmd === 'switch' ? ['-c', '--create', '-C'] : ['-b', '-B'];
                const { opts, rest } = flags([{ names: createFlags, key: 'create' }, { names: ['-f', '--force'], key: 'force' }, { names: ['--'], key: 'files' }]);
                if (cmd === 'checkout' && (opts.files || (rest.length && !opts.create && rest[0] !== '-' && await fs.promises.stat(`${dir}/${repoPath(rest[0]) ?? ''}`.replace(/^\/\//, '/')).then(s => s.isFile()).catch(() => false)))) {
                    // git checkout [--] <file>: throw away changes to files
                    const paths = rest.map(repoPath).filter(p => p !== null);
                    await git.checkout({ fs, dir, ref: (await branchName()) || 'HEAD', filepaths: paths, force: true });
                    result.worktreeChanged = true;
                    await save();
                    out(`Updated ${paths.length} path${paths.length === 1 ? '' : 's'} from HEAD`, 'success');
                    return result;
                }
                if (opts.create) {
                    if (!(await headOid())) {
                        // No commits yet: just point HEAD at the new (unborn) branch
                        await fs.promises.writeFile(`${dir}/.git/HEAD`, `ref: refs/heads/${rest[0]}\n`);
                    } else {
                        await git.branch({ fs, dir, ref: rest[0], object: rest[1] || 'HEAD', checkout: true });
                    }
                    await save();
                    out(`Switched to a new branch '${rest[0]}'`, 'success');
                    return result;
                }
                if (!rest[0]) { out(`usage: git ${cmd} <branch>`, 'error'); return result; }
                await git.checkout({ fs, dir, ref: rest[0], force: !!opts.force, remote: 'origin' });
                result.worktreeChanged = true;
                await save();
                out(`Switched to branch '${rest[0]}'`, 'success');
                return result;
            }

            case 'merge': {
                const { opts, rest } = flags([{ names: ['--abort'], key: 'abort' }, { names: ['--no-ff'], key: 'noff' }, { names: ['-m'], key: 'm', value: true }]);
                if (opts.abort) {
                    await git.abortMerge({ fs, dir });
                    await fs.promises.unlink(`${dir}/.git/MERGE_HEAD`).catch(() => {});
                    result.worktreeChanged = true;
                    await save();
                    out('Merge aborted.', 'success');
                    return result;
                }
                if (!rest[0]) { out('usage: git merge <branch>', 'error'); return result; }
                const ours = await branchName();
                try {
                    const r = await git.merge({ fs, dir, ours, theirs: rest[0], author: await author(dir), fastForward: !opts.noff, message: opts.m, abortOnConflict: false });
                    if (r.alreadyMerged) { out('Already up to date.'); return result; }
                    await git.checkout({ fs, dir, ref: ours });
                    result.worktreeChanged = true;
                    await save();
                    out(r.fastForward ? `Fast-forward to ${short(r.oid)}` : `Merge made by the 'recursive' strategy (${short(r.oid)}).`, 'success');
                } catch (err) {
                    if (err.code !== 'MergeConflictError') throw err;
                    const theirs = await git.resolveRef({ fs, dir, ref: rest[0] }).catch(() => git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${rest[0]}` }));
                    await fs.promises.writeFile(`${dir}/.git/MERGE_HEAD`, `${theirs}\n`);
                    await fs.promises.writeFile(`${dir}/.git/MERGE_MSG`, `Merge branch '${rest[0]}'\n`);
                    result.worktreeChanged = true;
                    await save();
                    for (const f of err.data?.filepaths || []) out(`CONFLICT (content): Merge conflict in ${f}`, 'error');
                    out('Automatic merge failed; fix the conflicts (look for <<<<<<< markers), then "git add" the files and "git commit".', 'warning');
                }
                return result;
            }

            case 'tag': {
                const { rest } = flags([]);
                if (!rest[0]) { for (const t of await git.listTags({ fs, dir })) out(t); return result; }
                await git.tag({ fs, dir, ref: rest[0], object: rest[1] || 'HEAD' });
                await save();
                out(`Tagged ${rest[0]}`, 'success');
                return result;
            }

            case 'remote': {
                const sub = args[0];
                if (!sub || sub === '-v' || sub === '--verbose') {
                    for (const r of await git.listRemotes({ fs, dir })) {
                        if (sub) { out(`${r.remote}\t${r.url} (fetch)`); out(`${r.remote}\t${r.url} (push)`); } else out(r.remote);
                    }
                    return result;
                }
                if (sub === 'add') {
                    await git.addRemote({ fs, dir, remote: args[1], url: normalizeUrl(args[2]) });
                    await save();
                    out(`Added remote ${args[1]} → ${normalizeUrl(args[2])}`, 'success');
                    return result;
                }
                if (sub === 'remove' || sub === 'rm') {
                    await git.deleteRemote({ fs, dir, remote: args[1] });
                    await save();
                    out(`Removed remote ${args[1]}`, 'success');
                    return result;
                }
                if (sub === 'set-url') {
                    await git.setConfig({ fs, dir, path: `remote.${args[1]}.url`, value: normalizeUrl(args[2]) });
                    await save();
                    out(`${args[1]} now points to ${normalizeUrl(args[2])}`, 'success');
                    return result;
                }
                if (sub === 'get-url') { out((await remoteUrl(args[1])) || `error: No such remote '${args[1]}'`); return result; }
                out(`usage: git remote [-v] | add <name> <url> | remove <name> | set-url <name> <url>`, 'error');
                return result;
            }

            case 'fetch': {
                const remote = args.find(a => !a.startsWith('-')) || 'origin';
                const url = await remoteUrl(remote);
                if (!url) { out(`fatal: '${remote}' does not appear to be a git repository. Add it: git remote add ${remote} <url>`, 'error'); return result; }
                const r = await git.fetch({ fs, dir, remote, ...remoteOpts(url), tags: true });
                await save();
                out(r.fetchHead ? `From ${url}\n * ${r.fetchHeadDescription || 'fetched'} → ${short(r.fetchHead)}` : 'Already up to date.', 'success');
                return result;
            }

            case 'pull': {
                const { rest } = flags([{ names: ['--rebase', '--ff-only', '--no-rebase'], key: 'ignored' }]);
                const remote = rest[0] || 'origin';
                const url = await remoteUrl(remote);
                if (!url) { out(`fatal: no remote '${remote}'. Add it: git remote add ${remote} <url>`, 'error'); return result; }
                const branch = await branchName();
                const before = await headOid();
                try {
                    await git.pull({ fs, dir, remote, ref: branch, remoteRef: rest[1] || branch, singleBranch: true, author: await author(dir), ...remoteOpts(url) });
                } catch (err) {
                    if (err.code !== 'MergeConflictError') throw err;
                    out(`CONFLICT: ${(err.data?.filepaths || []).join(', ')}`, 'error');
                    out('Your changes and the remote changes touch the same lines. Commit or stash your changes, then pull again.', 'warning');
                    return result;
                }
                const after = await headOid();
                result.worktreeChanged = before !== after;
                await save();
                out(before === after ? 'Already up to date.' : `Updated ${short(before)}..${short(after)}`, 'success');
                return result;
            }

            case 'push': {
                const { opts, rest } = flags([{ names: ['-u', '--set-upstream'], key: 'u' }, { names: ['-f', '--force'], key: 'force' }, { names: ['--tags'], key: 'tags' }]);
                const remote = rest[0] || 'origin';
                const url = await remoteUrl(remote);
                if (!url) {
                    out(`fatal: no remote '${remote}' configured.`, 'error');
                    out(`Create an empty repository on GitHub, then: git remote add ${remote} https://github.com/<you>/<repo>.git`, 'system');
                    return result;
                }
                if (!getGitToken()) {
                    out('Pushing needs an access token. Click 🔑 Token in the terminal bar and paste a GitHub token (repo / Contents: read & write).', 'error');
                    return result;
                }
                const branch = rest[1] || await branchName();
                if (!(await headOid())) { out('error: nothing to push yet; make a commit first', 'error'); return result; }
                out(`Pushing ${branch} to ${url}…`);
                const r = await git.push({ fs, dir, remote, ref: branch, remoteRef: branch, force: !!opts.force, ...remoteOpts(url) });
                if (!r.ok) {
                    const errors = Object.entries(r.refs || {}).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);
                    throw Object.assign(new Error(errors.join('; ') || 'push failed'), { code: 'PushRejectedError' });
                }
                if (opts.u) {
                    await git.setConfig({ fs, dir, path: `branch.${branch}.remote`, value: remote });
                    await git.setConfig({ fs, dir, path: `branch.${branch}.merge`, value: `refs/heads/${branch}` });
                    out(`branch '${branch}' set up to track '${remote}/${branch}'.`);
                }
                await save();
                out(`✓ Pushed to ${url.replace(/\.git$/, '')} (${branch})`, 'success');
                return result;
            }

            case 'reset': {
                const { opts, rest } = flags([{ names: ['--hard'], key: 'hard' }, { names: ['--soft'], key: 'soft' }, { names: ['--mixed'], key: 'mixed' }]);
                const branch = await branchName();
                const target = rest.find(r => /^(HEAD(~\d+|\^+)?|[0-9a-f]{4,40})$/.test(r) || r.startsWith('origin/'));
                const paths = rest.filter(r => r !== target).map(repoPath).filter(p => p !== null);
                if (paths.length) {
                    for (const fp of paths) for (const [f] of await matrix([fp])) await git.resetIndex({ fs, dir, filepath: f });
                    await save();
                    out('Unstaged changes for the given paths.', 'success');
                    return result;
                }
                let oid = await headOid();
                if (target && target !== 'HEAD') {
                    const back = /^HEAD(?:~(\d+)|(\^+))$/.exec(target);
                    if (back) {
                        const n = back[1] ? parseInt(back[1], 10) : back[2].length;
                        const commits = await git.log({ fs, dir, ref: 'HEAD', depth: n + 1 });
                        if (commits.length <= n) { out(`fatal: ${target}: not that many commits`, 'error'); return result; }
                        oid = commits[n].oid;
                    } else {
                        oid = target.startsWith('origin/') ? await git.resolveRef({ fs, dir, ref: `refs/remotes/${target}` }) : await git.expandOid({ fs, dir, oid: target });
                    }
                    if (branch) await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: oid, force: true });
                }
                if (opts.hard) {
                    await git.checkout({ fs, dir, ref: branch || oid, force: true });
                    result.worktreeChanged = true;
                    out(`HEAD is now at ${short(oid)}`, 'success');
                } else if (!opts.soft) {
                    for (const [fp, h, , s] of await matrix()) if (!(h === 1 && s === 1) && !(h === 0 && s === 0)) await git.resetIndex({ fs, dir, filepath: fp, ref: oid });
                    out(target ? `HEAD is now at ${short(oid)} (your files are unchanged)` : 'Unstaged all changes.', 'success');
                } else {
                    out(`HEAD is now at ${short(oid)}`, 'success');
                }
                await save();
                return result;
            }

            case 'stash': {
                const op = args[0] || 'push';
                if (!['push', 'pop', 'apply', 'list', 'drop', 'clear', 'save'].includes(op)) { out('usage: git stash [push|pop|apply|list|drop|clear]', 'error'); return result; }
                // stash only reads the author from .git/config, so fill it in from your profile if unset
                if (!(await git.getConfig({ fs, dir, path: 'user.name' }).catch(() => null))) {
                    const who = await author(dir);
                    await git.setConfig({ fs, dir, path: 'user.name', value: who.name });
                    await git.setConfig({ fs, dir, path: 'user.email', value: who.email });
                }
                const r = await git.stash({ fs, dir, op: op === 'save' ? 'push' : op, message: args.slice(1).join(' ') || undefined });
                if (op === 'list') {
                    (Array.isArray(r) ? r : []).forEach((s, i) => out(`stash@{${i}}: ${s.message || s}`));
                    return result;
                }
                result.worktreeChanged = ['push', 'pop', 'apply', 'save'].includes(op);
                await save();
                out(op === 'push' || op === 'save' ? 'Saved working directory changes to the stash.' : `stash ${op}: done`, 'success');
                return result;
            }

            case 'config': {
                const { opts, rest } = flags([{ names: ['--global'], key: 'global' }, { names: ['--list', '-l'], key: 'list' }, { names: ['--unset'], key: 'unset' }, { names: ['--local'], key: 'local' }]);
                if (opts.list) {
                    for (const [k, v] of Object.entries(globalConfig())) out(`${k}=${v}`);
                    for (const k of ['user.name', 'user.email', 'remote.origin.url']) {
                        const v = await git.getConfig({ fs, dir, path: k }).catch(() => null);
                        if (v) out(`${k}=${v}`);
                    }
                    return result;
                }
                const [key, ...valueParts] = rest;
                if (!key) { out('usage: git config [--global] <key> [<value>]', 'error'); return result; }
                if (key === 'github.token') { out('Use 🔑 Token in the terminal bar to set your access token (it is kept in this browser only).', 'warning'); return result; }
                const value = valueParts.length ? valueParts.join(' ') : undefined;
                if (opts.global) {
                    if (opts.unset) setGlobalConfig(key, undefined);
                    else if (value === undefined) out(globalConfig()[key] || '');
                    else setGlobalConfig(key, value);
                    return result;
                }
                if (opts.unset) { await git.setConfig({ fs, dir, path: key, value: undefined }); await save(); return result; }
                if (value === undefined) { out((await git.getConfig({ fs, dir, path: key })) ?? ''); return result; }
                await git.setConfig({ fs, dir, path: key, value });
                await save();
                return result;
            }

            case 'rev-parse': {
                if (args.includes('--abbrev-ref')) out((await branchName()) || 'HEAD');
                else if (args.includes('--show-toplevel')) out(`/home/project${dir === '/' ? '' : dir}`);
                else out((await git.resolveRef({ fs, dir, ref: args.find(a => !a.startsWith('-')) || 'HEAD' })) || '');
                return result;
            }

            case 'show': {
                const ref = args.find(a => !a.startsWith('-')) || 'HEAD';
                const oid = await git.resolveRef({ fs, dir, ref }).catch(() => git.expandOid({ fs, dir, oid: ref }));
                const { commit } = await git.readCommit({ fs, dir, oid });
                out(`commit ${oid}`, 'warning');
                out(`Author: ${commit.author.name} <${commit.author.email}>`);
                out(`Date:   ${new Date(commit.author.timestamp * 1000).toString()}`);
                out(`\n    ${commit.message.trim().split('\n').join('\n    ')}`);
                return result;
            }

            default:
                out(`git: '${cmd}' isn't available in the browser terminal. Run "git help" to see what is.`, 'error');
                return result;
        }
    } catch (err) {
        explain(err, out);
        await save();
        return result;
    }
}

function explain(err, out) {
    const code = err?.code;
    const status = err?.data?.statusCode;
    if (code === 'UserCanceledError' || status === 401 || status === 403) {
        out(getGitToken()
            ? 'fatal: authentication failed. Check that your token is valid and can access this repository (🔑 Token in the terminal bar).'
            : 'fatal: this repository needs sign-in (private repo, or pushing). Click 🔑 Token in the terminal bar and add an access token.', 'error');
    } else if (status === 404) {
        out('fatal: repository not found. Check the URL; private repositories also need a token (🔑 Token).', 'error');
    } else if (code === 'CheckoutConflictError') {
        out(`error: your local changes to these files would be overwritten: ${(err.data?.filepaths || []).join(', ')}`, 'error');
        out('Commit or stash them first (git commit -am "…" or git stash), or use --force to throw them away.', 'system');
    } else if (code === 'PushRejectedError') {
        out(`! [rejected] ${err.message}`, 'error');
        out('The remote has commits you don\'t have. Run "git pull" first, then push again.', 'system');
    } else if (code === 'NotFoundError') {
        out(`fatal: ${err.message}`, 'error');
    } else if (code === 'HttpError' || /fetch|network/i.test(err?.message || '')) {
        out(`fatal: couldn't reach the git server: ${err.message}`, 'error');
    } else {
        out(`error: ${err?.message || err}`, 'error');
    }
}
