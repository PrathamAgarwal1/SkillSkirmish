import React from 'react';

const Logo = ({ size = 'medium', className = '' }) => {
    const baseStyle = {
        fontFamily: "'Inter', sans-serif",
        fontWeight: '800',
        letterSpacing: '-0.02em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        userSelect: 'none',
    };

    const sizes = {
        small: { fontSize: '1.2rem' },
        medium: { fontSize: '1.5rem' },
        large: { fontSize: '2.5rem' },
        xl: { fontSize: '4rem' },
    };

    const iconSizes = {
        small: 24,
        medium: 32,
        large: 48,
        xl: 72,
    };

    return (
        <div className={`logo-container ${className}`} style={{ ...baseStyle, ...sizes[size] }}>
            {/* Stylized "S" Icon or abstract shape */}
            <svg
                width={iconSizes[size]}
                height={iconSizes[size]}
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M10 20C10 14.4772 14.4772 10 20 10V10C25.5228 10 30 14.4772 30 20V20C30 25.5228 25.5228 30 20 30H10V20Z" fill="var(--accent-primary)" />
                <path d="M30 20C30 25.5228 25.5228 30 20 30V30C14.4772 30 10 25.5228 10 20V20C10 14.4772 14.4772 10 20 10H30V20Z" fill="url(#paint0_linear)" style={{ mixBlendMode: 'overlay' }} opacity="0.5" />
                <defs>
                    <linearGradient id="paint0_linear" x1="10" y1="10" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                        <stop stopColor="white" stopOpacity="0.8" />
                        <stop offset="1" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span style={{ color: '#fff' }}>Skill</span>
                <span className="gradient-text" style={{ fontSize: '0.9em' }}>Skirmish</span>
            </div>
        </div>
    );
};

export default Logo;
