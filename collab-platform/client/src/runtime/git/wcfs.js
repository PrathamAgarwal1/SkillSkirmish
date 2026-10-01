// runtime/git/wcfs.js — a Node-style fs for isomorphic-git, on top of the WebContainer's file system.
//
// The WebContainer API has no stat(), so stat is worked out from the parent folder's listing.
// Modification times aren't available either: every file reports "changed just now", which makes
// isomorphic-git compare file contents (hashes) instead of trusting timestamps. Slower on huge
// repos, but always correct.
//
// Writes and deletes under .git/ are recorded so the repository can be saved to IndexedDB afterwards.
import { boot } from '../webcontainer';

// "/a/./b/../c/" -> "a/c"; the workdir itself is "."
const toRel = (p) => {
    const out = [];
    for (const seg of String(p).replace(/\\/g, '/').split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') out.pop(); else out.push(seg);
    }
    return out.length ? out.join('/') : '.';
};
const parentOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.');
const baseOf = (rel) => rel.slice(rel.lastIndexOf('/') + 1);

const fsError = (code, path, cause) => {
    const err = new Error(`${code}: ${cause?.message || code}, '${path}'`);
    err.code = code;
    return err;
};
// WebContainer errors are plain Errors whose message starts with the errno name
const asFsError = (err, path) => {
    if (err?.code) return err;
    const m = /\b(ENOENT|EEXIST|ENOTDIR|EISDIR|ENOTEMPTY|EACCES|EPERM)\b/.exec(err?.message || '');
    return fsError(m ? m[1] : 'EIO', path, err);
};

const makeStats = (type) => {
    const now = Date.now();
    const dir = type === 'dir';
    return {
        type,
        mode: dir ? 0o40000 : 0o100644,
        size: 0,
        ino: 0,
        uid: 1,
        gid: 1,
        dev: 1,
        mtimeMs: now,
        ctimeMs: now,
        mtime: new Date(now),
        ctime: new Date(now),
        isFile: () => !dir,
        isDirectory: () => dir,
        isSymbolicLink: () => false
    };
};

/**
 * Creates the fs. `changes` collects .git paths written ('w') or deleted ('d') since it was last
 * cleared, for saving the repository.
 */
export function createWcFs() {
    const changes = new Map();
    // Any repository's .git (the project's, or one cloned into a subfolder)
    const track = (rel, kind) => { if (/(^|\/)\.git(\/|$)/.test(rel)) changes.set(rel, kind); };

    const stat = async (path) => {
        const rel = toRel(path);
        const wc = await boot();
        if (rel === '.') return makeStats('dir');
        let entries;
        try {
            entries = await wc.fs.readdir(parentOf(rel), { withFileTypes: true });
        } catch (err) {
            // The parent is missing (or is a file): either way this path doesn't exist
            const e = asFsError(err, path);
            throw e.code === 'ENOTDIR' ? e : fsError('ENOENT', path);
        }
        const entry = entries.find(e => e.name === baseOf(rel));
        if (!entry) throw fsError('ENOENT', path);
        return makeStats(entry.isDirectory() ? 'dir' : 'file');
    };

    const promises = {
        async readFile(path, opts) {
            const encoding = typeof opts === 'string' ? opts : opts?.encoding;
            const wc = await boot();
            try {
                return encoding ? await wc.fs.readFile(toRel(path), 'utf-8') : await wc.fs.readFile(toRel(path));
            } catch (err) {
                throw asFsError(err, path);
            }
        },
        async writeFile(path, data, opts) {
            const rel = toRel(path);
            const wc = await boot();
            const encoding = typeof opts === 'string' ? opts : opts?.encoding;
            try {
                if (typeof data === 'string') await wc.fs.writeFile(rel, data, { encoding: encoding || 'utf-8' });
                else await wc.fs.writeFile(rel, data instanceof Uint8Array ? data : new Uint8Array(data));
            } catch (err) {
                throw asFsError(err, path);
            }
            track(rel, 'w');
        },
        async unlink(path) {
            const rel = toRel(path);
            await stat(path); // ENOENT when missing, like Node
            const wc = await boot();
            try { await wc.fs.rm(rel); } catch (err) { throw asFsError(err, path); }
            track(rel, 'd');
        },
        async readdir(path) {
            const wc = await boot();
            try { return await wc.fs.readdir(toRel(path)); } catch (err) { throw asFsError(err, path); }
        },
        async mkdir(path) {
            const rel = toRel(path);
            let exists = true;
            try { await stat(path); } catch { exists = false; }
            if (exists) throw fsError('EEXIST', path);
            const wc = await boot();
            try { await wc.fs.mkdir(rel, { recursive: true }); } catch (err) { throw asFsError(err, path); }
        },
        async rmdir(path) {
            const rel = toRel(path);
            const wc = await boot();
            let entries;
            try { entries = await wc.fs.readdir(rel); } catch (err) { throw asFsError(err, path); }
            if (entries.length) throw fsError('ENOTEMPTY', path);
            try { await wc.fs.rm(rel, { recursive: true }); } catch (err) { throw asFsError(err, path); }
            track(rel, 'd');
        },
        stat,
        lstat: stat,
        async readlink(path) { throw fsError('EINVAL', path); },
        async symlink(_target, path) { throw fsError('EPERM', path); },
        async chmod() { /* permissions aren't tracked */ }
    };

    return { fs: { promises }, changes };
}

/** Recursively removes a path (used for `git clone` cleanup after a failed clone). */
export async function removeTree(path) {
    const wc = await boot();
    await wc.fs.rm(toRel(path), { recursive: true, force: true }).catch(() => {});
}

/** All files under a folder (relative paths), for saving .git. */
export async function listTree(dir) {
    const wc = await boot();
    const out = [];
    const walk = async (rel) => {
        let entries;
        try { entries = await wc.fs.readdir(rel, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = `${rel}/${e.name}`;
            if (e.isDirectory()) await walk(p);
            else out.push(p);
        }
    };
    await walk(toRel(dir));
    return out;
}

export { toRel };
