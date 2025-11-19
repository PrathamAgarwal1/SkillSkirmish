// server/models/Project.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
        enum: ['React App', 'Node.js API', 'Static HTML/CSS', 'Python Script'] // Add more types as needed
    },
    room: {
        type: Schema.Types.ObjectId,
        ref: 'Room',
        required: true
    },
    members: [{ // Members from the room specifically assigned to this project
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema);