import React from 'react';

const SkillAnalytics = ({ analytics, loading }) => {
    if (loading) {
        return (
            <div className="term-card">
                <div className="term-header"><span>skill_analytics.sh</span></div>
                <div className="term-body">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton-bar">&nbsp;</div>
                    ))}
                </div>
            </div>
        );
    }

    if (!analytics || !analytics.skills || analytics.skills.length === 0) {
        return (
            <div className="term-card">
                <div className="term-header">
                    <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                    <span>skill_analytics.sh</span>
                </div>
                <div className="term-body">
                    <div className="term-empty">&gt; No skill data yet. Take an assessment to get started!</div>
                </div>
            </div>
        );
    }

    const maxElo = Math.max(...analytics.skills.map(s => s.elo), 1);
    const topSkills = analytics.skills.slice(0, 8); // Show top 8

    const getBarColor = (elo) => {
        if (elo >= 2000) return 'var(--term-gold)';
        if (elo >= 1500) return 'var(--term-green)';
        if (elo >= 1000) return 'var(--term-blue)';
        return 'var(--term-cyan, #00d4ff)';
    };

    return (
        <div className="term-card">
            <div className="term-header">
                <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                <span>skill_analytics.sh</span>
            </div>
            <div className="term-body">
                {/* Summary row */}
                <div className="analytics-summary">
                    <span className="analytics-stat">
                        avg_elo: <strong>{analytics.summary?.avgElo || 0}</strong>
                    </span>
                    <span className="analytics-stat">
                        mastery: <strong>{analytics.summary?.avgMastery || 0}%</strong>
                    </span>
                    <span className="analytics-stat">
                        matches: <strong>{analytics.summary?.totalMatches || 0}</strong>
                    </span>
                </div>

                {/* Bar chart */}
                <div className="skill-bars">
                    {topSkills.map((skill, i) => {
                        const width = Math.max((skill.elo / maxElo) * 100, 5);
                        return (
                            <div key={i} className="skill-bar-row">
                                <span className="skill-bar-label">{skill.name}</span>
                                <div className="skill-bar-track">
                                    <div
                                        className="skill-bar-fill"
                                        style={{
                                            width: `${width}%`,
                                            backgroundColor: getBarColor(skill.elo),
                                            animationDelay: `${i * 0.08}s`
                                        }}
                                    />
                                </div>
                                <span className="skill-bar-value">{skill.elo}</span>
                                {skill.isProvisional && <span className="provisional-badge">P</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SkillAnalytics;
