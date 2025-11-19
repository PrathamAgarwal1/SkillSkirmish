const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { spawn } = require('child_process');

router.post('/', auth, (req, res) => {
    const { code } = req.body;
    
    // Use 'spawn' to create an isolated process
    const nodeProcess = spawn('node', ['-e', code]);

    let output = '';
    let error = '';

    // Capture standard output
    nodeProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Capture error output
    nodeProcess.stderr.on('data', (data) => {
        error += data.toString();
    });

    // Handle process exit
    nodeProcess.on('close', (code) => {
        if (code !== 0) { // If the process crashed
            res.json({ output: error || `Process exited with code ${code}` });
        } else {
            res.json({ output: output });
        }
    });

    // Handle process errors
    nodeProcess.on('error', (err) => {
        res.json({ output: `Failed to start process: ${err.message}` });
    });
});

module.exports = router;