// server/models/Project.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Keep in sync with the templates in sandbox/templates.js and the client's CreateProjectModal
const PROJECT_TYPES = [
    'React App', 'MERN Stack', 'Next.js', 'Node.js API', 'Express + EJS', 'Vanilla Web',
    'Python API (FastAPI)', 'Python Script', 'Machine Learning (Jupyter)', 'Android (Expo)'
];

const ProjectSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    projectType: {
        type: String,
        required: true,
        enum: PROJECT_TYPES
    },
    room: {
        type: Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },
    members: [{ // Members from the room specifically assigned to this project
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Environment variables / secrets for runs and deployments. Values are AES-GCM encrypted
    // (utils/secrets.js) and never sent back to the client in plain text.
    envVars: [{
        _id: false,
        key: { type: String, required: true },
        value: { type: String, required: true }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema);
module.exports.PROJECT_TYPES = PROJECT_TYPES;
