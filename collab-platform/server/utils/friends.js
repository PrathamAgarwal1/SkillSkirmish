// utils/friends.js — friendship lookups shared by the friends API, battles and deploy access.
const Friendship = require('../models/Friendship');

const pairKey = (a, b) => [String(a), String(b)].sort().join('_');

const areFriends = async (a, b) => {
    if (!a || !b || String(a) === String(b)) return false;
    return !!(await Friendship.exists({ key: pairKey(a, b), status: 'accepted' }));
};

/** Ids (strings) of everyone `userId` is friends with. */
const friendIdsOf = async (userId) => {
    const rows = await Friendship.find({ users: userId, status: 'accepted' }).select('users').lean();
    return rows.map(r => String(r.users.find(u => String(u) !== String(userId))));
};

module.exports = { pairKey, areFriends, friendIdsOf };
