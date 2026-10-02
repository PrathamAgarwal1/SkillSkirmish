// appearance/art.jsx — the mascot (napping on cards, in empty states) and the prop (loading screens and
// empty states). Every drawing takes three colours: body, shade and accent, set on the Appearance page.
import React from 'react';

const INK = '#3b2a22'; // eyes and outlines

/* ── mascots: 96×64, napping ── */
const Z = ({ c }) => (
    <g className="mascot-z" fill={c} fontFamily="Nunito, sans-serif" fontWeight="800">
        <text x="72" y="14" fontSize="11">z</text>
        <text x="81" y="7" fontSize="8">z</text>
    </g>
);

const MASCOTS = {
    cat: ({ body, shade, accent, z }) => (
        <>
            <Z c={z} />
            <path d="M22 58 C 8 58, 6 44, 18 44" stroke={shade} strokeWidth="6" fill="none" strokeLinecap="round" />
            <ellipse cx="46" cy="50" rx="30" ry="14" fill={body} />
            <path d="M30 39 q3 5 0 10 M38 37 q3 6 0 12 M46 37 q3 6 0 12" stroke={shade} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="64" cy="40" r="13" fill={body} />
            <path d="M53 33 L54 19 L63 28 Z M66 27 L75 18 L76 33 Z" fill={body} />
            <path d="M55.5 30 L56 23 L60.5 27.5 Z M69 27 L73.5 22.5 L74 30 Z" fill={accent} />
            <path d="M57 41 q3 2.6 6 0 M66 41 q3 2.6 6 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <path d="M63.2 45 l1.6 0 l-0.8 1.2 Z" fill={accent} />
            <ellipse cx="56" cy="62" rx="6" ry="3" fill={body} /><ellipse cx="69" cy="62" rx="6" ry="3" fill={body} />
        </>
    ),
    fox: ({ body, shade, accent, z }) => (
        <>
            <Z c={z} />
            <path d="M20 56 C 2 56, 4 34, 22 40" stroke={body} strokeWidth="11" fill="none" strokeLinecap="round" />
            <path d="M6 50 C 5 45, 7 42, 10 41" stroke={accent} strokeWidth="6" fill="none" strokeLinecap="round" />
            <ellipse cx="46" cy="50" rx="29" ry="13" fill={body} />
            <ellipse cx="60" cy="54" rx="10" ry="6" fill={accent} />
            <path d="M52 44 L64 30 L78 44 Q65 52 52 44 Z" fill={body} />
            <path d="M55 36 L56 20 L64 30 Z M66 30 L75 20 L75 37 Z" fill={body} />
            <path d="M57.5 31 L58 25 L61.5 29 Z M68.5 29 L72.5 24.5 L72.5 31 Z" fill={shade} />
            <path d="M64 44 L78 44 Q71 50 64 47 Z" fill={accent} />
            <path d="M59 39 q2.5 2.2 5 0 M67 39 q2.5 2.2 5 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <circle cx="78.5" cy="44" r="1.6" fill={INK} />
            <ellipse cx="58" cy="62" rx="6" ry="3" fill={shade} /><ellipse cx="70" cy="62" rx="6" ry="3" fill={shade} />
        </>
    ),
    dog: ({ body, shade, accent, z }) => (
        <>
            <Z c={z} />
            <path d="M18 50 q-8 -2 -6 -10" stroke={body} strokeWidth="5" fill="none" strokeLinecap="round" />
            <ellipse cx="44" cy="50" rx="30" ry="14" fill={body} />
            <ellipse cx="36" cy="45" rx="9" ry="6" fill={shade} />
            <circle cx="64" cy="40" r="14" fill={body} />
            <path d="M52 32 q-8 4 -5 18 q6 -2 8 -10 Z M75 32 q8 4 5 18 q-6 -2 -8 -10 Z" fill={shade} />
            <ellipse cx="64" cy="47" rx="7" ry="5" fill={accent} />
            <path d="M57 39 q3 2.4 6 0 M65 39 q3 2.4 6 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <ellipse cx="64" cy="45" rx="2.2" ry="1.6" fill={INK} />
            <path d="M52 52 q12 5 24 0" stroke={shade} strokeWidth="3" fill="none" strokeLinecap="round" />
            <ellipse cx="56" cy="62" rx="6" ry="3" fill={body} /><ellipse cx="70" cy="62" rx="6" ry="3" fill={body} />
        </>
    ),
    bunny: ({ body, shade, accent, z }) => (
        <>
            <Z c={z} />
            <circle cx="18" cy="48" r="7" fill={accent === body ? shade : '#ffffff'} opacity="0.9" />
            <ellipse cx="44" cy="50" rx="28" ry="14" fill={body} />
            <circle cx="64" cy="42" r="13" fill={body} />
            <path d="M58 32 C 48 30, 40 20, 46 16 C 52 14, 58 24, 61 30 Z" fill={body} />
            <path d="M57 30 C 50 28, 46 22, 48 19 C 52 18, 56 24, 58 28 Z" fill={accent} />
            <path d="M68 30 C 70 18, 80 12, 82 18 C 83 24, 74 30, 70 32 Z" fill={body} />
            <path d="M70 29 C 72 21, 78 17, 79 20 C 80 24, 74 28, 71 30 Z" fill={accent} />
            <path d="M58 42 q2.6 2.2 5.2 0 M66 42 q2.6 2.2 5.2 0" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d="M63.5 46.5 l1.8 0 l-0.9 1.2 Z" fill={accent} />
            <ellipse cx="34" cy="46" rx="7" ry="4" fill={shade} opacity="0.5" />
            <ellipse cx="57" cy="62" rx="6" ry="3" fill={body} /><ellipse cx="69" cy="62" rx="6" ry="3" fill={body} />
        </>
    ),
    robot: ({ body, shade, accent, z }) => (
        <>
            <Z c={z} />
            <rect x="22" y="38" width="48" height="22" rx="8" fill={body} />
            <rect x="30" y="44" width="16" height="10" rx="3" fill={shade} />
            <circle cx="38" cy="49" r="2" fill={accent} />
            <rect x="52" y="22" width="26" height="22" rx="7" fill={body} />
            <rect x="55" y="27" width="20" height="12" rx="4" fill={shade} />
            <path d="M58 33 h5 M67 33 h5" stroke={accent} strokeWidth="2" strokeLinecap="round" />
            <path d="M65 22 v-7" stroke={shade} strokeWidth="2" />
            <circle cx="65" cy="13" r="3" fill={accent} />
            <rect x="26" y="58" width="10" height="5" rx="2" fill={shade} /><rect x="56" y="58" width="10" height="5" rx="2" fill={shade} />
        </>
    )
};

