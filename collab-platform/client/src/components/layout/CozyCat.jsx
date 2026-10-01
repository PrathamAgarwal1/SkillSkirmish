import React from 'react';

/** A sleepy tabby that naps on top of a card (cozy theme only; hidden by CSS otherwise). */
const CozyCat = ({ style }) => (
    <svg className="cozy-cat" viewBox="0 0 96 64" width="96" height="64" style={style} aria-hidden="true">
        <g className="cozy-cat-z" fill="#c6a0f6" fontFamily="Nunito, sans-serif" fontWeight="800">
            <text x="70" y="14" fontSize="11">z</text>
            <text x="79" y="7" fontSize="8">z</text>
        </g>
        {/* tail curled round the front */}
        <path d="M22 58 C 8 58, 6 44, 18 44" stroke="#d98a5a" strokeWidth="6" fill="none" strokeLinecap="round" />
        {/* body */}
        <ellipse cx="46" cy="50" rx="30" ry="14" fill="#f0a875" />
        <path d="M30 39 q3 5 0 10 M38 37 q3 6 0 12 M46 37 q3 6 0 12" stroke="#d98a5a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {/* head */}
        <circle cx="64" cy="40" r="13" fill="#f0a875" />
        <path d="M53 33 L54 19 L63 28 Z" fill="#f0a875" />
        <path d="M66 27 L75 18 L76 33 Z" fill="#f0a875" />
        <path d="M55.5 30 L56 23 L60.5 27.5 Z M69 27 L73.5 22.5 L74 30 Z" fill="#f5c2c7" />
        {/* sleeping eyes, nose, whiskers */}
        <path d="M57 41 q3 2.6 6 0 M66 41 q3 2.6 6 0" stroke="#4a2f22" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <path d="M63.2 45 l1.6 0 l-0.8 1.2 Z" fill="#e07a8a" />
        <path d="M54 46 l-7 -1 M54 48 l-7 1.5 M74 46 l7 -1 M74 48 l7 1.5" stroke="#a5704f" strokeWidth="0.9" strokeLinecap="round" />
        {/* paws */}
        <ellipse cx="56" cy="62" rx="6" ry="3" fill="#f6bb8f" />
        <ellipse cx="69" cy="62" rx="6" ry="3" fill="#f6bb8f" />
    </svg>
);

export default CozyCat;
