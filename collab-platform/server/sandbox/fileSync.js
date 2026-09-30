// sandbox/fileSync.js — keeps the project's files in MongoDB (what the editor shows) and on disk
// (what the sandbox runs) in sync, in BOTH directions.
//
// Editor saves go to the DB; Jupyter, `git clone`, generators and formatters write to disk inside
// the sandbox. The old one-way DB→disk sync overwrote those disk changes on every run.
// Rule: whichever side changed last wins, and new text files created on disk are imported.
const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const { getProjectDir, resolveProjectPath } = require('../utils/access');
const { IGNORED_DIRS } = require('./runConfig');

const MAX_IMPORT_FILES = 500;
const MAX_IMPORT_BYTES = 512 * 1024;
const CLOCK_SLACK_MS = 1500;

const isProbablyText = (buf) => !buf.subarray(0, 8000).includes(0);

const listDiskFiles = (root) => {
    const out = [];
    const walk = (dir, rel) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (out.length >= 20000) return;
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.ss')) walk(path.join(dir, e.name), r);
            } else if (e.isFile() && !e.name.startsWith('.ss-')) {
                out.push(r);
            }
        }
    };
    walk(root, '');
    return out;
};

/**
 * Reconciles DB and disk for a project. Returns { toDisk, toDb, imported } counts.
 */
async function reconcileProject(projectId) {
    const root = getProjectDir(projectId);
    fs.mkdirSync(root, { recursive: true });

    const dbFiles = await File.find({ project: projectId });
    const dbByPath = new Map(dbFiles.map(f => [f.path, f]));
    const stats = { toDisk: 0, toDb: 0, imported: 0 };

    for (const file of dbFiles) {
        let full;
        try { full = resolveProjectPath(projectId, file.path); } catch { continue; }

        if (file.isFolder) {
            fs.mkdirSync(full, { recursive: true });
            continue;
        }

        let st = null;
        try { st = fs.statSync(full); } catch { /* missing on disk */ }

        const dbTime = new Date(file.updatedAt || 0).getTime();
        if (!st) {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, file.content || '');
            stats.toDisk++;
        } else if (st.mtimeMs > dbTime + CLOCK_SLACK_MS) {
            // Changed on disk (Jupyter save, formatter, git pull...) — pull it into the DB
            if (st.size <= MAX_IMPORT_BYTES) {
                const buf = fs.readFileSync(full);
                if (isProbablyText(buf)) {
                    const content = buf.toString('utf8');
                    if (content !== file.content) {
                        file.content = content;
                        await file.save();
                        stats.toDb++;
                    }
                }
            }
        } else if (dbTime > st.mtimeMs + CLOCK_SLACK_MS) {
            const content = file.content || '';
            if (fs.readFileSync(full, 'utf8') !== content) {
                fs.writeFileSync(full, content);
                stats.toDisk++;
            }
        }
    }

    // Import new text files that only exist on disk (so they show up in the explorer)
    for (const rel of listDiskFiles(root)) {
        if (stats.imported >= MAX_IMPORT_FILES) break;
        if (dbByPath.has(rel)) continue;
        const full = path.join(root, rel);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.size > MAX_IMPORT_BYTES) continue;
        const buf = fs.readFileSync(full);
        if (!isProbablyText(buf)) continue;

        // Parent folders first
        const parts = rel.split('/');
        for (let i = 1; i < parts.length; i++) {
            const folderPath = parts.slice(0, i).join('/');
            if (!dbByPath.has(folderPath)) {
                const folder = await File.findOneAndUpdate(
                    { project: projectId, path: folderPath },
                    { $setOnInsert: { name: parts[i - 1], isFolder: true, content: '' } },
                    { upsert: true, new: true }
                );
                dbByPath.set(folderPath, folder);
            }
        }
        const created = await File.findOneAndUpdate(
            { project: projectId, path: rel },
            { $setOnInsert: { name: parts[parts.length - 1], isFolder: false, content: buf.toString('utf8') } },
            { upsert: true, new: true }
        );
        dbByPath.set(rel, created);
        stats.imported++;
    }

    return stats;
}

module.exports = { reconcileProject, listDiskFiles };