/** The site mascot, napping. Returns nothing when the mascot is turned off. */
export function Mascot({ mascot, z = '#c6a0f6', width = 96, height = 64, style, className = '' }) {
    if (!mascot || mascot.kind === 'none') return null;
    const c = mascot.colors || {};
    const colors = { body: c.body || '#f0a875', shade: c.shade || '#d98a5a', accent: c.accent || '#f5c2c7', z };
    if (mascot.kind === 'emoji') {
        return (
            <svg className={`mascot ${className}`} viewBox="0 0 96 64" width={width} height={height} style={style} aria-hidden="true">
                <Z c={z} />
                <text x="48" y="54" fontSize="44" textAnchor="middle">{mascot.emoji || '🐱'}</text>
            </svg>
        );
    }
    const Draw = MASCOTS[mascot.kind] || MASCOTS.cat;
    return (
        <svg className={`mascot ${className}`} viewBox="0 0 96 64" width={width} height={height} style={style} aria-hidden="true">
            <Draw {...colors} />
        </svg>
    );
}

/* ── props: 64×64 ── */
const PROPS = {
    mug: ({ body, shade, accent }) => (
        <>
            <path className="prop-steam" d="M24 18c-3-4 3-6 0-10M33 18c-3-4 3-6 0-10M42 18c-3-4 3-6 0-10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
            <path d="M14 24h34v18a12 12 0 0 1-12 12H26a12 12 0 0 1-12-12z" fill={body} />
            <path d="M48 28h4a7 7 0 0 1 0 14h-5" stroke={body} strokeWidth="4" fill="none" />
            <path d="M14 24h34v5H14z" fill={shade} />
            <path d="M28 38c0-3 5-3 5 0 0-3 5-3 5 0 0 4-5 6-5 7 0-1-5-3-5-7z" fill={accent} />
        </>
    ),
    tea: ({ body, shade, accent }) => (
        <>
            <path className="prop-steam" d="M28 20c-3-4 3-6 0-10M37 20c-3-4 3-6 0-10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
            <ellipse cx="32" cy="52" rx="24" ry="5" fill={shade} />
            <path d="M14 28h36v6a18 16 0 0 1-36 0z" fill={body} />
            <path d="M50 31h3a6 6 0 0 1 0 12h-6" stroke={body} strokeWidth="3.5" fill="none" />
            <ellipse cx="32" cy="28" rx="18" ry="4" fill={accent} />
            <path d="M38 22 v6" stroke={shade} strokeWidth="1.5" /><rect x="36" y="18" width="5" height="5" rx="1" fill={shade} />
        </>
    ),
    plant: ({ body, shade, accent }) => (
        <>
            <path d="M32 34 C 30 22, 20 14, 12 16 C 14 26, 22 32, 32 34 Z" fill={accent} />
            <path d="M32 34 C 34 20, 44 12, 54 14 C 52 26, 42 32, 32 34 Z" fill={accent} opacity="0.85" />
            <path d="M32 36 C 31 26, 33 16, 32 8 C 38 14, 38 26, 32 36 Z" fill={accent} opacity="0.7" />
            <path d="M18 36h28l-4 20H22z" fill={body} />
            <rect x="16" y="33" width="32" height="6" rx="2" fill={shade} />
        </>
    ),
    book: ({ body, shade, accent }) => (
        <>
            <path d="M12 16h18a4 4 0 0 1 4 4v34a4 4 0 0 0-4-4H12z" fill={body} />
            <path d="M52 16H36a4 4 0 0 0-4 4v34a4 4 0 0 1 4-4h16z" fill={body} />
            <path d="M15 20h14M15 25h12M15 30h14M37 20h12M37 25h13M37 30h10" stroke={shade} strokeWidth="2" strokeLinecap="round" />
            <path d="M44 16v14l3-3 3 3V16z" fill={accent} />
        </>
    )
};

/** The prop (mug, teacup, plant, book or any emoji) for loading screens and empty states. */
export function Prop({ prop, size = 56, className = '' }) {
    const p = prop || { kind: 'mug', colors: {} };
    const c = p.colors || {};
    const colors = { body: c.body || '#f5a97f', shade: c.shade || '#e8956a', accent: c.accent || '#c2693f' };
    if (p.kind === 'emoji') {
        return (
            <svg className={`prop ${className}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
                <text x="32" y="50" fontSize="42" textAnchor="middle">{p.emoji || '☕'}</text>
            </svg>
        );
    }
    const Draw = PROPS[p.kind] || PROPS.mug;
    return (
        <svg className={`prop ${className}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
            <Draw {...colors} />
        </svg>
    );
}
