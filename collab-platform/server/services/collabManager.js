/**
 * collabManager.js
 * 
 * Manages in-memory Yjs documents for real-time collaborative editing.
 * Each file gets its own Y.Doc, keyed by `projectId:fileId`.
 * 
 * Responsibilities:
 * - Create/destroy Y.Doc instances
 * - Apply binary updates from clients
 * - Encode full state for new joiners
 * - Track connected users per document
 * - Auto-persist dirty documents to MongoDB every 30s
 */

const Y = require('yjs');
const { encodeStateAsUpdate, encodeStateVector, applyUpdate } = require('yjs');
const File = require('../models/File');

// In-memory store: docKey -> { ydoc, users: Set<socketId>, dirty: boolean, lastContent: string }
const activeDocs = new Map();

// User presence per project: projectId -> Map<socketId, { userId, username, activeFileId }>
const projectPresence = new Map();

/**
 * Get or create a Yjs document for a specific file.
 * If the doc doesn't exist, initialize it with content from MongoDB.
 */
async function getOrCreateDoc(projectId, fileId, initialContent = '') {
    const docKey = `${projectId}:${fileId}`;

    if (activeDocs.has(docKey)) {
        return activeDocs.get(docKey);
    }

    // Create new Y.Doc
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');

    // Initialize with content from DB (or provided initial content)
    if (initialContent) {
        ydoc.transact(() => {
            ytext.insert(0, initialContent);
        });
    }

    const docEntry = {
        ydoc,
        users: new Set(),
        dirty: false,
        docKey
    };

    activeDocs.set(docKey, docEntry);

    // Mark dirty on any local update (from client sync)
    ydoc.on('update', () => {
        docEntry.dirty = true;
    });

    return docEntry;
}

/**
 * Get the full Yjs state as a binary update (for new joiners).
 */
function getFullState(docKey) {
    const entry = activeDocs.get(docKey);
    if (!entry) return null;
    return encodeStateAsUpdate(entry.ydoc);
}

/**
 * Get the state vector (for incremental sync).
 */
function getStateVector(docKey) {
    const entry = activeDocs.get(docKey);
    if (!entry) return null;
    return encodeStateVector(entry.ydoc);
}

/**
 * Apply a binary update from a client to the server-side Y.Doc.
 */
function applyClientUpdate(docKey, update) {
    const entry = activeDocs.get(docKey);
    if (!entry) return;
    applyUpdate(entry.ydoc, new Uint8Array(update));
}

/**
 * Add a user to a document's user set.
 */
function addUserToDoc(docKey, socketId) {
    const entry = activeDocs.get(docKey);
    if (entry) {
        entry.users.add(socketId);
    }
}

/**
 * Remove a user from a document's user set.
 * Returns true if the document has no more users (can be cleaned up).
 */
function removeUserFromDoc(docKey, socketId) {
    const entry = activeDocs.get(docKey);
    if (!entry) return false;

    entry.users.delete(socketId);
    return entry.users.size === 0;
}

/**
 * Get current user count for a document.
 */
function getDocUserCount(docKey) {
    const entry = activeDocs.get(docKey);
    return entry ? entry.users.size : 0;
}

/**
 * Persist a Y.Doc's content back to MongoDB.
 */
async function persistDoc(docKey) {
    const entry = activeDocs.get(docKey);
    if (!entry || !entry.dirty) return;

    const [projectId, fileId] = docKey.split(':');
    const ytext = entry.ydoc.getText('monaco');
    const content = ytext.toString();

    try {
        await File.findByIdAndUpdate(fileId, { content });
        entry.dirty = false;
        console.log(`[collab] Persisted doc ${docKey}`);
    } catch (err) {
        console.error(`[collab] Error persisting doc ${docKey}:`, err.message);
    }
}

/**
 * Persist and remove a document from memory.
 */
async function removeDoc(docKey) {
    await persistDoc(docKey);
    const entry = activeDocs.get(docKey);
    if (entry) {
        entry.ydoc.destroy();
        activeDocs.delete(docKey);
        console.log(`[collab] Removed doc ${docKey} from memory`);
    }
}

