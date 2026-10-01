// pages/OpenAppPage.jsx — opens a private or friends-only app: checks you may, then sends you to it
// with a short-lived access pass. (Linked from the app's "This app is private" page.)
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import FriendButton from '../components/friends/FriendButton';
import '../components/friends/friends.css';

const OpenAppPage = () => {
    const { slug } = useParams();
    const [denied, setDenied] = useState(null);

    useEffect(() => {
        axios.post(`/api/apps/${slug}/access`)
            .then(res => window.location.replace(res.data.url))
            .catch(err => setDenied(err.response?.data || { msg: err.message }));
    }, [slug]);

    if (!denied) return <div className="fr-page"><p className="fr-muted">Opening the app…</p></div>;
    return (
        <div className="fr-page" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48 }}>{denied.visibility === 'friends' ? '👥' : '🔒'}</div>
            <h1 style={{ color: '#fff', margin: 0 }}>You can't open this app</h1>
            <p className="fr-muted">{denied.msg}</p>
            {denied.visibility === 'friends' && denied.owner && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>Ask <Link to={`/profile/${denied.owner._id}`} style={{ color: '#58a6ff' }}>{denied.owner.username}</Link> to be friends:</span>
                    <FriendButton userId={denied.owner._id} />
                </div>
            )}
            <Link to="/gallery" style={{ color: '#58a6ff' }}>Browse public apps instead</Link>
        </div>
    );
};

export default OpenAppPage;
