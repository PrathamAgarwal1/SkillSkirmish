// models/Deployment.js — one per project: its public URL (slug) and deployed versions.
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VersionSchema = new Schema({
    number: { type: Number, required: true },
    // archived = pruned from disk to save space (only the newest versions are kept)
    status: { type: String, enum: ['building', 'ready', 'failed', 'archived'], default: 'building' },
    kind: { type: String, enum: ['static', 'server'] },
    // disk: files under DEPLOY_DIR (Docker mode); db: SiteFile documents (browser mode)
    storage: { type: String, enum: ['disk', 'db'], default: 'disk' },
    // what built it in browser mode, e.g. "Vite (in browser)"
    builder: String,
    envId: String,
    // static: folder (relative to the version dir) that is served; server: the start command
    sitePath: String,
    start: String,
    root: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    finishedAt: Date,
    error: String,
    log: [String]
}, { _id: false });

const DeploymentSchema = new Schema({
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ['idle', 'building', 'live', 'failed', 'stopped'], default: 'idle' },
    activeVersion: { type: Number, default: null },
    versions: [VersionSchema]
}, { timestamps: true });

module.exports = mongoose.model('Deployment', DeploymentSchema);