/**
 * Get the current text content of a document (for save operations).
 */
function getDocContent(docKey) {
    const entry = activeDocs.get(docKey);
    if (!entry) return null;
    return entry.ydoc.getText('monaco').toString();
}

// --- PRESENCE TRACKING ---

/**
 * Register a user's presence in a project.
 */
function addUserToProject(projectId, socketId, userId, username) {
    if (!projectPresence.has(projectId)) {
        projectPresence.set(projectId, new Map());
    }
    projectPresence.get(projectId).set(socketId, {
        userId,
        username,
        activeFileId: null,
        activeFileName: null
    });
}

/**
 * Remove a user from a project's presence.
 */
function removeUserFromProject(projectId, socketId) {
    const presence = projectPresence.get(projectId);
    if (presence) {
        presence.delete(socketId);
        if (presence.size === 0) {
            projectPresence.delete(projectId);
        }
    }
}

/**
 * Update which file a user is currently editing.
 */
function setUserActiveFile(projectId, socketId, fileId, fileName) {
    const presence = projectPresence.get(projectId);
    if (presence && presence.has(socketId)) {
        const user = presence.get(socketId);
        user.activeFileId = fileId;
        user.activeFileName = fileName;
    }
}

/**
 * Get all currently active users in a project.
 */
function getProjectPresence(projectId) {
    const presence = projectPresence.get(projectId);
    if (!presence) return [];

    const users = [];
    for (const [socketId, info] of presence.entries()) {
        users.push({
            socketId,
            userId: info.userId,
            username: info.username,
            activeFileId: info.activeFileId,
            activeFileName: info.activeFileName
        });
    }
    return users;
}

/**
 * Clean up all documents and presence for a socket (on disconnect).
 */
async function cleanupSocket(socketId) {
    // Remove from all documents
    const docsToRemove = [];
    for (const [docKey, entry] of activeDocs.entries()) {
        if (entry.users.has(socketId)) {
            entry.users.delete(socketId);
            if (entry.users.size === 0) {
                docsToRemove.push(docKey);
            }
        }
    }

    // Persist and remove empty docs
    for (const docKey of docsToRemove) {
        await removeDoc(docKey);
    }

    // Remove from all project presence
    for (const [projectId, presence] of projectPresence.entries()) {
        if (presence.has(socketId)) {
            presence.delete(socketId);
            if (presence.size === 0) {
                projectPresence.delete(projectId);
            }
        }
    }

    return docsToRemove;
}

/**
 * Get all active doc keys (for debugging/monitoring).
 */
function getActiveDocs() {
    const result = [];
    for (const [docKey, entry] of activeDocs.entries()) {
        result.push({
            docKey,
            userCount: entry.users.size,
            dirty: entry.dirty
        });
    }
    return result;
}

// --- AUTO-SAVE TIMER ---
// Persist all dirty documents every 30 seconds
const AUTO_SAVE_INTERVAL = 30000;
let autoSaveTimer = null;

function startAutoSave() {
    if (autoSaveTimer) return;
    autoSaveTimer = setInterval(async () => {
        for (const [docKey, entry] of activeDocs.entries()) {
            if (entry.dirty) {
                await persistDoc(docKey);
            }
        }
    }, AUTO_SAVE_INTERVAL);
    console.log('[collab] Auto-save started (every 30s)');
}

function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

// Start auto-save on module load
startAutoSave();

module.exports = {
    getOrCreateDoc,
    getFullState,
    getStateVector,
    applyClientUpdate,
    addUserToDoc,
    removeUserFromDoc,
    getDocUserCount,
    persistDoc,
    removeDoc,
    getDocContent,
    addUserToProject,
    removeUserFromProject,
    setUserActiveFile,
    getProjectPresence,
    cleanupSocket,
    getActiveDocs,
    startAutoSave,
    stopAutoSave
};
