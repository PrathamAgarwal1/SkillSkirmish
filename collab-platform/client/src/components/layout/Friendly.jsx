// Friendly loading and empty states. The art is the user's mascot and prop (Appearance page), or a
// little terminal when they picked the terminal style (the other one is hidden by CSS).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppearance } from '../../appearance/context';
import { Mascot, Prop } from '../../appearance/art';

const JOKES = [
    'Brewing coffee…', 'Compiling your vibes…', 'Waking up the cat…', 'Untangling git branches…',
    'Warming up the servers…', 'Counting semicolons…', 'Feeding the hamsters…', 'Resolving merge conflicts with reality…',
    'Reticulating splines…', 'Asking Stack Overflow…', 'Turning it off and on again…', 'Adding more RGB…'
];

function Prompt() {
    return <span className="fr-art-classic fr-prompt" aria-hidden="true">&gt;<span className="fr-prompt-cursor">_</span></span>;
}

/** Loading screen or line. `what` says what is loading ("your profile"); the joke on top rotates. */
export function Loading({ what = 'Loading', full = false }) {
    const { settings } = useAppearance();
    const [i, setI] = useState(() => Math.floor(Math.random() * JOKES.length));
    useEffect(() => {
        const t = setInterval(() => setI(n => (n + 1) % JOKES.length), 2200);
        return () => clearInterval(t);
    }, []);
    return (
        <div className={`fr-loading${full ? ' full' : ''}`} role="status">
            <span className="fr-art-cozy"><Prop prop={settings.prop} size={56} /></span>
            <Prompt />
            <div>
                <div className="fr-joke" aria-hidden="true">{JOKES[i]}</div>
                <div className="fr-what">{what}</div>
            </div>
        </div>
    );
}

function EmptyTerminal() {
    return (
        <div className="fr-art-classic fr-term" aria-hidden="true">
            <span><b>$</b> ls</span>
            <span className="fr-term-dim">(empty)</span>
        </div>
    );
}

/** Empty state: art, a friendly title, one line of help and (optionally) one action. */
export function EmptyState({ title, children, action, compact = false, art = 'cat' }) {
    const { settings } = useAppearance();
    const useProp = art === 'mug' || !settings.mascot || settings.mascot.kind === 'none';
    return (
        <div className={`fr-empty${compact ? ' compact' : ''}`}>
            <span className="fr-art-cozy">
                {useProp ? <Prop prop={settings.prop} size={48} /> : <Mascot mascot={settings.mascot} z={settings.colors.link} width={84} height={56} />}
            </span>
            <EmptyTerminal />
            <div className="fr-empty-title">{title}</div>
            {children && <p>{children}</p>}
            {action && (action.to
                ? <Link className={`ui-btn small${action.primary ? ' primary' : ''}`} to={action.to}>{action.label}</Link>
                : <button className={`ui-btn small${action.primary ? ' primary' : ''}`} onClick={action.onClick}>{action.label}</button>)}
        </div>
    );
}
