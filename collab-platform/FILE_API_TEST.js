// Test script to verify file API endpoints
// Run this in the browser console while the app is running

const API_BASE = '/api/files';

// Test 1: Create a file
async function testCreateFile() {
    console.log('Test 1: Creating a file...');
    try {
        const response = await fetch(`${API_BASE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                name: 'test.js',
                path: 'src/test.js',
                projectId: 'YOUR_PROJECT_ID', // Replace with actual project ID
                isFolder: false,
                content: '// Test file\nconsole.log("Hello");'
            })
        });
        const data = await response.json();
        console.log('✓ File created:', data);
        return data._id;
    } catch (err) {
        console.error('✗ Error creating file:', err);
    }
}

// Test 2: Get all files for a project
async function testGetFiles(projectId) {
    console.log('Test 2: Getting all project files...');
    try {
        const response = await fetch(`${API_BASE}/project/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const data = await response.json();
        console.log('✓ Files retrieved:', data);
        return data;
    } catch (err) {
        console.error('✗ Error getting files:', err);
    }
}

// Test 3: Create a folder
async function testCreateFolder(projectId) {
    console.log('Test 3: Creating a folder...');
    try {
        const response = await fetch(`${API_BASE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                name: 'components',
                path: 'src/components',
                projectId: projectId,
                isFolder: true
            })
        });
        const data = await response.json();
        console.log('✓ Folder created:', data);
        return data._id;
    } catch (err) {
        console.error('✗ Error creating folder:', err);
    }
}

// Test 4: Update file content (save)
async function testSaveFile(fileId, newContent) {
    console.log('Test 4: Saving file content...');
    try {
        const response = await fetch(`${API_BASE}/${fileId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                content: newContent
            })
        });
        const data = await response.json();
        console.log('✓ File saved:', data);
    } catch (err) {
        console.error('✗ Error saving file:', err);
    }
}

// Test 5: Rename file
async function testRenameFile(fileId, newName, newPath) {
    console.log('Test 5: Renaming file...');
    try {
        const response = await fetch(`${API_BASE}/rename/${fileId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                newName: newName,
                newPath: newPath
            })
        });
        const data = await response.json();
        console.log('✓ File renamed:', data);
    } catch (err) {
        console.error('✗ Error renaming file:', err);
    }
}

// Test 6: Delete file
async function testDeleteFile(fileId) {
    console.log('Test 6: Deleting file...');
    try {
        const response = await fetch(`${API_BASE}/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const data = await response.json();
        console.log('✓ File deleted:', data);
    } catch (err) {
        console.error('✗ Error deleting file:', err);
    }
}

// Run all tests
async function runAllTests() {
    const projectId = 'YOUR_PROJECT_ID'; // Replace with actual project ID
    
    // Create a file and get its ID
    const fileId = await testCreateFile();
    
    // Get all files
    await testGetFiles(projectId);
    
    // Create a folder
    await testCreateFolder(projectId);
    
    // Save file content
    if (fileId) {
        await testSaveFile(fileId, '// Updated content\nconsole.log("Updated");');
    }
    
    // Rename file
    if (fileId) {
        await testRenameFile(fileId, 'renamed.js', 'src/renamed.js');
    }
    
    // Delete file (if you want to clean up)
    // if (fileId) {
    //     await testDeleteFile(fileId);
    // }
}

// Usage:
// Open browser console and run: runAllTests()
console.log('File API Tests ready. Run runAllTests() to test all endpoints.');
