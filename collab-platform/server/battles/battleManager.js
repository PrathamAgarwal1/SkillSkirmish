// battles/battleManager.js — real-time coding battles over Socket.IO.
//
//   ranked    matchmaking queue, rating changes
//   friend    invite link (/battle/join/<code>), no rating change
//   practice  solo, any problem, no timer pressure on rating
//
// Flow: matched → 5 s countdown → running (first to pass every hidden test wins; otherwise the most
// tests passed when time runs out, earliest first on a tie) → verifying (each player's browser
// re-runs the opponent's final code; a mismatch makes it a no-contest) → ended (ratings saved).
//
// Players' code only ever runs in browsers. The server holds the expected outputs and judges.
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Battle = require('../models/Battle');
const { PROBLEMS, byId, DURATION_MIN } = require('./problems');
const { buildTests, publicProblem, grade } = require('./judge');
const Notification = require('../models/Notification');
const { areFriends } = require('../utils/friends');

const COUNTDOWN_MS = 5000;
const RECONNECT_GRACE_MS = 60000;
const VERIFY_TIMEOUT_MS = 45000;
const SUBMIT_COOLDOWN_MS = 2500;
const MAX_CODE = 50000;
const LANGUAGES = ['python', 'javascript'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

let io = null;
const queue = new Map();      // userId -> { userId, username, socketId, rating, difficulty, since }
const matches = new Map();    // matchId -> match
const invites = new Map();    // invite code -> matchId
const activeOf = new Map();   // userId -> matchId (one live match per user)
const recentProblems = new Map(); // userId -> [problemId] (avoid repeats)

const room = (id) => `battle:${id}`;
const newId = () => crypto.randomBytes(8).toString('hex');
const newCode = () => crypto.randomBytes(4).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || newCode();

/* ── Elo ── */
const kFactor = (played) => (played < 10 ? 40 : 24);
const expectedScore = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
/** New ratings for a 2-player result. score: 1 win / 0.5 draw / 0 loss (for player a). */
function eloUpdate(a, b, score, playedA = 10, playedB = 10) {
    const ea = expectedScore(a, b);
    return [
        Math.round(a + kFactor(playedA) * (score - ea)),
        Math.round(b + kFactor(playedB) * ((1 - score) - (1 - ea)))
    ];
}

/* ── choosing a problem ── */
function pickProblem(difficulty, userIds, problemId) {
    if (problemId && byId.has(problemId)) return byId.get(problemId);
    const pool = PROBLEMS.filter(p => p.difficulty === difficulty);
    const seen = new Set(userIds.flatMap(u => recentProblems.get(String(u)) || []));
    const fresh = pool.filter(p => !seen.has(p.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
}
const remember = (userId, problemId) => {
    const list = (recentProblems.get(String(userId)) || []).filter(x => x !== problemId);
    list.unshift(problemId);
    recentProblems.set(String(userId), list.slice(0, 12));
};

/* ── match state ── */
function createMatch({ mode, difficulty, problemId, players }) {
    const problem = pickProblem(difficulty, players.map(p => p.userId), problemId);
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    const match = {
        id: newId(),
        mode,
        code: null,
        problem,
        difficulty: problem.difficulty,
        tests: buildTests(problem.id, seed),
        status: 'waiting',
        createdAt: Date.now(),
        startsAt: null,
        endsAt: null,
        timers: [],
        players: players.map(p => newPlayer(p)),
        rematch: new Set(),
        result: null
    };
    matches.set(match.id, match);
    return match;
}

const newPlayer = ({ userId, username, socketId, rating, played }) => ({
    userId: String(userId),
    username,
    socketId,
    rating: rating ?? 1200,
    played: played ?? 0,
    language: 'python',
    connected: true,
    disconnectTimer: null,
    best: { passed: 0, at: null, code: '', language: null },
    submissions: 0,
    lastSubmitAt: 0,
    solvedMs: null,
    forfeited: false,
    verified: null,
    lastTyping: 0
});

const playerOf = (match, userId) => match.players.find(p => p.userId === String(userId));
const opponentOf = (match, userId) => match.players.find(p => p.userId !== String(userId));

/** What everyone in the match may see (no code, no expected outputs). */
function publicState(match) {
    return {
        matchId: match.id,
        mode: match.mode,
        code: match.code,
        status: match.status,
        difficulty: match.difficulty,
        startsAt: match.startsAt,
        endsAt: match.endsAt,
        now: Date.now(),
        total: match.tests.length,
        players: match.players.map(p => ({
            userId: p.userId,
            username: p.username,
            rating: p.rating,
            language: p.language,
            passed: p.best.passed,
            submissions: p.submissions,
            solved: p.solvedMs != null,
            solvedMs: p.solvedMs,
            connected: p.connected,
            forfeited: p.forfeited
        })),
        result: match.result
    };
}

/** The full state for one player: adds the problem and the hidden test inputs (not outputs). */
function stateFor(match, userId) {
    const me = playerOf(match, userId);
    return {
        ...publicState(match),
        problem: publicProblem(match.problem),
        inputs: match.status === 'waiting' ? null : match.tests.map(t => t.args),
        me: me ? { language: me.language, best: { passed: me.best.passed, code: me.best.code, language: me.best.language } } : null
    };
}

const broadcast = (match) => io.to(room(match.id)).emit('battle:update', publicState(match));
const later = (match, ms, fn) => match.timers.push(setTimeout(fn, ms));
const clearTimers = (match) => { match.timers.forEach(clearTimeout); match.timers = []; };

function start(match) {
    match.status = 'countdown';
    match.startsAt = Date.now() + COUNTDOWN_MS;
    const minutes = DURATION_MIN[match.difficulty] || 15;
    match.endsAt = match.mode === 'practice' ? null : match.startsAt + minutes * 60000;
    for (const p of match.players) {
        activeOf.set(p.userId, match.id);
        remember(p.userId, match.problem.id);
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.join(room(match.id));
        io.to(p.socketId).emit('battle:matched', { matchId: match.id, mode: match.mode });
    }
    later(match, COUNTDOWN_MS, () => {
        if (match.status !== 'countdown') return;
        match.status = 'running';
        broadcast(match);
    });
    if (match.endsAt) later(match, match.endsAt - Date.now(), () => finish(match, 'time'));
    broadcast(match);
}

/* ── ending a match ── */
function decide(match, reason) {
    const [a, b] = match.players;
    if (match.mode === 'practice') {
        return { result: a.solvedMs != null ? 'solved' : 'unsolved', winner: null, reason };
    }
    if (!b) return { result: 'no-contest', winner: null, reason: 'Nobody joined' };
    const alive = match.players.filter(p => !p.forfeited);
    if (alive.length === 1) return { result: 'win', winner: alive[0].userId, reason: reason === 'forfeit' ? 'forfeit' : 'opponent left' };
    if (alive.length === 0) return { result: 'no-contest', winner: null, reason: 'Both players left' };
    const solved = match.players.filter(p => p.solvedMs != null).sort((x, y) => x.solvedMs - y.solvedMs);
    if (solved.length) return { result: 'win', winner: solved[0].userId, reason: 'solved' };
    if (a.best.passed !== b.best.passed) return { result: 'win', winner: (a.best.passed > b.best.passed ? a : b).userId, reason: 'more tests passed' };
    if (a.best.passed > 0 && a.best.at !== b.best.at) return { result: 'win', winner: (a.best.at < b.best.at ? a : b).userId, reason: 'same score, reached it first' };
    return { result: 'draw', winner: null, reason: a.best.passed ? 'same score' : 'no tests passed' };
}

function finish(match, reason) {
    if (['verifying', 'ended'].includes(match.status)) return;
    clearTimers(match);
    match.decision = decide(match, reason);
    if (match.mode === 'practice' || match.players.length < 2) return conclude(match);

    // Each player's browser re-runs the opponent's best code on the same inputs
    match.status = 'verifying';
    match.pendingVerify = new Map();
    for (const target of match.players) {
        const verifier = opponentOf(match, target.userId);
        if (!target.best.code || target.best.passed === 0 || !verifier?.connected) continue;
        const token = newId();
        match.pendingVerify.set(token, target.userId);
        io.to(verifier.socketId).emit('battle:verify', {
            matchId: match.id,
            token,
            language: target.best.language,
            code: target.best.code,
            fnName: match.problem.fn[target.best.language],
            inputs: match.tests.map(t => t.args)
        });
    }
    broadcast(match);
    if (!match.pendingVerify.size) return conclude(match);
    later(match, VERIFY_TIMEOUT_MS, () => conclude(match));
}

async function conclude(match) {
    if (match.status === 'ended') return;
    clearTimers(match);
    match.status = 'ended';
    let { result, winner, reason } = match.decision || decide(match, 'ended');
    if (match.players.some(p => p.verified === false)) {
        result = 'no-contest';
        winner = null;
        reason = "results didn't match when re-run on the other player's computer";
    }

    // Ratings (ranked only)
    const [a, b] = match.players;
    const rated = match.mode === 'ranked' && b && result !== 'no-contest';
    if (rated) {
        const score = result === 'draw' ? 0.5 : winner === a.userId ? 1 : 0;
        [a.ratingAfter, b.ratingAfter] = eloUpdate(a.rating, b.rating, score, a.played, b.played);
    }
    for (const p of match.players) if (p.ratingAfter == null) p.ratingAfter = p.rating;

    match.result = {
        result,
        winner,
        reason,
        players: match.players.map(p => ({
            userId: p.userId,
            username: p.username,
            ratingBefore: p.rating,
            ratingAfter: p.ratingAfter,
            passed: p.best.passed,
            solvedMs: p.solvedMs,
            verified: p.verified,
            submissions: p.submissions
        })),
        total: match.tests.length,
        rated
    };
    broadcast(match);
    io.to(room(match.id)).emit('battle:ended', { matchId: match.id, ...match.result });
    for (const p of match.players) if (activeOf.get(p.userId) === match.id) activeOf.delete(p.userId);
    if (match.code) invites.delete(match.code);
    // Keep the finished match around briefly for rematches and late page loads
    setTimeout(() => matches.delete(match.id), 10 * 60000);

    try { await persist(match, rated); } catch (err) { console.error('[battle] save failed:', err.message); }
}

async function persist(match, rated) {
    const { result, winner, reason } = match.result;
    if (!match.players.every(p => mongoose.Types.ObjectId.isValid(p.userId))) return;
    if (match.mode !== 'practice' && match.players.length < 2) return; // an invite nobody accepted
    await new Battle({
        problem: match.problem.id,
        difficulty: match.difficulty,
        mode: match.mode,
        players: match.players.map(p => ({
            user: p.userId,
            username: p.username,
            language: p.best.language || p.language,
            ratingBefore: p.rating,
            ratingAfter: p.ratingAfter,
            passed: p.best.passed,
            total: match.tests.length,
            solvedMs: p.solvedMs ?? undefined,
            submissions: p.submissions,
            code: (p.best.code || '').slice(0, 20000),
            verified: p.verified,
            forfeited: p.forfeited
        })),
        winner: winner || null,
        result,
        reason,
        startedAt: match.startsAt ? new Date(match.startsAt) : new Date(match.createdAt),
        endedAt: new Date()
    }).save();

    for (const p of match.players) {
        const update = {};
        if (p.solvedMs != null) update.$addToSet = { 'battle.solved': match.problem.id };
        if (rated) {
            const outcome = result === 'draw' ? 'draws' : winner === p.userId ? 'wins' : 'losses';
            update.$set = { 'battle.rating': p.ratingAfter };
            update.$inc = { 'battle.played': 1, [`battle.${outcome}`]: 1 };
        }
        if (!Object.keys(update).length) continue;
        const user = await User.findByIdAndUpdate(p.userId, update, { new: true }).select('battle');
        if (rated && user) {
            const won = winner === p.userId;
            const streak = won ? (user.battle.streak || 0) + 1 : 0;
            await User.updateOne({ _id: p.userId }, { $set: { 'battle.streak': streak, 'battle.bestStreak': Math.max(user.battle.bestStreak || 0, streak) } });
        }
    }
}

/* ── matchmaking ── */
function resolveDifficulty(a, b) {
    if (a.difficulty !== 'any') return a.difficulty;
    if (b.difficulty !== 'any') return b.difficulty;
    const avg = (a.rating + b.rating) / 2;
    return avg < 1300 ? 'easy' : avg < 1550 ? 'medium' : 'hard';
}

function tryMatchmaking() {
    const waiting = [...queue.values()].sort((x, y) => x.since - y.since);
    const used = new Set();
    for (const a of waiting) {
        if (used.has(a.userId)) continue;
        let best = null;
        for (const b of waiting) {
            if (b.userId === a.userId || used.has(b.userId)) continue;
            if (a.difficulty !== 'any' && b.difficulty !== 'any' && a.difficulty !== b.difficulty) continue;
            // The allowed rating gap widens the longer people wait
            const waited = (Date.now() - Math.min(a.since, b.since)) / 1000;
            const gap = Math.abs(a.rating - b.rating);
            if (gap > 150 + waited * 20) continue;
            if (!best || gap < Math.abs(a.rating - best.rating)) best = b;
        }
        if (!best) continue;
        used.add(a.userId);
        used.add(best.userId);
        queue.delete(a.userId);
        queue.delete(best.userId);
        start(createMatch({ mode: 'ranked', difficulty: resolveDifficulty(a, best), players: [a, best] }));
    }
    for (const q of queue.values()) {
        io.to(q.socketId).emit('battle:queue-status', { waitingFor: Math.round((Date.now() - q.since) / 1000), inQueue: queue.size });
    }
}

const loadRating = async (userId) => {
    const u = await User.findById(userId).select('username battle');
    return { username: u?.username || 'Player', rating: u?.battle?.rating ?? 1200, played: u?.battle?.played ?? 0 };
};

/* ── socket events ── */
function register(socket, { safe, ack }) {
    const userId = String(socket.userId);

    const busy = () => {
        const id = activeOf.get(userId);
        const m = id && matches.get(id);
        return m && !['ended'].includes(m.status) ? m : null;
    };

    socket.on('battle:queue', safe('battle:queue', async ({ difficulty = 'any' } = {}, cb) => {
        const reply = ack(cb);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const { username, rating, played } = await loadRating(userId);
        queue.set(userId, { userId, username, socketId: socket.id, rating, played, difficulty: [...DIFFICULTIES, 'any'].includes(difficulty) ? difficulty : 'any', since: Date.now() });
        reply({ ok: true, inQueue: queue.size });
        tryMatchmaking();
    }));

    socket.on('battle:cancel-queue', () => { if (queue.get(userId)?.socketId === socket.id) queue.delete(userId); });

    socket.on('battle:create-friend', safe('battle:create-friend', async ({ difficulty = 'easy', problemId, inviteUserId } = {}, cb) => {
        const reply = ack(cb);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        queue.delete(userId);
        const me = await loadRating(userId);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const match = createMatch({
            mode: 'friend',
            difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'easy',
            problemId: typeof problemId === 'string' ? problemId : undefined,
            players: [{ userId, socketId: socket.id, ...me }]
        });
        match.code = newCode();
        invites.set(match.code, match.id);
        activeOf.set(userId, match.id);
        socket.join(room(match.id));
        // An unanswered invite expires
        later(match, 30 * 60000, () => { if (match.status === 'waiting') { match.decision = { result: 'no-contest', reason: 'Nobody joined' }; conclude(match); } });
        reply({ ok: true, matchId: match.id, code: match.code });
        broadcast(match);

        // Challenging a friend directly: they get a notification that opens the invite
        if (inviteUserId && mongoose.Types.ObjectId.isValid(String(inviteUserId)) && await areFriends(userId, inviteUserId)) {
            const n = await new Notification({
                user: inviteUserId,
                sender: userId,
                type: 'battle',
                message: `⚔️ ${me.username} challenged you to a ${match.difficulty} code battle`,
                link: `/battle/join/${match.code}`
            }).save();
            for (const s of io.sockets.sockets.values()) if (String(s.userId) === String(inviteUserId)) s.emit('new-notification', n);
        }
    }));

    socket.on('battle:join-friend', safe('battle:join-friend', async ({ code } = {}, cb) => {
        const reply = ack(cb);
        const match = matches.get(invites.get(String(code || '').toUpperCase()));
        if (!match || match.status !== 'waiting') return reply({ error: 'This invite has expired or the battle already started' });
        if (playerOf(match, userId)) return reply({ ok: true, matchId: match.id, waiting: true });
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        queue.delete(userId);
        const rating = await loadRating(userId);
        // Re-check after the await: a double click (or a second tab) may have joined meanwhile
        if (playerOf(match, userId)) return reply({ ok: true, matchId: match.id });
        if (match.status !== 'waiting' || match.players.length >= 2) return reply({ error: 'This battle already started' });
        match.players.push(newPlayer({ userId, socketId: socket.id, ...rating }));
        socket.join(room(match.id));
        reply({ ok: true, matchId: match.id });
        start(match);
    }));

    socket.on('battle:practice', safe('battle:practice', async ({ problemId, difficulty = 'easy' } = {}, cb) => {
        const reply = ack(cb);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        queue.delete(userId);
        const rating = await loadRating(userId);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const match = createMatch({
            mode: 'practice',
            difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'easy',
            problemId: typeof problemId === 'string' ? problemId : undefined,
            players: [{ userId, socketId: socket.id, ...rating }]
        });
        reply({ ok: true, matchId: match.id });
        start(match);
    }));

    // Load (or reload) a match page: re-attaches this socket and returns the full state
    socket.on('battle:state', safe('battle:state', ({ matchId } = {}, cb) => {
        const reply = ack(cb);
        const match = matches.get(String(matchId || ''));
        if (!match) return reply({ error: 'This battle is over or does not exist' });
        const me = playerOf(match, userId);
        if (!me) return reply({ error: 'You are not in this battle' });
        me.socketId = socket.id;
        socket.join(room(match.id));
        if (!me.connected) {
            me.connected = true;
            clearTimeout(me.disconnectTimer);
            broadcast(match);
        }
        reply({ ok: true, state: stateFor(match, userId) });
    }));

    socket.on('battle:language', ({ matchId, language } = {}) => {
        const match = matches.get(String(matchId || ''));
        const me = match && playerOf(match, userId);
        if (me && LANGUAGES.includes(language) && me.language !== language) { me.language = language; broadcast(match); }
    });

    socket.on('battle:typing', ({ matchId } = {}) => {
        const match = matches.get(String(matchId || ''));
        const me = match && playerOf(match, userId);
        if (!me || match.status !== 'running' || Date.now() - me.lastTyping < 1500) return;
        me.lastTyping = Date.now();
        socket.to(room(match.id)).emit('battle:typing', { matchId: match.id, userId });
    });

    socket.on('battle:submit', safe('battle:submit', ({ matchId, language, code, outputs } = {}, cb) => {
        const reply = ack(cb);
        const match = matches.get(String(matchId || ''));
        const me = match && playerOf(match, userId);
        if (!me) return reply({ error: 'You are not in this battle' });
        if (match.status !== 'running') return reply({ error: match.status === 'countdown' ? 'The battle has not started yet' : 'The battle is over' });
        if (me.solvedMs != null) return reply({ error: 'You already solved it' });
        if (!LANGUAGES.includes(language) || typeof code !== 'string' || code.length > MAX_CODE) return reply({ error: 'Invalid submission' });
        if (!Array.isArray(outputs) || outputs.length !== match.tests.length) return reply({ error: 'Run all the tests before submitting' });
        if (Date.now() - me.lastSubmitAt < SUBMIT_COOLDOWN_MS) return reply({ error: 'Slow down a little between submissions' });
        me.lastSubmitAt = Date.now();
        me.submissions++;

        const r = grade(match.problem.id, match.tests, outputs);
        if (r.passed > me.best.passed || !me.best.code) me.best = { passed: r.passed, at: Date.now(), code, language };
        const solved = r.passed === r.total;
        if (solved) me.solvedMs = Date.now() - match.startsAt;
        reply({ ok: true, passed: r.passed, total: r.total, solved, firstFail: r.firstFail });
        broadcast(match);
        if (solved) finish(match, 'solved');
    }));

    socket.on('battle:verify-result', safe('battle:verify-result', ({ matchId, token, outputs } = {}) => {
        const match = matches.get(String(matchId || ''));
        if (!match || match.status !== 'verifying') return;
        const targetId = match.pendingVerify.get(String(token));
        if (!targetId) return;
        // Only the opponent who was asked may answer
        if (opponentOf(match, targetId)?.userId !== userId) return;
        match.pendingVerify.delete(String(token));
        const target = playerOf(match, targetId);
        const r = grade(match.problem.id, match.tests, outputs);
        target.verified = r.passed >= target.best.passed;
        if (!match.pendingVerify.size) conclude(match);
    }));

    socket.on('battle:forfeit', safe('battle:forfeit', ({ matchId } = {}) => {
        const match = matches.get(String(matchId || ''));
        const me = match && playerOf(match, userId);
        if (!me || ['verifying', 'ended'].includes(match.status)) return;
        if (match.status === 'waiting') {
            match.decision = { result: 'no-contest', reason: 'Invite cancelled' };
            return conclude(match);
        }
        me.forfeited = true;
        finish(match, 'forfeit');
    }));

    // Friendly rematch: when both players ask, a new friendly battle starts with the same difficulty
    socket.on('battle:rematch', safe('battle:rematch', ({ matchId } = {}, cb) => {
        const reply = ack(cb);
        const match = matches.get(String(matchId || ''));
        if (!match || match.status !== 'ended' || match.players.length < 2 || !playerOf(match, userId)) return reply({ error: 'Rematch is not available' });
        match.rematch.add(userId);
        io.to(room(match.id)).emit('battle:rematch', { matchId: match.id, userIds: [...match.rematch] });
        reply({ ok: true });
        if (match.rematch.size === 2 && match.players.every(p => !activeOf.has(p.userId))) {
            const next = createMatch({
                mode: match.mode === 'ranked' ? 'ranked' : 'friend',
                difficulty: match.difficulty,
                players: match.players.map(p => ({ userId: p.userId, username: p.username, socketId: p.socketId, rating: p.ratingAfter ?? p.rating, played: p.played + 1 }))
            });
            start(next);
        }
    }));

    socket.on('disconnect', () => {
        if (queue.get(userId)?.socketId === socket.id) queue.delete(userId);
        const match = matches.get(activeOf.get(userId));
        const me = match && playerOf(match, userId);
        if (!me || me.socketId !== socket.id || match.status === 'ended') return;
        me.connected = false;
        broadcast(match);
        if (match.status === 'waiting') return;
        clearTimeout(me.disconnectTimer);
        me.disconnectTimer = setTimeout(() => {
            if (me.connected || ['verifying', 'ended'].includes(match.status)) return;
            me.forfeited = true;
            finish(match, 'left');
        }, RECONNECT_GRACE_MS);
    });
}

function init(server) {
    io = server;
    setInterval(tryMatchmaking, 2000).unref();
}

const activeMatchFor = (userId) => {
    const m = matches.get(activeOf.get(String(userId)));
    return m && m.status !== 'ended' ? { matchId: m.id, mode: m.mode, status: m.status } : null;
};

const stats = () => ({ inQueue: queue.size, live: [...matches.values()].filter(m => ['countdown', 'running'].includes(m.status) && m.mode !== 'practice').length });

module.exports = { init, register, eloUpdate, expectedScore, activeMatchFor, stats, decide, LANGUAGES };
