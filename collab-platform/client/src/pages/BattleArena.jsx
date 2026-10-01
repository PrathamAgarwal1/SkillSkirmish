// pages/BattleArena.jsx — a live battle in any mode: shared top bar and overlays around the arena
// for the mode's engine (code, CSS or rounds).
import React, { useContext, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import { useMatch, clock } from '../battle/useMatch';
import CodeArena from '../battle/CodeArena';
import CssArena from '../battle/CssArena';
import RoundsArena from '../battle/RoundsArena';
import ResultOverlay from '../battle/ResultOverlay';
import '../battle/battle.css';

const KIND_LABEL = { guessr: '🧭 CodeGuessr', quiz: '🧠 Skill Quiz', task: '🛠️ Dev Task', debug: '🐛 Debug Race', css: '🎨 CSS Battle', algo: '🧮 Algorithms' };
const MODE_LABEL = { ranked: 'Ranked', friend: 'Friendly', practice: 'Practice', daily: 'Daily challenge' };

const BattleArena = () => {
    const { matchId } = useParams();
    return <Arena key={matchId} matchId={matchId} />;
};

function Arena({ matchId }) {
    const { user } = useContext(AuthContext);
    const myId = String(user?._id || '');
    const m = useMatch(matchId);
    const { state, error, now, ended, setEnded } = m;
    const [copied, setCopied] = useState(false);

    if (error) {
        return (
            <div className="bt-page bt-center">
                <div className="bt-card" style={{ maxWidth: 440, textAlign: 'center' }}>
                    <h2>Battle unavailable</h2>
                    <p className="bt-muted">{error}</p>
                    <Link className="bt-btn primary" to="/battle">Back to the lobby</Link>
                </div>
            </div>
        );
    }
    const ready = state && (state.engine === 'code' ? state.problem : state.engine === 'css' ? state.target : true);
    if (!ready) return <div className="bt-page bt-center"><p className="bt-muted">Loading the battle…</p></div>;

    const solo = ['practice', 'daily'].includes(state.mode);
    const forfeit = () => {
        const msg = state.status === 'waiting' ? 'Cancel this invite?' : solo ? 'Stop this run?' : 'Give up? Your opponent wins.';
        if (window.confirm(msg)) socket.emit('battle:forfeit', { matchId });
    };

    // A friend invite nobody has accepted yet
    if (state.status === 'waiting') {
        const url = `${window.location.origin}${window.location.pathname}#/battle/join/${state.code}`;
        return (
            <div className="bt-page bt-center">
                <div className="bt-card bt-waiting">
                    <span className="bt-spinner big" aria-hidden="true" />
                    <h2>Waiting for your friend…</h2>
                    <p className="bt-muted">{KIND_LABEL[state.kind]}{state.skill ? ` · ${state.skill}` : state.difficulty ? ` · ${state.difficulty}` : ''}. Send them this link; the battle starts as soon as they open it.</p>
                    <div className="bt-invite">
                        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                        <button className="bt-btn primary" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? '✓ Copied' : 'Copy link'}</button>
                    </div>
                    <button className="bt-btn" onClick={forfeit}>Cancel invite</button>
                </div>
            </div>
        );
    }

    const countdown = state.status === 'countdown' ? Math.ceil((state.startsAt - now) / 1000) : 0;
    const timeLeft = state.endsAt ? state.endsAt - now : null;
    const elapsed = state.startsAt ? now - state.startsAt : 0;
    const opponent = state.players.find(p => p.userId !== myId);
    const me = state.players.find(p => p.userId === myId);

    return (
        <div className={`bt-arena engine-${state.engine}`}>
            <div className="bt-topbar">
                <Link to="/battle" className="bt-back" title="Battle lobby">←</Link>
                <div className="bt-title">
                    <span className="bt-kind">{KIND_LABEL[state.kind]}</span>
                    {state.difficulty && state.engine !== 'rounds' && <span className={`bt-diff ${state.difficulty}`}>{state.difficulty}</span>}
                    {state.content?.title && !KIND_LABEL[state.kind].endsWith(state.content.title) && <b>{state.content.title}</b>}
                    <span className="bt-muted">{MODE_LABEL[state.mode]}</span>
                </div>
                {state.engine !== 'rounds' && (
                    <div className={`bt-clock ${timeLeft != null && timeLeft < 60000 ? 'low' : ''}`} aria-live="off">
                        {timeLeft != null ? clock(timeLeft) : clock(elapsed)}
                    </div>
                )}
                {!ended && state.result && <button className="bt-btn" onClick={() => setEnded({ matchId, ...state.result })}>Show result</button>}
                {!ended && !state.result && state.status !== 'verifying' && <button className="bt-btn ghost" onClick={forfeit}>{solo ? 'Stop' : 'Give up'}</button>}
            </div>

            {state.engine === 'code' && <CodeArena m={m} myId={myId} />}
            {state.engine === 'css' && <CssArena m={m} myId={myId} />}
            {state.engine === 'rounds' && <RoundsArena m={m} myId={myId} />}

            {state.status === 'countdown' && (
                <div className="bt-overlay">
                    <div className="bt-countdown" key={countdown}>{countdown > 0 ? countdown : 'Go!'}</div>
                    {!solo && opponent && <p>{me?.username || 'You'} vs {opponent.username}</p>}
                    {state.mode === 'daily' && <p>Today's 5 rounds are the same for everyone. Your first run counts.</p>}
                </div>
            )}

            {state.status === 'verifying' && !ended && (
                <div className="bt-overlay">
                    <span className="bt-spinner big" aria-hidden="true" />
                    <h2>Checking results…</h2>
                    <p className="bt-muted">Each player's browser re-checks the other's final answer.</p>
                </div>
            )}

            {ended && <ResultOverlay ended={ended} state={state} myId={myId} rematch={m.rematch} onClose={() => setEnded(null)} />}
        </div>
    );
}

export default BattleArena;
