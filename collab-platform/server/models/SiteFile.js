// models/SiteFile.js — one file of a static deploy stored in MongoDB (browser mode, where the
// server's disk may be temporary, e.g. free hosting on Render).
const mongoose = require('mongoose');

const SiteFileSchema = new mongoose.Schema({
    slug: { type: String, required: true },
    version: { type: Number, required: true },
    path: { type: String, required: true },
    contentType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true }
});

SiteFileSchema.index({ slug: 1, version: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('SiteFile', SiteFileSchema);
