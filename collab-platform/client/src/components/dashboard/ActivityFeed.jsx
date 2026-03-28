import React from 'react';

const ActivityFeed = ({ activities, loading }) => {
    if (loading) {
        return (
            <div className="term-card">
                <div className="term-header">
                    <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                    <span>activity.log</span>
                </div>
                <div className="term-body">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="activity-item skeleton">
                            <div className="skeleton-text" style={{ width: '80%', height: '0.8rem' }}>&nbsp;</div>
                            <div className="skeleton-text" style={{ width: '50%', height: '0.7rem', marginTop: '0.3rem' }}>&nbsp;</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const formatTime = (timestamp) => {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return then.toLocaleDateString();
    };

    return (
        <div className="term-card">
            <div className="term-header">
                <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                <span>activity.log</span>
            </div>
            <div className="term-body activity-feed" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {activities && activities.length > 0 ? (
                    activities.map((item, i) => (
                        <div key={i} className="activity-item">
                            <span className="activity-icon">{item.icon}</span>
                            <div className="activity-content">
                                <span className="activity-title">{item.title}</span>
                                {item.detail && <span className="activity-detail">{item.detail}</span>}
                                {item.ratingChange != null && (
                                    <span className={`activity-rating ${item.ratingChange >= 0 ? 'positive' : 'negative'}`}>
                                        {item.ratingChange >= 0 ? '▲' : '▼'} {Math.abs(item.ratingChange)} ELO
                                    </span>
                                )}
                            </div>
                            <span className="activity-time">{formatTime(item.timestamp)}</span>
                        </div>
                    ))
                ) : (
                    <div className="term-empty">&gt; No recent activity. Start an assessment!</div>
                )}
            </div>
        </div>
    );
};

export default ActivityFeed;
