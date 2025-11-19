const fs = require('fs').promises;
const path = require('path');
const File = require('../models/File');

// Defines the file structure for a new "React App"
const templates = {
    'React App': [
        { name: 'package.json', path: 'package.json', templateFile: 'package.json' },
        { name: 'public', path: 'public', isFolder: true },
        { name: 'index.html', path: 'public/index.html', templateFile: 'index.html' },
        { name: 'src', path: 'src', isFolder: true },
        { name: 'App.js', path: 'src/App.js', templateFile: 'App.js' },
        { name: 'App.css', path: 'src/App.css', templateFile: 'App.css' },
        { name: 'index.js', path: 'src/index.js', templateFile: 'index.js' }
    ]
    // We can add 'Node.js API', etc. here later
};

const createProjectFiles = async (projectType, projectId) => {
    const template = templates[projectType];
    if (!template) {
        // Fallback for non-template projects
        await new File({
            name: 'index.js',
            path: 'index.js',
            content: '// Your code here',
            project: projectId,
        }).save();
        return;
    }

    // Loop through the template and create each file/folder in the DB
    for (const item of template) {
        let content = '';
        if (item.templateFile) {
            // Read the content from the corresponding template file in /server/project-templates
            try {
                content = await fs.readFile(
                    path.join(__dirname, `../project-templates/react-app/${item.templateFile}`),
                    'utf-8'
                );
            } catch (readErr) {
                console.warn(`Warning: Could not read template file ${item.templateFile}. Creating empty file.`);
                content = '// File not found, created empty.';
            }
        }

        const newFile = new File({
            name: item.name,
            path: item.path,
            isFolder: item.isFolder || false,
            content: content,
            project: projectId
        });
        await newFile.save();
    }
};

module.exports = { createProjectFiles };