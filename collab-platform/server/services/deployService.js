// services/deployService.js — "Deploy" button: snapshot → sandboxed build → publish → health check.
//
// Every deploy is a numbered version under DEPLOY_DIR/<slug>/v<N>. Static sites are served straight
// from disk; server apps run in their own container. The previous version keeps serving until the
// new one is healthy, and any ready version can be rolled back to.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const mime = require('mime-types');
const Deployment = require('../models/Deployment');
const SiteFile = require('../models/SiteFile');
const Project = require('../models/Project');
const sandbox = require('../sandbox');
const { detectRunConfig, IGNORED_DIRS } = require('../sandbox/runConfig');
const { reconcileProject } = require('../sandbox/fileSync');
const { getProjectDir, sanitizeRelPath } = require('../utils/access');
const { decryptEnv } = require('../utils/secrets');

const { driver, config } = sandbox;
const KEEP_VERSIONS = 5;
const MAX_LOG_LINES = 400;
const building = new Set(); // projectIds with a build in progress

// Browser-mode deploys live in MongoDB, so keep them small (free Atlas clusters have 512 MB)
const MB = 1024 * 1024;
const DB_MAX_BYTES = (parseInt(process.env.DEPLOY_MAX_MB, 10) || 20) * MB;
const DB_MAX_FILE_BYTES = 8 * MB;
const DB_MAX_FILES = 3000;
const DB_KEEP_VERSIONS = parseInt(process.env.DEPLOY_KEEP_VERSIONS, 10) || 2;

/**
 * Public URL of a deployed app. Subdomains (<slug>.apps.<domain>) when a wildcard domain is set up
 * (APPS_URL_TEMPLATE, Docker mode); otherwise a path on this server: <server>/apps/<slug>/.
 */
const publicBaseUrl = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${config.SERVER_PORT}`).replace(/\/+$/, '');
const usesPathUrls = () => sandbox.getMode() === 'browser' && !process.env.APPS_URL_TEMPLATE;
const appUrl = (slug) => (usesPathUrls() ? `${publicBaseUrl()}/apps/${slug}/` : config.appUrl(slug));

const versionDir = (slug, n) => path.join(config.DEPLOY_ROOT, slug, `v${n}`);
const appContainer = (slug, n) => `ss-app-${slug}-v${n}`;

const slugify = (name) => (String(name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'app');

const uniqueSlug = async (name) => {
    for (let i = 0; i < 10; i++) {
        const slug = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
        if (!(await Deployment.exists({ slug }))) return slug;
    }
    return `app-${crypto.randomBytes(6).toString('hex')}`;
};

/** Public shape of a deployment for the client. */
const serialize = (dep) => dep && {
    slug: dep.slug,
    url: appUrl(dep.slug),
    status: dep.status,
    activeVersion: dep.activeVersion,
    gallery: {
        listed: !!dep.gallery?.listed,
        forkable: !!dep.gallery?.forkable,
        description: dep.gallery?.description || ''
    },
    views: dep.views || 0,
    likes: (dep.likes || []).length,
    forks: dep.forks || 0,
    versions: [...dep.versions].reverse().map(v => ({
        number: v.number,
        status: v.status,
        kind: v.kind,
        builder: v.builder || null,
        createdAt: v.createdAt,
        finishedAt: v.finishedAt,
        error: v.error || null,
        active: v.number === dep.activeVersion
    }))
};

const getDeployment = async (projectId) => serialize(await Deployment.findOne({ project: projectId }));

const getVersionLog = async (projectId, number) => {
    const dep = await Deployment.findOne({ project: projectId });
    const v = dep?.versions.find(x => x.number === Number(number));
    return v ? v.log : null;
};

/** Copies the project's source (no installs, caches or build output) into the version folder. */
const snapshot = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, {
        recursive: true,
        filter: (from) => {
            const base = path.basename(from);
            return !(IGNORED_DIRS.has(base) || base.startsWith('.ss-') || base === '.ss');
        }
    });
};

// Converts every notebook to HTML and writes an index page listing them.
const NOTEBOOK_BUILD_SCRIPT = `import html, pathlib, subprocess, sys
out = pathlib.Path(".ss-site"); out.mkdir(exist_ok=True)
books = sorted(p for p in pathlib.Path(".").rglob("*.ipynb") if not any(part.startswith(".") for part in p.parts))
links = []
for nb in books:
    target = "__".join(nb.with_suffix("").parts)
    subprocess.run([sys.executable, "-m", "jupyter", "nbconvert", "--to", "html", "--output-dir", str(out), "--output", target, str(nb)], check=True)
    links.append(f'<li><a href="{html.escape(target)}.html">{html.escape(str(nb))}</a></li>')
(out / "index.html").write_text(
    "<!doctype html><meta charset=utf-8><title>Notebooks</title>"
    "<body style='font-family:system-ui;max-width:720px;margin:3rem auto'><h1>Notebooks</h1><ul>" + "".join(links) + "</ul>")
print(f"Published {len(books)} notebook(s)")
`;

const waitForHttp = (port, timeoutMs = 90000) => new Promise((resolve) => {
    const started = Date.now();
    const attempt = () => {
        const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 3000 }, (res) => { res.resume(); resolve(true); });
        req.on('timeout', () => req.destroy());
        req.on('error', () => (Date.now() - started > timeoutMs ? resolve(false) : setTimeout(attempt, 1500)));
    };
    attempt();
});

const substitutePort = (cmd) => cmd.replace(/\$PORT\b/g, String(config.APP_PORT));

/**
 * Builds and publishes a new version. Returns immediately; progress streams to the project's
 * socket room as `deploy-log` / `deploy-status` events.
 */
const deployProject = async (projectId, userId, io) => {
    const id = String(projectId);
    if (sandbox.getMode() === 'browser') {
        return { success: false, browserMode: true, message: 'On this server, deploys are built in your browser. Reload the IDE and deploy again.' };
    }
    if (building.has(id)) return { success: false, message: 'A deploy is already in progress.' };

    const project = await Project.findById(id);
    if (!project) return { success: false, message: 'Project not found' };

    await reconcileProject(id);
    const projectDir = getProjectDir(id);
    const runConfig = detectRunConfig(projectDir, project.projectType);
    const plan = runConfig.deploy;
    if (!plan.kind) return { success: false, message: plan.reason || 'This project cannot be deployed yet.' };

    let dep = await Deployment.findOne({ project: id });
    if (!dep) dep = await Deployment.create({ project: id, slug: await uniqueSlug(project.name) });

    const number = (dep.versions.reduce((m, v) => Math.max(m, v.number), 0)) + 1;
    dep.versions.push({ number, status: 'building', kind: plan.kind, envId: runConfig.env, root: runConfig.root, createdBy: userId, log: [] });
    dep.status = 'building';
    await dep.save();

    building.add(id);
    // Build in the background; the HTTP request returns right away
    runBuild({ projectId: id, project, dep, number, runConfig, plan, projectDir, io })
        .catch(err => console.error('[deploy] unexpected error:', err))
        .finally(() => building.delete(id));

    return { success: true, version: number, deployment: serialize(dep) };
};

async function runBuild({ projectId, project, dep, number, runConfig, plan, projectDir, io }) {
    const room = `project:${projectId}`;
    const log = [];
    const emitLog = (line) => {
        const text = String(line).replace(/\s+$/, '');
        if (!text) return;
        log.push(text);
        if (log.length > MAX_LOG_LINES) log.shift();
        io && io.to(room).emit('deploy-log', { projectId, version: number, line: text });
    };
    const emitStatus = async () => {
        const fresh = await Deployment.findOne({ project: projectId });
        io && io.to(room).emit('deploy-status', { projectId, deployment: serialize(fresh) });
    };
    const finish = async (patch, status) => {
        const fresh = await Deployment.findOne({ project: projectId });
        const v = fresh.versions.find(x => x.number === number);
        Object.assign(v, patch, { finishedAt: new Date(), log });
        fresh.status = status;
        if (patch.status === 'ready') fresh.activeVersion = number;
        await fresh.save();
        await emitStatus();
        return fresh;
    };

    await emitStatus();
    const dir = versionDir(dep.slug, number);
    const appDir = path.join(dir, 'app');
    const env = { ...decryptEnv(project.envVars), PORT: String(config.APP_PORT), HOST: '0.0.0.0' };

    try {
        emitLog(`▶ Deploy v${number} · ${runConfig.label} · ${config.ENVIRONMENTS[runConfig.env].label}`);
        emitLog('📸 Snapshotting source...');
        snapshot(projectDir, appDir);
        if (plan.notebooks) fs.writeFileSync(path.join(appDir, '.ss-build-notebooks.py'), NOTEBOOK_BUILD_SCRIPT);

        // Install + build inside a throwaway sandbox container
        const steps = [
            ...runConfig.install.map(s => (s.dir ? `cd '${s.dir}' && ${s.cmd} && cd /workspace` : s.cmd)),
            ...(plan.build ? [`cd '/workspace/${runConfig.root}' && ${plan.build}`] : [])
        ];
        if (steps.length) {
            emitLog(`🔨 Building: ${steps.join(' && ')}`);
            const code = await driver.runBuild({
                name: `ss-build-${dep.slug}-v${number}`,
                envId: runConfig.env,
                dir: appDir,
                cmd: `set -e; ${steps.join(' && ')}`,
                env,
                onData: (chunk) => chunk.split(/\r?\n/).forEach(emitLog)
            });
            if (code !== 0) throw new Error(`Build failed (exit ${code})`);
            emitLog('✅ Build finished');
        }

        if (plan.kind === 'static') {
            const sitePath = path.join('app', runConfig.root, plan.output);
            const siteAbs = path.join(dir, sitePath);
            if (!fs.existsSync(path.join(siteAbs, 'index.html'))) {
                throw new Error(`Build output "${plan.output}" has no index.html`);
            }
            // Installs aren't needed to serve a static site
            fs.rm(path.join(appDir, 'node_modules'), { recursive: true, force: true }, () => {});
            await finish({ status: 'ready', sitePath }, 'live');
        } else {
            const start = substitutePort(plan.start);
            emitLog(`🚀 Starting: ${start}`);
            const name = appContainer(dep.slug, number);
            const port = await driver.startApp({
                name,
                envId: runConfig.env,
                dir: appDir,
                cmd: runConfig.root ? `cd '${runConfig.root}' && ${start}` : start,
                env: { ...env, NODE_ENV: 'production' },
                labels: { 'ss.slug': dep.slug, 'ss.version': String(number) }
            });
            emitLog('⏳ Waiting for the app to answer...');
            const healthy = port && await waitForHttp(port);
            if (!healthy) {
                const tail = await driver.appLogs(name, 40);
                tail.split('\n').forEach(emitLog);
                await driver.stopApp(name);
                throw new Error('The app did not start answering HTTP requests within 90 seconds');
            }
            // Switch traffic, then retire the previous server version
            const previous = dep.activeVersion;
            await finish({ status: 'ready', start }, 'live');
            if (previous && previous !== number) await driver.stopApp(appContainer(dep.slug, previous));
        }

        emitLog(`🌍 Live at ${appUrl(dep.slug)}`);
        await pruneOldVersions(projectId);
    } catch (err) {
        emitLog(`❌ ${err.message}`);
        const fresh = await Deployment.findOne({ project: projectId });
        // Keep serving the previous version if there is one
        await finish({ status: 'failed', error: err.message }, fresh.activeVersion ? 'live' : 'failed');
        fs.rm(dir, { recursive: true, force: true }, () => {});
    }
}

/** Keeps the newest KEEP_VERSIONS ready versions (plus the active one) on disk. */
async function pruneOldVersions(projectId) {
    const dep = await Deployment.findOne({ project: projectId });
    const ready = dep.versions.filter(v => v.status === 'ready').sort((a, b) => b.number - a.number);
    for (const v of ready.slice(KEEP_VERSIONS)) {
        if (v.number === dep.activeVersion) continue;
        await driver.stopApp(appContainer(dep.slug, v.number));
        fs.rm(versionDir(dep.slug, v.number), { recursive: true, force: true }, () => {});
        v.status = 'archived';
    }
    // Drop metadata beyond 20 versions
    dep.versions = dep.versions.sort((a, b) => a.number - b.number).slice(-20);
    await dep.save();
}

/**
 * Browser mode: the IDE built the site in the user's browser and uploads the output.
 * files: [{ path, data (base64) }]. Stored in MongoDB and served at appUrl(slug).
 */
const publishStatic = async (projectId, userId, { files, builder }, io) => {
    const id = String(projectId);
    if (building.has(id)) return { success: false, message: 'A deploy is already in progress.' };
    if (!Array.isArray(files) || files.length === 0) return { success: false, message: 'Nothing to publish' };
    if (files.length > DB_MAX_FILES) return { success: false, message: `Too many files (${files.length}); the limit is ${DB_MAX_FILES}.` };

    const docs = [];
    let total = 0;
    for (const f of files) {
        const rel = sanitizeRelPath(f?.path);
        if (!rel || typeof f.data !== 'string') return { success: false, message: `Invalid file: ${String(f?.path).slice(0, 80)}` };
        const data = Buffer.from(f.data, 'base64');
        if (data.length > DB_MAX_FILE_BYTES) return { success: false, message: `${rel} is larger than 8 MB` };
        total += data.length;
        if (total > DB_MAX_BYTES) return { success: false, message: `The site is larger than ${DB_MAX_BYTES / MB} MB. Remove large assets (videos, datasets) and try again.` };
        docs.push({ path: rel, data, size: data.length, contentType: mime.contentType(path.extname(rel)) || 'application/octet-stream' });
    }
    if (!docs.some(d => d.path === 'index.html')) return { success: false, message: 'The build output has no index.html' };

    const project = await Project.findById(id);
    if (!project) return { success: false, message: 'Project not found' };

    building.add(id);
    try {
        let dep = await Deployment.findOne({ project: id });
        if (!dep) dep = await Deployment.create({ project: id, slug: await uniqueSlug(project.name) });
        const number = dep.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;

        await SiteFile.deleteMany({ slug: dep.slug, version: number }); // leftovers from a failed upload
        await SiteFile.insertMany(docs.map(d => ({ ...d, slug: dep.slug, version: number })));

        const log = [`▶ Deploy v${number} · built in the browser${builder ? ` (${builder})` : ''}`,
            `📦 ${docs.length} files, ${(total / MB).toFixed(2)} MB`, `🌍 Live at ${appUrl(dep.slug)}`];
        dep.versions.push({ number, status: 'ready', kind: 'static', storage: 'db', builder, createdBy: userId, finishedAt: new Date(), log });
        dep.activeVersion = number;
        dep.status = 'live';
        await dep.save();
        await pruneDbVersions(dep);

        io && io.to(`project:${id}`).emit('deploy-status', { projectId: id, deployment: serialize(dep) });
        return { success: true, version: number, deployment: serialize(dep) };
    } finally {
        building.delete(id);
    }
};

/** Keeps the newest DB_KEEP_VERSIONS database-stored versions (plus the active one). */
async function pruneDbVersions(dep) {
    const stored = dep.versions.filter(v => v.storage === 'db' && v.status === 'ready').sort((a, b) => b.number - a.number);
    for (const v of stored.slice(DB_KEEP_VERSIONS)) {
        if (v.number === dep.activeVersion) continue;
        await SiteFile.deleteMany({ slug: dep.slug, version: v.number });
        v.status = 'archived';
    }
    dep.versions = dep.versions.sort((a, b) => a.number - b.number).slice(-20);
    await dep.save();
}

/** Makes an earlier ready version live again (also used to restart a stopped deployment). */
const rollback = async (projectId, number, io) => {
    const dep = await Deployment.findOne({ project: projectId });
    if (!dep) return { success: false, message: 'Not deployed yet' };
    const v = dep.versions.find(x => x.number === Number(number));
    const available = v && v.status === 'ready' && (v.storage === 'db'
        ? await SiteFile.exists({ slug: dep.slug, version: v.number })
        : fs.existsSync(versionDir(dep.slug, v.number)));
    if (!available) {
        return { success: false, message: 'That version is not available' };
    }

    if (v.kind === 'server') {
        const project = await Project.findById(projectId);
        const env = { ...decryptEnv(project?.envVars), PORT: String(config.APP_PORT), HOST: '0.0.0.0', NODE_ENV: 'production' };
        const name = appContainer(dep.slug, v.number);
        const port = await driver.startApp({
            name, envId: v.envId, dir: path.join(versionDir(dep.slug, v.number), 'app'),
            cmd: v.root ? `cd '${v.root}' && ${v.start}` : v.start, env,
            labels: { 'ss.slug': dep.slug, 'ss.version': String(v.number) }
        });
        if (!port || !(await waitForHttp(port))) {
            await driver.stopApp(name);
            return { success: false, message: 'That version failed to start' };
        }
        if (dep.activeVersion && dep.activeVersion !== v.number) await driver.stopApp(appContainer(dep.slug, dep.activeVersion));
    }

    dep.activeVersion = v.number;
    dep.status = 'live';
    await dep.save();
    io && io.to(`project:${projectId}`).emit('deploy-status', { projectId: String(projectId), deployment: serialize(dep) });
    return { success: true, deployment: serialize(dep) };
};

/** Takes the site offline (versions are kept so it can be restarted or rolled back). */
const stopDeployment = async (projectId, io) => {
    const dep = await Deployment.findOne({ project: projectId });
    if (!dep) return { success: false, message: 'Not deployed yet' };
    const active = dep.versions.find(x => x.number === dep.activeVersion);
    if (active?.kind === 'server') await driver.stopApp(appContainer(dep.slug, dep.activeVersion));
    dep.status = 'stopped';
    await dep.save();
    io && io.to(`project:${projectId}`).emit('deploy-status', { projectId: String(projectId), deployment: serialize(dep) });
    return { success: true, deployment: serialize(dep) };
};

/** Removes every version, container and file (project/room deletion). */
const destroyDeployment = async (projectId) => {
    const dep = await Deployment.findOne({ project: projectId });
    if (!dep) return;
    for (const v of dep.versions) {
        if (v.kind === 'server') await driver.stopApp(appContainer(dep.slug, v.number));
    }
    fs.rm(path.join(config.DEPLOY_ROOT, dep.slug), { recursive: true, force: true }, () => {});
    await SiteFile.deleteMany({ slug: dep.slug });
    await dep.deleteOne();
};

/**
 * What the app router needs to serve <slug>.apps.<domain>:
 * { type: 'static', root } | { type: 'proxy', port } | null
 */
const resolveApp = async (slug) => {
    const dep = await Deployment.findOne({ slug }).lean();
    if (!dep || dep.status !== 'live' || !dep.activeVersion) return null;
    const v = dep.versions.find(x => x.number === dep.activeVersion);
    if (!v) return null;
    if (v.storage === 'db') return { type: 'db', slug, version: v.number };
    if (v.kind === 'static') return { type: 'static', root: path.join(versionDir(slug, v.number), v.sitePath) };
    const port = await driver.getAppPort(appContainer(slug, v.number));
    return port ? { type: 'proxy', port } : null;
};

module.exports = {
    deployProject,
    publishStatic,
    appUrl,
    usesPathUrls,
    getDeployment,
    getVersionLog,
    rollback,
    stopDeployment,
    destroyDeployment,
    resolveApp,
    isBuilding: (projectId) => building.has(String(projectId))
};
