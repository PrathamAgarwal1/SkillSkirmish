// utils/secrets.js — encrypts project environment variables at rest (AES-256-GCM).
//
// Key: SECRETS_KEY (any long random string). Falls back to a key derived from JWT_SECRET so
// development works out of the box — set a dedicated SECRETS_KEY in production.
const crypto = require('crypto');

let warned = false;
const getKey = () => {
    const material = process.env.SECRETS_KEY || process.env.JWT_SECRET;
    if (!material) throw new Error('SECRETS_KEY (or JWT_SECRET) must be set to store project secrets');
    if (!process.env.SECRETS_KEY && !warned) {
        warned = true;
        console.warn('[secrets] SECRETS_KEY is not set — deriving the encryption key from JWT_SECRET. Set SECRETS_KEY in production.');
    }
    return crypto.createHash('sha256').update(`skillskirmish-secrets:${material}`).digest();
};

const encrypt = (plaintext) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};

const decrypt = (payload) => {
    const [version, iv, tag, data] = String(payload).split(':');
    if (version !== 'v1') throw new Error('Unknown secret format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

// Names the sandbox controls itself, or that would let a project escape its settings
const RESERVED = new Set(['PORT', 'HOST', 'HOME', 'PATH', 'PYTHONUSERBASE', 'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH']);
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const validateKey = (key) => {
    if (!KEY_RE.test(key)) return 'Names may only contain letters, digits and _ (and cannot start with a digit)';
    if (RESERVED.has(key.toUpperCase())) return `${key} is managed by the sandbox and cannot be overridden`;
    return null;
};

/** Project.envVars -> { KEY: value } (entries that fail to decrypt are skipped). */
const decryptEnv = (envVars = []) => {
    const env = {};
    for (const { key, value } of envVars) {
        try { env[key] = decrypt(value); } catch { /* key rotated or corrupted — skip */ }
    }
    return env;
};

module.exports = { encrypt, decrypt, decryptEnv, validateKey };
