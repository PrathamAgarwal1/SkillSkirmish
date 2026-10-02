// battle/useMatch.js — loads a battle and keeps it live: server state, rounds, reveals, the result,
// rematches, and re-checking the opponent's result when the server asks (code and CSS battles).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { createRunner } from './runner';
import { scoreCss } from './cssRender';

export const emit = (event, payload, timeout = 20000) => new Promise((resolve) => {
    socket.timeout(timeout).emit(event, payload, (err, res) => resolve(err ? { error: "Couldn't reach the server. Try again." } : res));
});

export function useMatch(matchId) {
    const navigate = useNavigate();
    const [state, setState] = useState(null);
    const [error, setError] = useState('');
    const [offset, setOffset] = useState(0); // server clock − local clock
    const [ended, setEnded] = useState(null);
    const [typingAt, setTypingAt] = useState(0);
    const [rematch, setRematch] = useState([]);
    const verifier = useRef(null);

    const load = useCallback(async () => {
        const res = await emit('battle:state', { matchId });
        if (!res?.ok) { setError(res?.error || 'Could not load this battle'); return; }
        setState(res.state);
        setOffset(res.state.now - Date.now());
        if (res.state.result) setEnded(e => e || { matchId, ...res.state.result });
    }, [matchId]);

    useEffect(() => {
        if (socket.connected) load();
        socket.on('connect', load);
        return () => socket.off('connect', load);
    }, [load]);

    useEffect(() => {
        const mine = (d) => d?.matchId === matchId;
        const onUpdate = (s) => {
            if (!mine(s)) return;
            setOffset(s.now - Date.now());
            setState(prev => {
                // An accepted invite: the full state (inputs etc.) comes from a reload
                if (prev?.status === 'waiting' && s.status !== 'waiting') setTimeout(load, 0);
                return prev ? { ...prev, ...s } : prev;
            });
        };
        const onRound = (r) => {
            if (!mine(r)) return;
            setOffset(r.now - Date.now());
            setState(prev => prev && { ...prev, prompt: r.prompt, myGuess: null, reveal: null, round: { ...(prev.round || {}), index: r.index, endsAt: r.endsAt, multiplier: r.multiplier, guessed: [], revealed: false } });
        };
        const onGuessed = (g) => {
            if (!mine(g)) return;
            setState(prev => prev && prev.round && { ...prev, round: { ...prev.round, endsAt: g.endsAt, guessed: [...new Set([...(prev.round.guessed || []), g.userId])] } });
        };
        const onReveal = (entry) => {
            if (!mine(entry)) return;
            setState(prev => prev && {
                ...prev,
                reveal: entry,
                history: [...(prev.history || []).filter(h => h.index !== entry.index), entry],
                round: prev.round && { ...prev.round, revealed: true }
            });
        };
        const onTyping = (d) => { if (mine(d)) setTypingAt(Date.now()); };
        const onEnded = (r) => { if (mine(r)) setEnded(r); };
        const onRematch = (d) => { if (mine(d)) setRematch(d.userIds); };
        const onMatched = ({ matchId: next }) => { if (next !== matchId) navigate(`/battle/m/${next}`); };
        // Re-check the opponent's final answer on this computer
        const onVerify = async (req) => {
            if (!mine(req)) return;
            if (req.engine === 'css') {
                const { score } = await scoreCss(req.code, req.image).catch(() => ({ score: 0 }));
                socket.emit('battle:verify-result', { matchId, token: req.token, score });
                return;
            }
            verifier.current ??= createRunner({ slack: 3 });
            const r = await verifier.current.run({ language: req.language, code: req.code, fnName: req.fnName, inputs: req.inputs, harness: req.harness, schema: req.schema, signature: req.signature });
            socket.emit('battle:verify-result', { matchId, token: req.token, outputs: r.outputs });
        };
        socket.on('battle:update', onUpdate);
        socket.on('battle:round', onRound);
        socket.on('battle:guessed', onGuessed);
        socket.on('battle:reveal', onReveal);
        socket.on('battle:typing', onTyping);
        socket.on('battle:ended', onEnded);
        socket.on('battle:rematch', onRematch);
        socket.on('battle:matched', onMatched);
        socket.on('battle:verify', onVerify);
        return () => {
            socket.off('battle:update', onUpdate);
            socket.off('battle:round', onRound);
            socket.off('battle:guessed', onGuessed);
            socket.off('battle:reveal', onReveal);
            socket.off('battle:typing', onTyping);
            socket.off('battle:ended', onEnded);
            socket.off('battle:rematch', onRematch);
            socket.off('battle:matched', onMatched);
            socket.off('battle:verify', onVerify);
        };
    }, [matchId, load, navigate]);

    useEffect(() => () => verifier.current?.dispose(), []);

    // A ticking clock for timers
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick(n => n + 1), 250);
        return () => clearInterval(id);
    }, []);

    return { state, setState, error, offset, now: Date.now() + offset, ended, setEnded, typingAt, rematch, reload: load };
}

export const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
