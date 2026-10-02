// routes/execute.js — run projects, files and terminal commands. All execution happens inside the
// project's sandbox (see sandbox/ and utils/projectRunner.js); nothing here runs user code on the host.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const runner = require('../utils/projectRunner');
const { getPackageList, isValidPackageName } = require('../utils/packageManager');
const { getProjectDir, resolveProjectPath, sanitizeRelPath, getProjectAccess, requireProjectAccess } = require('../utils/access');
const File = require('../models/File');
const Project = require('../models/Project');
const sandbox = require('../sandbox');
const { decryptEnv } = require('../utils/secrets');
const { ensureParentFolders, upsertFile } = require('../utils/projectFiles');

// Multer config for file/folder uploads (store in temp, then process)
const upload = multer({
    dest: path.join(process.cwd(), 'temp_uploads'),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const fromBody = (req) => req.body.projectId;
const fromParams = (req) => req.params.projectId;
const io = (req) => req.app.get('socketio');

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        console.error(`[execute] ${req.path}:`, err.message);
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
};

// In browser mode there is no server sandbox: the IDE runs code itself (WebContainer / Pyodide)
const serverSandboxOnly = (req, res, next) => {
    if (sandbox.getMode() !== 'browser') return next();
    res.status(409).json({ success: false, browserMode: true, message: 'Code runs in your browser on this server. Reload the IDE to switch to the in-browser runtime.' });
};
for (const route of ['/run-project', '/run-file', '/write-terminal', '/stop-process', '/run-command', '/install-package']) {
    router.post(route, serverSandboxOnly);
}

// ─── In-browser runtime support ─────────────────────────────
const MAX_SNAPSHOT_BYTES = 40 * 1024 * 1024;

// Every file of the project, to mount into the browser runtime
router.get('/snapshot/:projectId', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const docs = await File.find({ project: req.params.projectId }).select('path content isFolder').lean();
    let total = 0;
    const files = [];
    const folders = [];
    for (const d of docs) {
        if (d.isFolder) { folders.push(d.path); continue; }
        total += (d.content || '').length;
        if (total > MAX_SNAPSHOT_BYTES) return res.status(413).json({ success: false, message: 'Project is too large to run in the browser (40 MB limit).' });
        files.push({ path: d.path, content: d.content || '' });
    }
    res.json({ success: true, files, folders });
}));

// The project's environment variables, for code the member runs in their own browser
router.get('/runtime-env/:projectId', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    const project = await Project.findById(req.params.projectId).select('envVars');
    res.json({ success: true, env: decryptEnv(project?.envVars) });
}));

// ─── Run / stop the whole project ───────────────────────────
router.post('/run-project', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    res.json(await runner.runProject(req.body.projectId, { targetId: req.body.target, userId: req.user.id, io: io(req) }));
}));

// Creates the package.json (and Vite files for React) for a JavaScript project that has none. Works in
// browser mode too: the IDE then runs the project with the returned config.
router.post('/setup', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    res.json(await runner.setupProject(req.body.projectId, io(req)));
}));

router.post('/stop-project', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    res.json(await runner.stopProject(req.body.projectId, io(req)));
}));

router.get('/console-output/:projectId', auth, requireProjectAccess(fromParams), (req, res) => {
    res.json(runner.getConsoleOutput(req.params.projectId));
});

router.get('/status/:projectId', auth, requireProjectAccess(fromParams), (req, res) => {
    const status = runner.getProjectStatus(req.params.projectId);
    res.json(status.running ? { ...status, logs: runner.getConsoleOutput(req.params.projectId).logs } : status);
});

// How the project runs & deploys: environment, run targets, deploy kind
router.get('/config/:projectId', auth, requireProjectAccess(fromParams), handle(async (req, res) => {
    res.json(await runner.getRunConfig(req.params.projectId, io(req)));
}));

