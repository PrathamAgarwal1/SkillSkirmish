// runtime/git/store.js — keeps each project's .git folder in IndexedDB, so the repository (commits,
// branches, remotes) survives page reloads. The WebContainer's files only live in memory.
//
// The repository is per browser, like a local clone on your own computer: teammates share work by
// pushing to and pulling from GitHub.
import { boot } from '../webcontainer';
import { listTree } from './wcfs';

const DB = 'ss-git';
const STORE = 'files';

let dbPromise = null;
const db = () => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch((err) => { dbPromise = null; throw err; });
    }
    return dbPromise;
};

const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});

const keyFor = (projectId, path) => `${projectId}\u0000${path}`;
const rangeFor = (projectId) => IDBKeyRange.bound(`${projectId}\u0000`, `${projectId}\u0000￿`);

/** Saves the given .git paths ('w' = write current content, 'd' = delete). `all` re-saves everything. */
export async function saveRepo(projectId, changes, { all = false } = {}) {
    const wc = await boot();
    const entries = all ? (await listTree('.git')).map(p => [p, 'w']) : [...changes.entries()];
    if (!entries.length && !all) return;
    const contents = [];
    for (const [path, kind] of entries) {
        if (kind === 'd') { contents.push([path, null]); continue; }
        try { contents.push([path, await wc.fs.readFile(path)]); } catch { contents.push([path, null]); }
    }
    const tx = (await db()).transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (all) store.delete(rangeFor(projectId));
    for (const [path, data] of contents) {
        if (data) store.put(data, keyFor(projectId, path));
        else store.delete(keyFor(projectId, path));
    }
    await done(tx);
    changes.clear();
}

/** Writes the saved .git back into the WebContainer. Returns false when this project has none saved. */
export async function restoreRepo(projectId) {
    const tx = (await db()).transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([
        new Promise((res, rej) => { const r = store.getAllKeys(rangeFor(projectId)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
        new Promise((res, rej) => { const r = store.getAll(rangeFor(projectId)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })
    ]);
    if (!keys.length) return false;
    const wc = await boot();
    const made = new Set();
    for (let i = 0; i < keys.length; i++) {
        const path = String(keys[i]).split('\u0000')[1];
        const dir = path.slice(0, path.lastIndexOf('/'));
        if (dir && !made.has(dir)) { await wc.fs.mkdir(dir, { recursive: true }); made.add(dir); }
        await wc.fs.writeFile(path, values[i]);
    }
    return true;
}

/** Forgets this project's saved repository (`git init` over a fresh folder, or after deleting .git). */
export async function deleteRepo(projectId) {
    const tx = (await db()).transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(rangeFor(projectId));
    await done(tx);
}
