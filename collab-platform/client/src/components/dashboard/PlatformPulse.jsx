import React from 'react';

const PlatformPulse = ({ platform, loading }) => {
    if (loading) {
        return (
            <div className="term-card platform-pulse">
                <div className="term-header"><span>platform_pulse</span></div>
                <div className="term-body">
                    <div className="skeleton-text" style={{ width: '60%' }}>&nbsp;</div>
                </div>
            </div>
        );
    }

    if (!platform) return null;

    return (
        <div className="term-card platform-pulse">
            <div className="term-header">
                <span>platform_pulse</span>
                <span className="pulse-live">● LIVE</span>
            </div>
            <div className="term-body">
                <div className="pulse-grid">
                    <div className="pulse-item">
                        <span className="pulse-value">{platform.totalUsers || 0}</span>
                        <span className="pulse-label">developers</span>
                    </div>
                    <div className="pulse-item">
                        <span className="pulse-value">{platform.totalRooms || 0}</span>
                        <span className="pulse-label">rooms</span>
                    </div>
                    <div className="pulse-item">
                        <span className="pulse-value">{platform.discoverableRooms || 0}</span>
                        <span className="pulse-label">discoverable</span>
                    </div>
                </div>

                {platform.topSkills && platform.topSkills.length > 0 && (
                    <div className="pulse-trending">
                        <span className="pulse-trending-label">&gt; trending_skills:</span>
                        <div className="pulse-tags">
                            {platform.topSkills.slice(0, 5).map((s, i) => (
                                <span key={i} className="pulse-tag">
                                    {s.name} <small>({s.userCount})</small>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlatformPulse;
