// battles/battleManager.js — real-time battles over Socket.IO, for every mode in battles/catalog.js.
//
// Match modes:  ranked (queue, rating changes) · friend (invite link) · practice (solo) · daily (solo,
//               CodeGuessr daily challenge, one scored attempt per day)
//
// Three engines share the lifecycle (waiting → countdown → running → [verifying] → ended):
//   code    task / debug / algo — browsers run the code on hidden inputs, the server judges outputs
//   css     browsers render the HTML/CSS and score it against the target picture
//   rounds  guessr / quiz — the server sends rounds, scores guesses and reveals answers
//
// Code and CSS scores are re-checked at the end by the other player's browser (a mismatch makes the
// battle a no-contest). Round modes are judged entirely on the server.
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Battle = require('../models/Battle');
const Notification = require('../models/Notification');
const DailyResult = require('../models/DailyResult');
const { areFriends } = require('../utils/friends');
const catalog = require('./catalog');
const { buildTests, publicChallenge, grade, rngFrom } = require('./judge');
const rounds = require('./rounds');
const { targetImage, palette } = require('./rasterize');

const COUNTDOWN_MS = 5000;
const RECONNECT_GRACE_MS = 60000;
const VERIFY_TIMEOUT_MS = 45000;
const SUBMIT_COOLDOWN_MS = 2500;
const REVEAL_MS = 7000;          // how long a revealed round stays up in duels
const LOCK_IN_MS = 15000;        // CodeGuessr: once someone guesses, the other has this long
const CSS_SOLVED = 98.5;         // % match that counts as solved (ends the race); edges of curves never match 100%
const MAX_CODE = 50000;
const LANGUAGES = ['python', 'javascript', 'sql'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const ENGINE = { task: 'code', debug: 'code', algo: 'code', css: 'css', guessr: 'rounds', quiz: 'rounds' };

let io = null;
const queue = new Map();          // userId -> { userId, username, socketId, rating, played, kind, difficulty, skill, since }
const matches = new Map();        // matchId -> match
const invites = new Map();        // invite code -> matchId
const activeOf = new Map();       // userId -> matchId (one live match per user)
const recent = new Map();         // userId -> recently played content ids (avoid repeats)

const room = (id) => `battle:${id}`;
const newId = () => crypto.randomBytes(8).toString('hex');
const newCode = () => crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X');
const today = () => new Date().toISOString().slice(0, 10);
const seedOf = (text) => crypto.createHash('sha256').update(text).digest().readUInt32LE(0);

/* ── Elo ── */
const kFactor = (played) => (played < 10 ? 40 : 24);
const expectedScore = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
function eloUpdate(a, b, score, playedA = 10, playedB = 10) {
    const ea = expectedScore(a, b);
    return [
        Math.round(a + kFactor(playedA) * (score - ea)),
        Math.round(b + kFactor(playedB) * ((1 - score) - (1 - ea)))
    ];
}

/* ── content ── */
const pickFresh = (pool, userIds, keyOf) => {
    const seen = new Set(userIds.flatMap(u => recent.get(String(u)) || []));
    const fresh = pool.filter(x => !seen.has(keyOf(x)));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
};
const remember = (userId, key) => {
    const list = (recent.get(String(userId)) || []).filter(x => x !== key);
    list.unshift(key);
    recent.set(String(userId), list.slice(0, 20));
};

/**
 * Quiz duels draw from the question bank: unseen by every player, aimed at their average skill rating
 * (their assessed rating in that skill, or 1200). Re-run when a friend joins an invite.
 */
async function prepareQuiz(match, rng) {
    const ids = match.players.map(p => p.userId);
    const users = await User.find({ _id: { $in: ids } }).select('skills').lean().catch(() => []);
    match.skillRatings = {};
    for (const id of ids) {
        const s = users.find(u => String(u._id) === id)?.skills?.find(k => k.name.toLowerCase() === match.skill.toLowerCase() && k.elo != null);
        match.skillRatings[id] = s?.elo ?? 1200;
    }
    const target = Math.round(Object.values(match.skillRatings).reduce((a, b) => a + b, 0) / Math.max(1, ids.length));
    match.rounds = await rounds.bankQuizRounds(rng, { userIds: ids, skill: match.skill, target, count: rounds.QUIZ_ROUNDS });
}

/** Records each player's answer on a bank question (its rating learns) and marks it as seen. */
function recordQuizRound(match, r, results) {
    const id = r.prompt?.questionId;
    if (!id) return;
    const bank = require('../questions/bank');
    const played = results.filter(res => playerOf(match, res.userId)?.connected || res.guess);
    bank.markSeen(played.map(res => res.userId), { _id: id, skill: match.skill }).catch(() => {});
    const answers = played.map(res => ({
        questionId: id,
        userRating: match.skillRatings?.[res.userId] ?? 1200,
        score: res.detail?.right ? 1 : 0,
        timeMs: res.guess ? Math.max(0, (match.round.guesses.get(res.userId)?.at || 0) - match.round.startedAt) : r.limitMs
    }));
    // One after another: both players' answers update the same question document
    (async () => {
        for (const a of answers) await bank.recordAnswer(a);
    })().catch(err => console.warn('[battle] could not record a quiz answer:', err.message));
}

/** Fills in what the match is about, based on its kind. */
async function prepare(match, { contentId }) {
    const engine = ENGINE[match.kind];
    const userIds = match.players.map(p => p.userId);
    if (engine === 'code') {
        const pool = catalog.codePool(match.kind, match.difficulty);
        const ch = (contentId && catalog.codeChallenge(match.kind, contentId)) ||
            pickFresh(pool.length ? pool : catalog.codePool(match.kind), userIds, c => `${c.kind}:${c.id}`);
        match.challenge = ch;
        match.difficulty = ch.difficulty;
        match.contentKey = `${ch.kind}:${ch.id}`;
        match.tests = await buildTests(ch, crypto.randomBytes(4).readUInt32LE(0));
        match.publicChallenge = await publicChallenge(ch);
        match.durationMs = (catalog.DURATION_MIN[match.kind]?.[ch.difficulty] || 15) * 60000;
    } else if (engine === 'css') {
        const pool = catalog.cssPool(match.difficulty);
        const t = (contentId && catalog.cssTarget(contentId)) || pickFresh(pool.length ? pool : catalog.cssPool(), userIds, x => `css:${x.id}`);
        match.target = t;
        match.difficulty = t.difficulty;
        match.contentKey = `css:${t.id}`;
        match.durationMs = (catalog.DURATION_MIN.css[t.difficulty] || 10) * 60000;
    } else {
        const solo = ['practice', 'daily'].includes(match.mode);
        const seed = match.mode === 'daily' ? seedOf(`daily:${match.day}`) : crypto.randomBytes(4).readUInt32LE(0);
        const rng = rngFrom(seed);
        if (match.kind === 'quiz') await prepareQuiz(match, rng);
        else match.rounds = rounds.guessrRounds(rng, solo ? rounds.SOLO_ROUNDS : rounds.MAX_DUEL_ROUNDS);
        match.contentKey = match.kind === 'quiz' ? `quiz:${match.skill}` : `guessr:${match.mode}`;
        match.durationMs = null;
        match.round = null;
        match.history = [];
    }
}

function newPlayer({ userId, username, socketId, rating, played }) {
    return {
        userId: String(userId),
        username,
        socketId,
        rating: rating ?? 1200,
        played: played ?? 0,
        connected: true,
        disconnectTimer: null,
        forfeited: false,
        verified: null,
        lastTyping: 0,
        // code / css
        language: null,
        best: { passed: 0, score: 0, at: null, code: '', language: null },
        submissions: 0,
        lastSubmitAt: 0,
        solvedMs: null,
        // rounds
        hp: rounds.START_HP,
        points: 0
    };
}

async function createMatch({ kind, mode, difficulty, skill, contentId, players, day }) {
    const match = {
        id: newId(),
        kind,
        engine: ENGINE[kind],
        mode,
        code: null,
        difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : null,
        skill: kind === 'quiz' ? (catalog.SKILLS.includes(skill) ? skill : catalog.SKILLS[0]) : null,
        day: day || null,
        status: 'waiting',
        createdAt: Date.now(),
        startsAt: null,
        endsAt: null,
        timers: [],
        players: players.map(newPlayer),
        rematch: new Set(),
        result: null
    };
    await prepare(match, { contentId });
    for (const p of match.players) p.language = defaultLanguage(match);
    matches.set(match.id, match);
    return match;
}

const defaultLanguage = (match) => (match.engine === 'code' ? (match.challenge.languages.includes('python') ? 'python' : match.challenge.languages[0]) : null);
const playerOf = (match, userId) => match.players.find(p => p.userId === String(userId));
const opponentOf = (match, userId) => match.players.find(p => p.userId !== String(userId));
const duel = (match) => match.players.length > 1;
const totalTests = (match) => match.tests?.length || 0;

/* ── what clients see ── */
function contentSummary(match) {
    if (match.engine === 'code') return { title: match.challenge.title, difficulty: match.difficulty };
    if (match.engine === 'css') return { title: match.target.title, difficulty: match.difficulty };
    return { title: match.kind === 'quiz' ? `${match.skill} quiz` : 'CodeGuessr', rounds: match.rounds.length };
}

function publicState(match) {
    const round = match.round && {
        index: match.round.index,
        type: match.rounds[match.round.index].type,
        endsAt: match.round.endsAt,
        multiplier: match.round.multiplier,
        guessed: [...match.round.guesses.keys()],
        revealed: !!match.round.revealed
    };
    return {
        matchId: match.id,
        kind: match.kind,
        engine: match.engine,
        mode: match.mode,
        code: match.code,
        status: match.status,
        difficulty: match.difficulty,
        skill: match.skill,
        content: contentSummary(match),
        startsAt: match.startsAt,
        endsAt: match.endsAt,
        now: Date.now(),
        total: match.engine === 'code' ? totalTests(match) : match.engine === 'rounds' ? match.rounds.length : 100,
        round,
        players: match.players.map(p => ({
            userId: p.userId,
            username: p.username,
            rating: p.rating,
            language: p.language,
            passed: p.best.passed,
            score: match.engine === 'css' ? p.best.score : p.points,
            hp: p.hp,
            submissions: p.submissions,
            solved: p.solvedMs != null,
            solvedMs: p.solvedMs,
            connected: p.connected,
            forfeited: p.forfeited
        })),
        result: match.result
    };
}

/** Full state for one player: the content they need (problem + inputs, target picture, current round). */
function stateFor(match, userId) {
    const me = playerOf(match, userId);
    const state = { ...publicState(match), me: me ? { language: me.language, best: { passed: me.best.passed, score: me.best.score, code: me.best.code, language: me.best.language } } : null };
    if (match.engine === 'code') {
        state.problem = match.publicChallenge;
        state.inputs = match.status === 'waiting' ? null : match.tests.map(t => t.args);
    } else if (match.engine === 'css') {
        state.target = { id: match.target.id, title: match.target.title, difficulty: match.target.difficulty, image: targetImage(match.target), palette: palette(match.target), width: 400, height: 300 };
    } else {
        state.map = match.kind === 'guessr' ? mapData() : null;
        state.history = match.history;
        if (match.round && match.status === 'running') {
            const r = match.rounds[match.round.index];
            state.prompt = { index: match.round.index, ...r.prompt, limitMs: r.limitMs };
            state.myGuess = match.round.guesses.get(String(userId))?.guess || null;
            if (match.round.revealed) state.reveal = match.history[match.history.length - 1] || null;
        }
    }
    return state;
}

let mapCache = null;
const mapData = () => (mapCache ??= {
    width: rounds.MAP.width,
    height: rounds.MAP.height,
    regions: rounds.REGIONS,
    languages: rounds.LANGUAGES.map(l => ({ id: l.id, name: l.name, region: l.region, x: l.x, y: l.y }))
});

const broadcast = (match) => io.to(room(match.id)).emit('battle:update', publicState(match));
const later = (match, ms, fn) => match.timers.push(setTimeout(fn, Math.max(0, ms)));
const clearTimers = (match) => { match.timers.forEach(clearTimeout); match.timers = []; };

function start(match) {
    match.status = 'countdown';
    match.startsAt = Date.now() + COUNTDOWN_MS;
    // Practice and the daily challenge have no overall clock (round modes time each round instead)
    match.endsAt = match.durationMs && !['practice', 'daily'].includes(match.mode) ? match.startsAt + match.durationMs : null;
    for (const p of match.players) {
        activeOf.set(p.userId, match.id);
        remember(p.userId, match.contentKey);
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.join(room(match.id));
        io.to(p.socketId).emit('battle:matched', { matchId: match.id, mode: match.mode, kind: match.kind });
    }
    later(match, COUNTDOWN_MS, () => {
        if (match.status !== 'countdown') return;
        match.status = 'running';
        if (match.engine === 'rounds') startRound(match, 0);
        else broadcast(match);
    });
    if (match.endsAt) later(match, match.endsAt - Date.now(), () => finish(match, 'time'));
    broadcast(match);
}

/* ── round engine (guessr, quiz) ── */
function startRound(match, index) {
    const r = match.rounds[index];
    const now = Date.now();
    match.round = {
        index,
        startedAt: now,
        endsAt: now + r.limitMs,
        guesses: new Map(),
        revealed: false,
        multiplier: match.kind === 'guessr' && duel(match) ? rounds.multiplierFor(index) : 1,
        timer: null
    };
    scheduleRoundEnd(match);
    io.to(room(match.id)).emit('battle:round', {
        matchId: match.id,
        index,
        total: match.rounds.length,
        prompt: { index, ...r.prompt, limitMs: r.limitMs },
        endsAt: match.round.endsAt,
        multiplier: match.round.multiplier,
        now
    });
    broadcast(match);
}

function scheduleRoundEnd(match) {
    clearTimeout(match.round.timer);
    match.round.timer = setTimeout(() => endRound(match), Math.max(0, match.round.endsAt - Date.now()));
    match.timers.push(match.round.timer);
}

function guess(match, player, payload) {
    const round = match.round;
    if (!round || round.revealed) return { error: 'This round is over' };
    if (Number(payload.round) !== round.index) return { error: 'That round is over' };
    if (round.guesses.has(player.userId)) return { error: 'You already locked in' };
    const r = match.rounds[round.index];
    const scored = rounds.scoreGuess(r, payload.guess, Date.now() - round.startedAt);
    if (!scored) return { error: 'Invalid guess' };
    round.guesses.set(player.userId, { guess: payload.guess, ...scored, at: Date.now() });

    // CodeGuessr duels: the first lock-in starts a short countdown for everyone else
    const alive = match.players.filter(p => !p.forfeited);
    if (match.kind === 'guessr' && duel(match) && round.guesses.size === 1 && round.endsAt - Date.now() > LOCK_IN_MS) {
        round.endsAt = Date.now() + LOCK_IN_MS;
        scheduleRoundEnd(match);
    }
    io.to(room(match.id)).emit('battle:guessed', { matchId: match.id, index: round.index, userId: player.userId, endsAt: round.endsAt });
    if (alive.every(p => round.guesses.has(p.userId) || !p.connected)) endRound(match);
    return { ok: true };
}

function endRound(match) {
    const round = match.round;
    if (!round || round.revealed || match.status !== 'running') return;
    round.revealed = true;
    clearTimeout(round.timer);
    const r = match.rounds[round.index];
    const results = match.players.map(p => {
        const g = round.guesses.get(p.userId);
        return { userId: p.userId, guess: g?.guess ?? null, score: g?.score ?? 0, detail: g?.detail ?? null, damage: 0 };
    });

    if (match.kind === 'guessr' && duel(match)) {
        const [a, b] = results;
        const diff = Math.round(Math.abs(a.score - b.score) * round.multiplier);
        const loser = a.score > b.score ? b : b.score > a.score ? a : null;
        if (loser && diff) {
            loser.damage = diff;
            const p = playerOf(match, loser.userId);
            p.hp = Math.max(0, p.hp - diff);
        }
    }
    for (const res of results) {
        const p = playerOf(match, res.userId);
        p.points += res.score;
        res.hp = p.hp;
        res.points = p.points;
    }
    const entry = { index: round.index, type: r.type, prompt: r.prompt, answer: r.answer, multiplier: round.multiplier, results };
    match.history.push(entry);
    if (match.kind === 'quiz') recordQuizRound(match, r, results);
    io.to(room(match.id)).emit('battle:reveal', { matchId: match.id, ...entry });

    const last = round.index + 1 >= match.rounds.length;
    const knockedOut = match.kind === 'guessr' && duel(match) && match.players.some(p => p.hp <= 0);
    broadcast(match);
    if (last || knockedOut) {
        later(match, 2500, () => finish(match, knockedOut ? 'knockout' : 'rounds'));
        return;
    }
    // Duels move on automatically; solo players click "Next" (or it moves on after a while)
    const solo = !duel(match);
    later(match, solo ? 60000 : REVEAL_MS, () => nextRound(match, round.index));
}

function nextRound(match, fromIndex) {
    if (match.status !== 'running' || !match.round || match.round.index !== fromIndex || !match.round.revealed) return;
    startRound(match, fromIndex + 1);
}

/* ── deciding and ending ── */
function decide(match, reason) {
    const [a, b] = match.players;
    const engine = match.engine || ENGINE[match.kind] || 'code';
    if (['practice', 'daily'].includes(match.mode)) {
        if (engine === 'rounds') return { result: 'finished', winner: null, reason: `${a.points.toLocaleString('en-US')} points` };
        if (engine === 'css') return { result: a.best.score >= CSS_SOLVED ? 'solved' : 'unsolved', winner: null, reason };
        return { result: a.solvedMs != null ? 'solved' : 'unsolved', winner: null, reason };
    }
    if (!b) return { result: 'no-contest', winner: null, reason: 'Nobody joined' };
    const alive = match.players.filter(p => !p.forfeited);
    if (alive.length === 1) return { result: 'win', winner: alive[0].userId, reason: reason === 'forfeit' ? 'forfeit' : 'opponent left' };
    if (alive.length === 0) return { result: 'no-contest', winner: null, reason: 'Both players left' };

    if (engine === 'rounds') {
        if (match.kind === 'guessr') {
            if (a.hp !== b.hp) return { result: 'win', winner: (a.hp > b.hp ? a : b).userId, reason: a.hp <= 0 || b.hp <= 0 ? 'knockout' : 'more health left' };
            return { result: 'draw', winner: null, reason: 'same health' };
        }
        if (a.points !== b.points) return { result: 'win', winner: (a.points > b.points ? a : b).userId, reason: 'more points' };
        return { result: 'draw', winner: null, reason: 'same score' };
    }
    if (engine === 'css') {
        const solved = match.players.filter(p => p.solvedMs != null).sort((x, y) => x.solvedMs - y.solvedMs);
        if (solved.length) return { result: 'win', winner: solved[0].userId, reason: `matched ${CSS_SOLVED}%+ first` };
        if (Math.abs(a.best.score - b.best.score) >= 0.1) return { result: 'win', winner: (a.best.score > b.best.score ? a : b).userId, reason: 'closer match' };
        if (a.best.score > 0 && a.best.at !== b.best.at) return { result: 'win', winner: (a.best.at < b.best.at ? a : b).userId, reason: 'same match, reached it first' };
        return { result: 'draw', winner: null, reason: 'same match' };
    }
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
    if (match.engine === 'rounds' || !duel(match)) return conclude(match);

    // Each player's browser re-checks the opponent's best code / CSS
    match.status = 'verifying';
    match.pendingVerify = new Map();
    for (const target of match.players) {
        const verifier = opponentOf(match, target.userId);
        const scored = match.engine === 'css' ? target.best.score > 0 : target.best.passed > 0;
        if (!target.best.code || !scored || !verifier?.connected) continue;
        const token = newId();
        match.pendingVerify.set(token, target.userId);
        io.to(verifier.socketId).emit('battle:verify', {
            matchId: match.id,
            token,
            engine: match.engine,
            language: target.best.language,
            code: target.best.code,
            ...(match.engine === 'code'
                ? { fnName: match.challenge.fn[target.best.language], inputs: match.tests.map(t => t.args), harness: match.challenge.harness, schema: match.challenge.schema, signature: { params: match.challenge.params, returns: match.challenge.returns, wide: !!match.challenge.wide } }
                : { image: targetImage(match.target) })
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
        reason = "results didn't match when re-checked on the other player's computer";
    }

    const [a, b] = match.players;
    const rated = match.mode === 'ranked' && !!b && result !== 'no-contest';
    if (rated) {
        const score = result === 'draw' ? 0.5 : winner === a.userId ? 1 : 0;
        [a.ratingAfter, b.ratingAfter] = eloUpdate(a.rating, b.rating, score, a.played, b.played);
    }
    for (const p of match.players) if (p.ratingAfter == null) p.ratingAfter = p.rating;

    match.result = {
        result,
        winner,
        reason,
        kind: match.kind,
        players: match.players.map(p => ({
            userId: p.userId,
            username: p.username,
            ratingBefore: p.rating,
            ratingAfter: p.ratingAfter,
            passed: p.best.passed,
            score: match.engine === 'css' ? p.best.score : p.points,
            hp: p.hp,
            solvedMs: p.solvedMs,
            verified: p.verified,
            submissions: p.submissions
        })),
        total: match.engine === 'code' ? totalTests(match) : match.engine === 'rounds' ? match.rounds.length : 100,
        rated,
        // After the battle: the reference CSS for the target
        solution: match.engine === 'css' ? match.target.solution : undefined
    };

    // Daily challenge: the first finished attempt of the day counts
    if (match.mode === 'daily') {
        try { match.result.daily = await saveDaily(match); } catch (err) { console.error('[battle] daily save failed:', err.message); }
    }

    broadcast(match);
    io.to(room(match.id)).emit('battle:ended', { matchId: match.id, ...match.result });
    for (const p of match.players) if (activeOf.get(p.userId) === match.id) activeOf.delete(p.userId);
    if (match.code) invites.delete(match.code);
    setTimeout(() => matches.delete(match.id), 10 * 60000);

    try { await persist(match, rated); } catch (err) { console.error('[battle] save failed:', err.message); }
}

async function saveDaily(match) {
    const p = match.players[0];
    if (!mongoose.Types.ObjectId.isValid(p.userId)) return null;
    const exists = await DailyResult.exists({ user: p.userId, date: match.day });
    if (exists) return { counted: false, score: p.points };
    await DailyResult.create({ user: p.userId, username: p.username, date: match.day, score: p.points, rounds: match.history.map(h => ({ type: h.type, score: h.results[0].score })) });
    // Streak: consecutive days with a daily result
    const user = await User.findById(p.userId).select('battle.dailyStreak battle.lastDaily');
    const yesterday = new Date(Date.parse(`${match.day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const streak = user?.battle?.lastDaily === yesterday ? (user.battle.dailyStreak || 0) + 1 : 1;
    await User.updateOne({ _id: p.userId }, { $set: { 'battle.dailyStreak': streak, 'battle.lastDaily': match.day } });
    const rank = (await DailyResult.countDocuments({ date: match.day, score: { $gt: p.points } })) + 1;
    return { counted: true, score: p.points, rank, streak };
}

async function persist(match, rated) {
    const { result, winner, reason } = match.result;
    if (!match.players.every(p => mongoose.Types.ObjectId.isValid(p.userId))) return;
    if (!['practice', 'daily'].includes(match.mode) && match.players.length < 2) return; // an invite nobody accepted
    const problem = match.engine === 'code' ? match.challenge.id : match.engine === 'css' ? match.target.id : match.kind === 'quiz' ? match.skill : 'rounds';
    await new Battle({
        kind: match.kind,
        problem,
        skill: match.skill || undefined,
        difficulty: match.difficulty || undefined,
        mode: match.mode,
        players: match.players.map(p => ({
            user: p.userId,
            username: p.username,
            language: p.best.language || p.language || undefined,
            ratingBefore: p.rating,
            ratingAfter: p.ratingAfter,
            passed: p.best.passed,
            total: match.engine === 'code' ? totalTests(match) : undefined,
            score: match.engine === 'css' ? p.best.score : match.engine === 'rounds' ? p.points : undefined,
            hp: match.kind === 'guessr' && duel(match) ? p.hp : undefined,
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
        if (p.solvedMs != null) update.$addToSet = { 'battle.solved': match.contentKey };
        if (rated) {
            const outcome = result === 'draw' ? 'draws' : winner === p.userId ? 'wins' : 'losses';
            const base = `battle.modes.${match.kind}`;
            update.$set = { [`${base}.rating`]: p.ratingAfter };
            update.$inc = { [`${base}.played`]: 1, [`${base}.${outcome}`]: 1 };
            if (match.kind === 'algo') {
                // Keep the original single (algorithm) rating in step for older clients
                update.$set['battle.rating'] = p.ratingAfter;
                Object.assign(update.$inc, { 'battle.played': 1, [`battle.${outcome}`]: 1 });
            }
        }
        if (!Object.keys(update).length) continue;
        const user = await User.findByIdAndUpdate(p.userId, update, { new: true }).select('battle');
        if (rated && user) {
            const stats = user.battle?.modes?.[match.kind] || {};
            const streak = winner === p.userId ? (stats.streak || 0) + 1 : 0;
            await User.updateOne({ _id: p.userId }, {
                $set: {
                    [`battle.modes.${match.kind}.streak`]: streak,
                    [`battle.modes.${match.kind}.bestStreak`]: Math.max(stats.bestStreak || 0, streak)
                }
            });
        }
    }
    if (rated && match.kind === 'quiz') await nudgeSkills(match, winner, result);
}

/** Quiz duels also move the players' assessed skill rating a little (only skills they already have). */
async function nudgeSkills(match, winner, result) {
    const users = await User.find({ _id: { $in: match.players.map(p => p.userId) } }).select('skills');
    const skillOf = (u) => u?.skills?.find(s => s.name.toLowerCase() === match.skill.toLowerCase() && s.elo != null);
    const [ua, ub] = match.players.map(p => users.find(u => String(u._id) === p.userId));
    const sa = skillOf(ua);
    const sb = skillOf(ub);
    if (!sa && !sb) return;
    const ra = sa?.elo ?? 1200;
    const rb = sb?.elo ?? 1200;
    const score = result === 'draw' ? 0.5 : winner === match.players[0].userId ? 1 : 0;
    const ea = expectedScore(ra, rb);
    const K = 12;
    for (const [user, skill, delta] of [[ua, sa, K * (score - ea)], [ub, sb, K * ((1 - score) - (1 - ea))]]) {
        if (!user || !skill) continue;
        const change = Math.round(delta);
        if (!change) continue;
        skill.elo += change;
        skill.history.push({ eloChange: change, newElo: skill.elo, questionId: `quiz-duel:${match.id}` });
        await user.save();
    }
}

/* ── matchmaking ── */
const statsOf = async (userId, kind) => {
    const u = await User.findById(userId).select('username battle').lean();
    const m = u?.battle?.modes?.[kind];
    const legacy = kind === 'algo' ? { rating: u?.battle?.rating, played: u?.battle?.played } : {};
    return { username: u?.username || 'Player', rating: m?.played ? m.rating : legacy.rating ?? m?.rating ?? 1200, played: m?.played ?? legacy.played ?? 0 };
};

const compatible = (a, b) => a.kind === b.kind &&
    (a.kind === 'quiz' ? a.skill === b.skill : (a.difficulty === 'any' || b.difficulty === 'any' || a.difficulty === b.difficulty));

function resolveDifficulty(a, b) {
    if (a.difficulty && a.difficulty !== 'any') return a.difficulty;
    if (b.difficulty && b.difficulty !== 'any') return b.difficulty;
    const avg = (a.rating + b.rating) / 2;
    return avg < 1300 ? 'easy' : avg < 1550 ? 'medium' : 'hard';
}

async function tryMatchmaking() {
    const waiting = [...queue.values()].sort((x, y) => x.since - y.since);
    const used = new Set();
    for (const a of waiting) {
        if (used.has(a.userId)) continue;
        let best = null;
        for (const b of waiting) {
            if (b.userId === a.userId || used.has(b.userId) || !compatible(a, b)) continue;
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
        try {
            start(await createMatch({ kind: a.kind, mode: 'ranked', difficulty: resolveDifficulty(a, best), skill: a.skill, players: [a, best] }));
        } catch (err) {
            console.error('[battle] could not start a match:', err.message);
        }
    }
    for (const q of queue.values()) {
        const same = [...queue.values()].filter(x => x.kind === q.kind).length;
        io.to(q.socketId).emit('battle:queue-status', { waitingFor: Math.round((Date.now() - q.since) / 1000), inQueue: same });
    }
}

/* ── socket events ── */
function register(socket, { safe, ack }) {
    const userId = String(socket.userId);
    const validKind = (k) => (catalog.KIND_IDS.includes(k) ? k : null);

    const busy = () => {
        const id = activeOf.get(userId);
        const m = id && matches.get(id);
        return m && m.status !== 'ended' ? m : null;
    };
    const findMine = (matchId) => {
        const match = matches.get(String(matchId || ''));
        return match ? { match, me: playerOf(match, userId) } : { match: null, me: null };
    };

    socket.on('battle:queue', safe('battle:queue', async ({ kind = 'guessr', difficulty = 'any', skill } = {}, cb) => {
        const reply = ack(cb);
        if (!validKind(kind)) return reply({ error: 'Unknown battle type' });
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const stats = await statsOf(userId, kind);
        queue.set(userId, {
            userId, socketId: socket.id, ...stats, kind,
            difficulty: [...DIFFICULTIES, 'any'].includes(difficulty) ? difficulty : 'any',
            skill: kind === 'quiz' ? (catalog.SKILLS.includes(skill) ? skill : catalog.SKILLS[0]) : null,
            since: Date.now()
        });
        reply({ ok: true, inQueue: [...queue.values()].filter(x => x.kind === kind).length });
        tryMatchmaking();
    }));

    socket.on('battle:cancel-queue', () => { if (queue.get(userId)?.socketId === socket.id) queue.delete(userId); });

    socket.on('battle:create-friend', safe('battle:create-friend', async ({ kind = 'guessr', difficulty = 'easy', skill, problemId, inviteUserId } = {}, cb) => {
        const reply = ack(cb);
        if (!validKind(kind)) return reply({ error: 'Unknown battle type' });
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        queue.delete(userId);
        const me = await statsOf(userId, kind);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const match = await createMatch({ kind, mode: 'friend', difficulty, skill, contentId: typeof problemId === 'string' ? problemId : undefined, players: [{ userId, socketId: socket.id, ...me }] });
        match.code = newCode();
        invites.set(match.code, match.id);
        activeOf.set(userId, match.id);
        socket.join(room(match.id));
        later(match, 30 * 60000, () => { if (match.status === 'waiting') { match.decision = { result: 'no-contest', reason: 'Nobody joined' }; conclude(match); } });
        reply({ ok: true, matchId: match.id, code: match.code });
        broadcast(match);

        if (inviteUserId && mongoose.Types.ObjectId.isValid(String(inviteUserId)) && await areFriends(userId, inviteUserId)) {
            const label = catalog.KINDS[kind].name;
            const n = await new Notification({
                user: inviteUserId,
                sender: userId,
                type: 'battle',
                message: `⚔️ ${me.username} challenged you to a ${label} battle${kind === 'quiz' ? ` (${match.skill})` : match.difficulty ? ` (${match.difficulty})` : ''}`,
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
        const stats = await statsOf(userId, match.kind);
        if (playerOf(match, userId)) return reply({ ok: true, matchId: match.id });
        if (match.status !== 'waiting' || match.players.length >= 2) return reply({ error: 'This battle already started' });
        const p = newPlayer({ userId, socketId: socket.id, ...stats });
        p.language = defaultLanguage(match);
        match.players.push(p);
        socket.join(room(match.id));
        // Quiz questions were picked for the host alone; pick again so neither player has seen them
        if (match.kind === 'quiz') {
            await prepareQuiz(match, rngFrom(crypto.randomBytes(4).readUInt32LE(0))).catch(err => console.warn('[battle] quiz re-pick failed:', err.message));
            if (match.status !== 'waiting' || !playerOf(match, userId)) return reply({ error: 'This battle is no longer available' });
        }
        reply({ ok: true, matchId: match.id });
        start(match);
    }));

    // Solo: any mode, any content (practice), or today's CodeGuessr challenge (daily)
    socket.on('battle:practice', safe('battle:practice', async ({ kind = 'guessr', problemId, difficulty, skill, daily } = {}, cb) => {
        const reply = ack(cb);
        if (!validKind(kind)) return reply({ error: 'Unknown battle type' });
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        queue.delete(userId);
        const stats = await statsOf(userId, kind);
        if (busy()) return reply({ error: 'You are already in a battle', matchId: busy().id });
        const isDaily = !!daily && kind === 'guessr';
        const alreadyPlayed = isDaily ? !!(await DailyResult.exists({ user: userId, date: today() })) : false;
        const match = await createMatch({
            kind,
            mode: isDaily ? 'daily' : 'practice',
            difficulty,
            skill,
            day: isDaily ? today() : null,
            contentId: typeof problemId === 'string' ? problemId : undefined,
            players: [{ userId, socketId: socket.id, ...stats }]
        });
        reply({ ok: true, matchId: match.id, alreadyPlayed });
        start(match);
    }));

    socket.on('battle:state', safe('battle:state', ({ matchId } = {}, cb) => {
        const reply = ack(cb);
        const { match, me } = findMine(matchId);
        if (!match) return reply({ error: 'This battle is over or does not exist' });
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
        const { match, me } = findMine(matchId);
        if (!me || match.engine !== 'code' || !match.challenge.languages.includes(language) || me.language === language) return;
        me.language = language;
        broadcast(match);
    });

    socket.on('battle:typing', ({ matchId } = {}) => {
        const { match, me } = findMine(matchId);
        if (!me || match.status !== 'running' || Date.now() - me.lastTyping < 1500) return;
        me.lastTyping = Date.now();
        socket.to(room(match.id)).emit('battle:typing', { matchId: match.id, userId });
    });

    // Code: { language, code, outputs }   CSS: { code, score }
    socket.on('battle:submit', safe('battle:submit', ({ matchId, language, code, outputs, score } = {}, cb) => {
        const reply = ack(cb);
        const { match, me } = findMine(matchId);
        if (!me) return reply({ error: 'You are not in this battle' });
        if (match.engine === 'rounds') return reply({ error: 'Use guesses in this mode' });
        if (match.status !== 'running') return reply({ error: match.status === 'countdown' ? 'The battle has not started yet' : 'The battle is over' });
        if (me.solvedMs != null) return reply({ error: 'You already solved it' });
        if (typeof code !== 'string' || code.length > MAX_CODE) return reply({ error: 'Invalid submission' });
        if (Date.now() - me.lastSubmitAt < SUBMIT_COOLDOWN_MS) return reply({ error: 'Slow down a little between submissions' });
        me.lastSubmitAt = Date.now();

        if (match.engine === 'css') {
            const s = Math.round(Number(score) * 10) / 10;
            if (!Number.isFinite(s) || s < 0 || s > 100) return reply({ error: 'Invalid score' });
            me.submissions++;
            if (s > me.best.score || !me.best.code) me.best = { ...me.best, score: s, at: Date.now(), code, language: 'html' };
            const solved = s >= CSS_SOLVED;
            if (solved) me.solvedMs = Date.now() - match.startsAt;
            reply({ ok: true, score: s, best: me.best.score, solved });
            broadcast(match);
            if (solved) finish(match, 'solved');
            return;
        }

        if (!match.challenge.languages.includes(language)) return reply({ error: 'Invalid language for this challenge' });
        if (!Array.isArray(outputs) || outputs.length !== match.tests.length) return reply({ error: 'Run all the tests before submitting' });
        me.submissions++;
        const r = grade(match.challenge, match.tests, outputs);
        if (r.passed > me.best.passed || !me.best.code) me.best = { ...me.best, passed: r.passed, at: Date.now(), code, language };
        const solved = r.passed === r.total;
        if (solved) me.solvedMs = Date.now() - match.startsAt;
        reply({ ok: true, passed: r.passed, total: r.total, solved, firstFail: r.firstFail });
        broadcast(match);
        if (solved) finish(match, 'solved');
    }));

    socket.on('battle:guess', safe('battle:guess', ({ matchId, round, guess: g } = {}, cb) => {
        const reply = ack(cb);
        const { match, me } = findMine(matchId);
        if (!me) return reply({ error: 'You are not in this battle' });
        if (match.engine !== 'rounds' || match.status !== 'running') return reply({ error: 'Not accepting guesses right now' });
        reply(guess(match, me, { round, guess: g }));
    }));

    // Solo rounds: move on when the player is ready
    socket.on('battle:next', ({ matchId } = {}) => {
        const { match, me } = findMine(matchId);
        if (!me || duel(match) || match.engine !== 'rounds' || !match.round?.revealed) return;
        nextRound(match, match.round.index);
    });

    socket.on('battle:verify-result', safe('battle:verify-result', ({ matchId, token, outputs, score } = {}) => {
        const match = matches.get(String(matchId || ''));
        if (!match || match.status !== 'verifying') return;
        const targetId = match.pendingVerify.get(String(token));
        if (!targetId || opponentOf(match, targetId)?.userId !== userId) return;
        match.pendingVerify.delete(String(token));
        const target = playerOf(match, targetId);
        if (match.engine === 'css') {
            // Rendering can differ a hair between machines
            target.verified = Number.isFinite(Number(score)) && Number(score) >= target.best.score - 1;
        } else {
            target.verified = grade(match.challenge, match.tests, outputs).passed >= target.best.passed;
        }
        if (!match.pendingVerify.size) conclude(match);
    }));

    socket.on('battle:forfeit', safe('battle:forfeit', ({ matchId } = {}) => {
        const { match, me } = findMine(matchId);
        if (!me || ['verifying', 'ended'].includes(match.status)) return;
        if (match.status === 'waiting') {
            match.decision = { result: 'no-contest', reason: 'Invite cancelled' };
            return conclude(match);
        }
        me.forfeited = true;
        finish(match, 'forfeit');
    }));

    socket.on('battle:rematch', safe('battle:rematch', async ({ matchId } = {}, cb) => {
        const reply = ack(cb);
        const { match, me } = findMine(matchId);
        if (!match || match.status !== 'ended' || match.players.length < 2 || !me) return reply({ error: 'Rematch is not available' });
        match.rematch.add(userId);
        io.to(room(match.id)).emit('battle:rematch', { matchId: match.id, userIds: [...match.rematch] });
        reply({ ok: true });
        if (match.rematch.size === 2 && match.players.every(p => !activeOf.has(p.userId)) && !match.rematchStarted) {
            match.rematchStarted = true;
            const next = await createMatch({
                kind: match.kind,
                mode: match.mode === 'ranked' ? 'ranked' : 'friend',
                difficulty: match.difficulty,
                skill: match.skill,
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
        // A round shouldn't wait for someone who left
        if (match.engine === 'rounds' && match.round && !match.round.revealed &&
            match.players.filter(p => !p.forfeited && p.connected).every(p => match.round.guesses.has(p.userId))) {
            endRound(match);
        }
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
    setInterval(() => tryMatchmaking().catch(() => {}), 2000).unref();
}

const activeMatchFor = (userId) => {
    const m = matches.get(activeOf.get(String(userId)));
    return m && m.status !== 'ended' ? { matchId: m.id, mode: m.mode, kind: m.kind, status: m.status } : null;
};

const stats = () => {
    const live = {};
    for (const m of matches.values()) {
        if (['countdown', 'running'].includes(m.status) && m.players.length > 1) live[m.kind] = (live[m.kind] || 0) + 1;
    }
    const searching = {};
    for (const q of queue.values()) searching[q.kind] = (searching[q.kind] || 0) + 1;
    return { live, searching, inQueue: queue.size, liveTotal: Object.values(live).reduce((a, b) => a + b, 0) };
};

module.exports = { init, register, eloUpdate, expectedScore, activeMatchFor, stats, decide, today, LANGUAGES, CSS_SOLVED };
