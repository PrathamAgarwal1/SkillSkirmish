import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LABELS = {
    none: '+ Add friend',
    outgoing: 'Request sent',
    incoming: 'Accept friend request',
    friends: '✓ Friends'
};

/** Add / accept / cancel / unfriend, for someone's profile or a search result. */
const FriendButton = ({ userId, initialStatus, onChange, className = 'fr-btn' }) => {
    const [status, setStatus] = useState(initialStatus || null);
    const [busy, setBusy] = useState(false);
    const [hover, setHover] = useState(false);

    useEffect(() => {
        if (initialStatus) { setStatus(initialStatus); return; }
        axios.get(`/api/friends/status/${userId}`).then(r => setStatus(r.data.status)).catch(() => {});
    }, [userId, initialStatus]);

    if (!status || status === 'self') return null;

    const act = async () => {
        setBusy(true);
        try {
            let res;
            if (status === 'none') res = await axios.post('/api/friends/request', { userId });
            else if (status === 'incoming') res = await axios.post(`/api/friends/${userId}/accept`);
            else if (status === 'outgoing') { if (!window.confirm('Cancel your friend request?')) return; res = await axios.delete(`/api/friends/${userId}`); }
            else if (status === 'friends') { if (!window.confirm('Remove from your friends?')) return; res = await axios.delete(`/api/friends/${userId}`); }
            setStatus(res.data.status);
            onChange?.(res.data.status);
        } catch (err) {
            alert(err.response?.data?.msg || err.message);
        } finally {
            setBusy(false);
        }
    };

    const label = hover && status === 'friends' ? 'Unfriend' : hover && status === 'outgoing' ? 'Cancel request' : LABELS[status];
    return (
        <button
            className={`${className} ${status}`}
            onClick={act}
            disabled={busy}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {label}
        </button>
    );
};

export default FriendButton;
