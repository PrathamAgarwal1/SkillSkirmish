// utils/projectFiles.js — create files and folders in a project (MongoDB + the workspace on disk).
const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const { resolveProjectPath } = require('./access');

// Creates missing parent folders (DB + disk) for a project-relative file path.
const ensureParentFolders = async (projectId, relPath) => {
    const parts = relPath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        await File.findOneAndUpdate(
            { project: projectId, path: currentPath },
            { $setOnInsert: { name: parts[i], isFolder: true, content: '' } },
            { upsert: true }
        );
        fs.mkdirSync(resolveProjectPath(projectId, currentPath), { recursive: true });
    }
};

// Creates or overwrites a file (DB + disk).
const upsertFile = async (projectId, relPath, content) => {
    await File.findOneAndUpdate(
        { project: projectId, path: relPath },
        { $set: { name: path.posix.basename(relPath), isFolder: false, content } },
        { upsert: true }
    );
    const diskPath = resolveProjectPath(projectId, relPath);
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, content);
};

module.exports = { ensureParentFolders, upsertFile };
