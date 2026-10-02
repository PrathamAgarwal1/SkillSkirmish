// Friendly loading and empty states. Art follows the theme: a mug and a curled-up cat in cozy, a little
// terminal in classic (the other one is hidden by CSS).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const JOKES = [
    'Brewing coffee…', 'Compiling your vibes…', 'Waking up the cat…', 'Untangling git branches…',
    'Warming up the servers…', 'Counting semicolons…', 'Feeding the hamsters…', 'Resolving merge conflicts with reality…',
    'Reticulating splines…', 'Asking Stack Overflow…', 'Turning it off and on again…', 'Adding more RGB…'
];

function Mug({ size = 56 }) {
    return (
        <svg className="fr-art-cozy fr-mug" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
            <path className="fr-steam" d="M24 18c-3-4 3-6 0-10M33 18c-3-4 3-6 0-10M42 18c-3-4 3-6 0-10" stroke="#a8999f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M14 24h34v18a12 12 0 0 1-12 12H26a12 12 0 0 1-12-12z" fill="#f5a97f" />
            <path d="M48 28h4a7 7 0 0 1 0 14h-5" stroke="#f5a97f" strokeWidth="4" fill="none" />
            <path d="M14 24h34v5H14z" fill="#e8956a" />
            <path d="M28 38c0-3 5-3 5 0 0-3 5-3 5 0 0 4-5 6-5 7-0-1-5-3-5-7z" fill="#c2693f" />
        </svg>
    );
}

function Prompt() {
    return <span className="fr-art-classic fr-prompt" aria-hidden="true">&gt;<span className="fr-prompt-cursor">_</span></span>;
}

/** Loading screen or line. `what` says what is loading ("your profile"); the joke on top rotates. */
export function Loading({ what = 'Loading', full = false }) {
    const [i, setI] = useState(() => Math.floor(Math.random() * JOKES.length));
    useEffect(() => {
        const t = setInterval(() => setI(n => (n + 1) % JOKES.length), 2200);
        return () => clearInterval(t);
    }, []);
    return (
        <div className={`fr-loading${full ? ' full' : ''}`} role="status">
            <Mug />
            <Prompt />
            <div>
                <div className="fr-joke" aria-hidden="true">{JOKES[i]}</div>
                <div className="fr-what">{what}</div>
            </div>
        </div>
    );
}

function NapCat() {
    return (
        <svg className="fr-art-cozy" viewBox="0 0 96 56" width="84" height="49" aria-hidden="true">
            <ellipse cx="48" cy="40" rx="32" ry="14" fill="#f0a875" />
            <path d="M22 44c-8 2-10-8-2-10" stroke="#d98a5a" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M34 30q3 5 0 10M42 28q3 6 0 12M50 28q3 6 0 12" stroke="#d98a5a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <circle cx="70" cy="34" r="11" fill="#f0a875" />
            <path d="M61 28l1-11 7 7zM73 24l7-7 1 12z" fill="#f0a875" />
            <path d="M64 35q2.5 2 5 0M72 35q2.5 2 5 0" stroke="#4a2f22" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <text x="80" y="14" fontSize="10" fontFamily="Nunito, sans-serif" fontWeight="800" fill="#c6a0f6">z</text>
        </svg>
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
    return (
        <div className={`fr-empty${compact ? ' compact' : ''}`}>
            {art === 'mug' ? <Mug size={48} /> : <NapCat />}
            <EmptyTerminal />
            <div className="fr-empty-title">{title}</div>
            {children && <p>{children}</p>}
            {action && (action.to
                ? <Link className={`ui-btn small${action.primary ? ' primary' : ''}`} to={action.to}>{action.label}</Link>
                : <button className={`ui-btn small${action.primary ? ' primary' : ''}`} onClick={action.onClick}>{action.label}</button>)}
        </div>
    );
}
