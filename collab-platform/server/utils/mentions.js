// utils/mentions.js — finds @username mentions of room members in a chat message.

// "@name" at the start or after a non-word character; usernames are letters, digits, _ . -
const MENTION_RE = /(^|[^\w@])@([A-Za-z0-9_.-]{2,40})/g;

/** Lower-cased usernames mentioned in `text` (outside code blocks), without duplicates. */
const parseMentions = (text) => {
    const withoutCode = String(text || '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ');
    const names = new Set();
    for (const m of withoutCode.matchAll(MENTION_RE)) names.add(m[2].replace(/[.-]+$/, '').toLowerCase());
    return [...names].filter(n => n.length >= 2);
};

/** Room members (User docs with _id/username) whose usernames are mentioned, excluding the sender. */
const resolveMentions = (text, members, senderId) => {
    const names = new Set(parseMentions(text));
    if (!names.size) return [];
    return members.filter(u => u && names.has(String(u.username || '').toLowerCase()) && String(u._id) !== String(senderId));
};

module.exports = { parseMentions, resolveMentions };