// Two-way file sync (e.g. pick up notebooks saved from JupyterLab)
router.post('/sync', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    res.json({ success: true, ...(await runner.syncFiles(req.body.projectId, io(req))) });
}));

// ─── Packages ───────────────────────────────────────────────
router.post('/install-package', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    const packageName = typeof req.body.packageName === 'string' ? req.body.packageName.trim() : '';
    if (!isValidPackageName(packageName)) {
        return res.status(400).json({ success: false, message: 'Invalid package name' });
    }
    res.json(await runner.installPackage(req.body.projectId, packageName, io(req)));
}));

router.get('/packages/:projectType', auth, (req, res) => {
    res.json({ packages: getPackageList(req.params.projectType) });
});

// ─── Single files & processes ──────────────────────────────
router.post('/run-file', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    res.json(await runner.runFile(req.body.projectId, req.body.filePath, req.user.id, io(req)));
}));

// Processes are addressed by id; only members of the owning project may touch them.
const requireProcessAccess = async (req, res, next) => {
    const info = runner.getProcessInfo(req.body.processId);
    if (!info) return res.json({ success: false, message: 'Process not running' });
    const access = await getProjectAccess(info.projectId, req.user.id);
    if (!access) return res.status(403).json({ success: false, message: 'Not allowed to control this process' });
    next();
};

router.post('/write-terminal', auth, requireProcessAccess, (req, res) => {
    res.json(runner.writeToProcess(req.body.processId, req.body.input));
});

router.post('/stop-process', auth, requireProcessAccess, handle(async (req, res) => {
    res.json(await runner.stopProcess(req.body.processId));
}));

// ─── Terminal commands ─────────────────────────────────────
router.post('/run-command', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    const { projectId, cwd = '' } = req.body;
    const command = typeof req.body.command === 'string' ? req.body.command.trim() : '';
    if (!command) return res.json({ success: false, output: '' });
    if (command.length > 4000) return res.status(400).json({ success: false, output: 'Command is too long' });

    const cmdLower = command.toLowerCase();

    // `cd` is handled here so the terminal keeps a working directory between commands
    if (cmdLower === 'cd' || cmdLower.startsWith('cd ')) {
        const dest = command.substring(2).trim().replace(/^["']|["']$/g, '');
        let newCwd = '';

        if (dest && dest !== '~' && dest !== '/') {
            let targetAbsolute;
            try {
                const currentAbsolute = resolveProjectPath(projectId, cwd);
                targetAbsolute = path.resolve(currentAbsolute, dest);
                resolveProjectPath(projectId, path.relative(getProjectDir(projectId), targetAbsolute));
            } catch {
                return res.json({ success: false, output: 'Cannot navigate outside project root' });
            }
            if (!fs.existsSync(targetAbsolute) || !fs.statSync(targetAbsolute).isDirectory()) {
                return res.json({ success: false, output: `No such directory: ${dest}` });
            }
            newCwd = path.relative(getProjectDir(projectId), targetAbsolute).replace(/\\/g, '/');
        }
        return res.json({ success: true, output: '', newCwd });
    }

    res.json(await runner.executeCommand(projectId, command, io(req), cwd, req.user.id));
}));

