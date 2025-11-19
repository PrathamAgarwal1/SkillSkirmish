const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FileSchema = new Schema({
    name: { type: String, required: true }, // e.g., "App.js"
    path: { type: String, required: true }, // e.g., "src/App.js"
    content: { type: String, default: '' },
    isFolder: { type: Boolean, default: false },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true }
}, { timestamps: true });

FileSchema.index({ project: 1, path: 1 }, { unique: true });
module.exports = mongoose.model('File', FileSchema);