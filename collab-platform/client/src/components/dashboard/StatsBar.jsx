import React from 'react';

// Clean SVG icons instead of emojis
const StatIcon = ({ type, color }) => {
    const icons = {
        rooms: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
        ),
        assessments: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
        ),
        skills: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
        ),
        correct: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        ),
        days: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        )
    };
    return (
        <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: `${color}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
        }}>
            {icons[type]}
        </div>
    );
};

const StatsBar = ({ stats, loading }) => {
    if (loading) {
        return (
            <div className="stats-bar">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="stat-card skeleton">
                        <div className="stat-value skeleton-text">&nbsp;</div>
                        <div className="stat-label skeleton-text">&nbsp;</div>
                    </div>
                ))}
            </div>
        );
    }

    if (!stats) return null;

    const cards = [
        {
            iconType: 'rooms',
            value: stats.totalRooms || 0,
            label: 'Active Rooms',
            detail: `${stats.roomsOwned || 0} owned`,
            color: 'var(--term-green)'
        },
        {
            iconType: 'assessments',
            value: stats.assessment?.total || 0,
            label: 'Assessments',
            detail: `${stats.assessment?.avgAccuracy || 0}% avg`,
            color: 'var(--term-blue)'
        },
        {
            iconType: 'skills',
            value: stats.skillCount || 0,
            label: 'Skills Tracked',
            detail: stats.topSkill ? `Top: ${stats.topSkill.name}` : 'No skills yet',
            color: 'var(--term-gold)'
        },
        {
            iconType: 'correct',
            value: stats.assessment?.totalCorrect || 0,
            label: 'Correct Answers',
            detail: `of ${stats.assessment?.totalAttempted || 0} attempted`,
            color: 'var(--term-cyan, #00d4ff)'
        },
        {
            iconType: 'days',
            value: stats.assessment?.activeDays || 0,
            label: 'Active Days',
            detail: 'assessment sessions',
            color: 'var(--term-purple, #b388ff)'
        }
    ];

    return (
        <div className="stats-bar">
            {cards.map((card, i) => (
                <div key={i} className="stat-card" style={{ '--accent': card.color }}>
                    <StatIcon type={card.iconType} color={card.color} />
                    <div className="stat-content">
                        <div className="stat-value">{card.value}</div>
                        <div className="stat-label">{card.label}</div>
                        <div className="stat-detail">{card.detail}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StatsBar;
