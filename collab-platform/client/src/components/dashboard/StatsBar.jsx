import React from 'react';

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
            icon: '📁',
            value: stats.totalRooms || 0,
            label: 'Active Rooms',
            detail: `${stats.roomsOwned || 0} owned`,
            color: 'var(--term-green)'
        },
        {
            icon: '⚔️',
            value: stats.assessment?.total || 0,
            label: 'Assessments',
            detail: `${stats.assessment?.avgAccuracy || 0}% avg`,
            color: 'var(--term-blue)'
        },
        {
            icon: '🧠',
            value: stats.skillCount || 0,
            label: 'Skills Tracked',
            detail: stats.topSkill ? `Top: ${stats.topSkill.name}` : 'No skills yet',
            color: 'var(--term-gold)'
        },
        {
            icon: '🎯',
            value: stats.assessment?.totalCorrect || 0,
            label: 'Correct Answers',
            detail: `of ${stats.assessment?.totalAttempted || 0} attempted`,
            color: 'var(--term-cyan, #00d4ff)'
        },
        {
            icon: '📅',
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
                    <div className="stat-icon">{card.icon}</div>
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
