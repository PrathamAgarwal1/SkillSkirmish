// utils/templateManager.js — writes a project type's starter files to the DB and disk.
//
// Dependencies are NOT installed here (that used to run `npm install` on the host, unsandboxed,
// and block the create-project request for minutes). They install inside the sandbox on first run.
const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const { TEMPLATES } = require('../sandbox/templates');
const { resolveProjectPath } = require('./access');

/** All folder paths implied by a file path ("a/b/c.js" -> ["a", "a/b"]). */
const parentFolders = (filePath) => {
    const parts = filePath.split('/');
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
};

/**
 * Creates (or restores) the template files for a project. Existing files with the same path are
 * overwritten with the template version; other files are left alone.
 */
const createProjectFiles = async (projectType, projectId) => {
    const template = TEMPLATES[projectType] || [{ path: 'index.js', content: '// Your code here\n' }];

    const folders = new Set(template.flatMap(f => parentFolders(f.path)));
    for (const folder of folders) {
        await File.findOneAndUpdate(
            { project: projectId, path: folder },
            { $setOnInsert: { name: path.posix.basename(folder), isFolder: true, content: '' } },
            { upsert: true }
        );
        fs.mkdirSync(resolveProjectPath(projectId, folder), { recursive: true });
    }

    for (const item of template) {
        await File.findOneAndUpdate(
            { project: projectId, path: item.path },
            { $set: { name: path.posix.basename(item.path), isFolder: false, content: item.content } },
            { upsert: true }
        );
        const full = resolveProjectPath(projectId, item.path);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, item.content);
    }
};

module.exports = { createProjectFiles, TEMPLATE_TYPES: Object.keys(TEMPLATES) };