// ─── Download a folder of the project as ZIP ───────────────
router.post('/download-git-clone', auth, requireProjectAccess(fromBody), async (req, res) => {
    try {
        const { projectId, pathToClone } = req.body;
        const relPath = sanitizeRelPath(pathToClone);
        if (!relPath) {
            return res.status(400).json({ success: false, message: 'Missing or invalid pathToClone' });
        }

        const sourceDir = resolveProjectPath(projectId, relPath);
        if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
            return res.status(404).json({ success: false, message: `Directory not found: ${relPath}` });
        }

        const tempDir = path.join(process.cwd(), 'temp_uploads');
        fs.mkdirSync(tempDir, { recursive: true });
        const zipName = `${path.basename(sourceDir)}-${Date.now()}.zip`;
        const zipPath = path.join(tempDir, zipName);

        return new Promise((resolve) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 6 } });
            const fail = (message, err) => {
                console.error(`[Download] ${message}:`, err?.message);
                if (!res.headersSent) res.status(500).json({ success: false, message });
                resolve();
            };

            output.on('error', (err) => fail('Failed to write zip file', err));
            archive.on('error', (err) => fail('Failed to create archive', err));
            output.on('close', () => {
                res.download(zipPath, zipName, () => {
                    setTimeout(() => fs.rm(zipPath, { force: true }, () => {}), 2000);
                });
                resolve();
            });

            archive.pipe(output);
            archive.glob('**/*', { cwd: sourceDir, ignore: ['node_modules/**', '.pydeps/**'], dot: true }, { prefix: path.basename(sourceDir) });
            archive.finalize().catch((err) => fail('Failed to finalize archive', err));
        });
    } catch (err) {
        console.error('[Download] Unexpected error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ─── Uploads ───────────────────────────────────────────────
// Dependencies of uploaded projects install inside the sandbox on the next Run.
router.post('/upload-files', auth, upload.array('files', 100), requireProjectAccess(fromBody), async (req, res) => {
    const uploadedFiles = req.files || [];
    try {
        const { projectId } = req.body;
        if (uploadedFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        const results = [];
        for (const file of uploadedFiles) {
            // originalname contains the relative path from upload (webkitRelativePath)
            const relativePath = sanitizeRelPath(req.body[`path_${file.originalname}`] || file.originalname);
            if (!relativePath) {
                results.push({ path: file.originalname, status: 'rejected_invalid_path' });
                continue;
            }
            await ensureParentFolders(projectId, relativePath);
            await upsertFile(projectId, relativePath, fs.readFileSync(file.path, 'utf-8'));
            results.push({ path: relativePath, status: 'uploaded' });
        }

        res.json({ success: true, message: `${results.length} files uploaded`, files: results });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        // Always clean up multer temp files, even when the request is rejected
        for (const file of uploadedFiles) fs.rm(file.path, { force: true }, () => {});
    }
});

router.post('/upload-files-json', auth, requireProjectAccess(fromBody), async (req, res) => {
    try {
        const { projectId, files: fileList } = req.body;
        if (!Array.isArray(fileList) || fileList.length === 0) {
            return res.status(400).json({ success: false, message: 'No files provided' });
        }

        const results = [];
        for (const fileData of fileList) {
            const filePath = sanitizeRelPath(fileData?.filePath);
            if (!filePath) {
                results.push({ path: String(fileData?.filePath), status: 'rejected_invalid_path' });
                continue;
            }
            if (fileData.isFolder) {
                await ensureParentFolders(projectId, `${filePath}/_`);
                results.push({ path: filePath, status: 'created_folder' });
                continue;
            }
            await ensureParentFolders(projectId, filePath);
            await upsertFile(projectId, filePath, typeof fileData.content === 'string' ? fileData.content : '');
            results.push({ path: filePath, status: 'uploaded' });
        }

        res.json({ success: true, message: `${results.length} files processed`, files: results });
    } catch (err) {
        console.error('Upload JSON error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Kaggle datasets ────────────────────────────────────────
// Downloads a Kaggle dataset (or competition data) into the project. Public datasets work without
// an account; competitions need the project's KAGGLE_USERNAME / KAGGLE_KEY env vars. Done on the server because Kaggle's API doesn't allow
// browser requests, and it works in every mode. Text data files only (CSV, JSON, TXT...).
const AdmZip = require('adm-zip');
const KAGGLE_TEXT_EXTS = new Set(['.csv', '.tsv', '.json', '.jsonl', '.txt', '.md', '.xml', '.yaml', '.yml']);
const KAGGLE_MAX_ZIP = 100 * 1024 * 1024;
const KAGGLE_MAX_FILE = 15 * 1024 * 1024;
const KAGGLE_MAX_TOTAL = 40 * 1024 * 1024;

router.post('/kaggle', auth, requireProjectAccess(fromBody), handle(async (req, res) => {
    const { projectId } = req.body;
    const source = String(req.body.source || '').trim()
        .replace(/^https?:\/\/(www\.)?kaggle\.com\//, '').replace(/^datasets\//, '').replace(/\/+$/, '');
    const isCompetition = req.body.kind === 'competition' || source.startsWith('competitions/') || source.startsWith('c/');
    const name = source.replace(/^(competitions|c)\//, '');
    if (isCompetition ? !/^[a-z0-9-]{1,100}$/i.test(name) : !/^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/i.test(name)) {
        return res.status(400).json({ success: false, message: 'Use a dataset like "owner/dataset-name" or a competition like "competitions/titanic".' });
    }
    const dest = sanitizeRelPath(req.body.dest || 'data') || 'data';

    const project = await Project.findById(projectId).select('envVars');
    const env = decryptEnv(project?.envVars);
    const hasCredentials = env.KAGGLE_USERNAME && env.KAGGLE_KEY;
    if (isCompetition && !hasCredentials) {
        return res.status(400).json({ success: false, message: 'Competition data needs a Kaggle account: add KAGGLE_USERNAME and KAGGLE_KEY in Deploy → Environment (kaggle.com → Settings → Create New Token).' });
    }

    const url = isCompetition
        ? `https://www.kaggle.com/api/v1/competitions/data/download-all/${encodeURIComponent(name)}`
        : `https://www.kaggle.com/api/v1/datasets/download/${name.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {
        headers: hasCredentials ? { Authorization: 'Basic ' + Buffer.from(`${env.KAGGLE_USERNAME}:${env.KAGGLE_KEY}`).toString('base64') } : {},
        redirect: 'follow'
    });
    if (!response.ok) {
        const hint = response.status === 401 ? (hasCredentials ? 'Kaggle rejected the credentials.' : 'This dataset needs a Kaggle account: add KAGGLE_USERNAME and KAGGLE_KEY in Deploy → Environment.')
            : response.status === 403 ? 'Access denied. For competitions, accept the rules on kaggle.com first.'
            : response.status === 404 ? 'Dataset not found.' : `Kaggle returned ${response.status}.`;
        return res.status(400).json({ success: false, message: hint });
    }
    if (Number(response.headers.get('content-length')) > KAGGLE_MAX_ZIP) {
        return res.status(413).json({ success: false, message: 'That dataset is larger than 100 MB, which is too big to import.' });
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > KAGGLE_MAX_ZIP) return res.status(413).json({ success: false, message: 'That dataset is larger than 100 MB, which is too big to import.' });

    const imported = [];
    const skipped = [];
    let total = 0;
    const isZip = buf.subarray(0, 2).toString() === 'PK';
    const entries = isZip
        ? new AdmZip(buf).getEntries().filter(e => !e.isDirectory).map(e => ({ name: e.entryName, size: e.header.size, read: () => e.getData() }))
        : [{ name: `${name.split('/').pop()}.csv`, size: buf.length, read: () => buf }];

    for (const entry of entries) {
        const rel = sanitizeRelPath(`${dest}/${entry.name}`);
        if (!rel || !KAGGLE_TEXT_EXTS.has(path.extname(rel).toLowerCase())) { skipped.push(`${entry.name} (not a text data file)`); continue; }
        if (entry.size > KAGGLE_MAX_FILE || total + entry.size > KAGGLE_MAX_TOTAL) { skipped.push(`${entry.name} (too large)`); continue; }
        total += entry.size;
        await ensureParentFolders(projectId, rel);
        await upsertFile(projectId, rel, entry.read().toString('utf8'));
        imported.push(rel);
    }
    req.app.get('socketio')?.to(`project:${projectId}`).emit('files-changed', { projectId: String(projectId) });
    res.json({ success: true, imported, skipped });
}));

module.exports = router;
