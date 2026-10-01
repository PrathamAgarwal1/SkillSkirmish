// battle/LanguageMap.jsx — CodeGuessr's world map of programming languages. Click to drop a pin.
// Continents are drawn as merged blobs around each family's languages (an SVG "gooey" filter).
import React, { useRef, useState } from 'react';

const REGION_COLORS = {
    web: '#3b6e8f', apple: '#6b5b95', c: '#4f6d4f', jvm: '#8c5e3c', dotnet: '#5a4e8c', script: '#7a8450',
    shell: '#5f6b73', functional: '#3f7a73', beam: '#7d4f72', lisp: '#4a6a8a', data: '#8a7a4a', legacy: '#6e6e6e'
};
const PIN = { me: '#58a6ff', them: '#ff7b72', answer: '#3fb950' };

function Pin({ x, y, color, label }) {
    return (
        <g transform={`translate(${x} ${y})`} className="lm-pin">
            <path d="M0 0 C -9 -14 -11 -18 -11 -24 A 11 11 0 1 1 11 -24 C 11 -18 9 -14 0 0 Z" fill={color} stroke="#0d1117" strokeWidth="2" />
            <circle cy="-24" r="4" fill="#0d1117" />
            {label && <text y="-42" textAnchor="middle" className="lm-pin-label">{label}</text>}
        </g>
    );
}

function Flag({ x, y, label }) {
    return (
        <g transform={`translate(${x} ${y})`} className="lm-pin">
            <circle r="7" fill={PIN.answer} stroke="#0d1117" strokeWidth="2" />
            <path d="M0 -6 V -38 L 22 -30 L 0 -22" fill={PIN.answer} stroke="#0d1117" strokeWidth="2" />
            {label && <text y="-46" textAnchor="middle" className="lm-pin-label answer">{label}</text>}
        </g>
    );
}

export default function LanguageMap({ map, guess, onPick, disabled, reveal, myId, opponentName }) {
    const svg = useRef(null);
    const [hover, setHover] = useState(null);

    const toMap = (e) => {
        const pt = svg.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.current.getScreenCTM().inverse());
        return { x: Math.max(0, Math.min(map.width, Math.round(p.x))), y: Math.max(0, Math.min(map.height, Math.round(p.y))) };
    };

    const click = (e) => {
        if (disabled || !onPick) return;
        onPick(toMap(e));
    };

    const answer = reveal?.answer;
    const results = reveal?.results || [];

    return (
        <svg
            ref={svg}
            className={`lm ${disabled ? 'locked' : ''}`}
            viewBox={`0 0 ${map.width} ${map.height}`}
            onClick={click}
            role="img"
            aria-label="Map of programming languages. Click to place your guess."
        >
            <defs>
                <filter id="lm-goo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12" />
                </filter>
                <pattern id="lm-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1b2a3a" strokeWidth="1" />
                </pattern>
            </defs>
            <rect width={map.width} height={map.height} fill="#0b1622" />
            <rect width={map.width} height={map.height} fill="url(#lm-grid)" />

            {/* Continents */}
            <g filter="url(#lm-goo)" opacity="0.9">
                {map.regions.map(r => (
                    <g key={r.id} fill={REGION_COLORS[r.id] || '#555'}>
                        <circle cx={r.x} cy={r.y} r="46" />
                        {map.languages.filter(l => l.region === r.id).map(l => <circle key={l.id} cx={l.x} cy={l.y} r="44" />)}
                    </g>
                ))}
            </g>

            {/* Region names */}
            {map.regions.map(r => (
                <text key={r.id} x={r.label ? r.label[0] : r.x} y={r.label ? r.label[1] : r.y - 58} textAnchor="middle" className="lm-region">{r.name.toUpperCase()}</text>
            ))}

            {/* Languages */}
            {map.languages.map(l => (
                <g key={l.id} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}>
                    <circle cx={l.x} cy={l.y} r={hover === l.id ? 6 : 4} className="lm-dot" />
                    <text x={l.x} y={l.y + 16} textAnchor="middle" className={`lm-name ${hover === l.id ? 'hover' : ''}`}>{l.name}</text>
                </g>
            ))}

            {/* Reveal: lines from each guess to the answer */}
            {answer && results.map(r => r.guess && (
                <line key={r.userId} x1={r.guess.x} y1={r.guess.y} x2={answer.x} y2={answer.y} className={`lm-line ${r.userId === myId ? 'me' : 'them'}`} />
            ))}
            {answer && results.filter(r => r.guess && r.userId !== myId).map(r => (
                <Pin key={r.userId} x={r.guess.x} y={r.guess.y} color={PIN.them} label={opponentName} />
            ))}
            {(answer ? results.find(r => r.userId === myId)?.guess : guess) && (() => {
                const g = answer ? results.find(r => r.userId === myId).guess : guess;
                return <Pin x={g.x} y={g.y} color={PIN.me} label={answer ? 'You' : null} />;
            })()}
            {answer && <Flag x={answer.x} y={answer.y} label={answer.name} />}
        </svg>
    );
}
