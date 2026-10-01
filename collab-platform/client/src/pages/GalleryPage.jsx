import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import './Gallery.css';

const TYPE_ICONS = {
    'React App': '⚛️', 'MERN Stack': '🍃', 'Next.js': '▲', 'Node.js API': '🟢', 'Express + EJS': '🚂',
    'Vanilla Web': '🌐', 'Python API (FastAPI)': '⚡', 'Python Script': '🐍',
    'Machine Learning (Jupyter)': '🧠', 'Android (Expo)': '📱'
};
const SORTS = [['popular', '🔥 Popular'], ['new', '🆕 New'], ['liked', '❤ Most liked']];

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** Live, scaled-down view of the app, loaded only when the card scrolls into view. */
const Thumbnail = ({ url, name }) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || !('IntersectionObserver' in window)) { setVisible(true); return undefined; }
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return (
        <div className="gl-thumb" ref={ref} aria-hidden="true">
            {!loaded && <div className="gl-thumb-placeholder">{name.slice(0, 1).toUpperCase()}</div>}
            {visible && (
                <iframe
                    src={url}
                    title={`${name} preview`}
                    tabIndex={-1}
                    loading="lazy"
                    credentialless="true"
                    onLoad={() => setLoaded(true)}
                    style={{ opacity: loaded ? 1 : 0 }}
                />
            )}
        </div>
    );
};

const ForkModal = ({ app, onClose }) => {
    const navigate = useNavigate();
    const [rooms, setRooms] = useState(null);
    const [roomId, setRoomId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get('/api/rooms/myrooms')
            .then(res => { setRooms(res.data); setRoomId(res.data[0]?._id || ''); })
            .catch(err => setError(err.response?.data?.msg || err.message));
    }, []);

    const fork = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await axios.post(`/api/gallery/${app.slug}/fork`, { roomId });
            navigate(`/projects/${res.data.project._id}`);
        } catch (err) {
            setError(err.response?.data?.msg || err.message);
            setBusy(false);
        }
    };

    return (
        <div className="gl-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="gl-modal" role="dialog" aria-modal="true" aria-labelledby="fork-title">
                <h3 id="fork-title">⑂ Fork “{app.name}”</h3>
                <p className="gl-muted">You get your own copy of the source code to edit, run and deploy. The original stays unchanged.</p>
                {rooms === null && !error && <p className="gl-muted">Loading your rooms…</p>}
                {rooms?.length === 0 && (
                    <p className="gl-muted">You need a room to put the project in. <Link to="/dashboard">Create one on your dashboard</Link>, then come back.</p>
                )}
                {rooms?.length > 0 && (
                    <label className="gl-field">
                        <span>Put it in room</span>
                        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                            {rooms.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                        </select>
                    </label>
                )}
                {error && <p className="gl-error">✕ {error}</p>}
                <div className="gl-modal-actions">
                    <button className="gl-btn" onClick={onClose}>Cancel</button>
                    <button className="gl-btn primary" onClick={fork} disabled={!roomId || busy}>{busy ? 'Forking…' : 'Fork and open'}</button>
                </div>
            </div>
        </div>
    );
};

const GalleryPage = () => {
    const { isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sort, setSort] = useState('popular');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [forking, setForking] = useState(null);

    // Search as you type, a moment after typing stops
    useEffect(() => {
        const t = setTimeout(() => setSearch(query.trim()), 350);
        return () => clearTimeout(t);
    }, [query]);

    const load = useCallback(async (pageNo) => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.get('/api/gallery', { params: { sort, q: search || undefined, page: pageNo } });
            setItems(prev => (pageNo === 0 ? res.data.items : [...prev, ...res.data.items]));
            setHasMore(res.data.hasMore);
            setPage(pageNo);
        } catch (err) {
            setError(err.response?.data?.msg || err.message);
        } finally {
            setLoading(false);
        }
    }, [sort, search]);

    useEffect(() => { load(0); }, [load]);

    const like = async (app) => {
        if (!isAuthenticated) return navigate('/login');
        // Optimistic: flip now, reconcile with the server's answer
        setItems(list => list.map(a => (a.slug === app.slug ? { ...a, liked: !a.liked, likes: a.likes + (a.liked ? -1 : 1) } : a)));
        try {
            const res = await axios.post(`/api/gallery/${app.slug}/like`);
            setItems(list => list.map(a => (a.slug === app.slug ? { ...a, liked: res.data.liked, likes: res.data.likes } : a)));
        } catch {
            setItems(list => list.map(a => (a.slug === app.slug ? { ...a, liked: app.liked, likes: app.likes } : a)));
        }
    };

    return (
        <div className="gl-page">
            <header className="gl-header">
                <div>
                    <h1>Gallery</h1>
                    <p className="gl-muted">Apps built and published on SkillSkirmish. Open them, like them, or fork the code and make it yours.</p>
                </div>
                <div className="gl-controls">
                    <input
                        type="search"
                        className="gl-search"
                        placeholder="Search apps…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search apps"
                    />
                    <div className="gl-tabs" role="tablist">
                        {SORTS.map(([id, label]) => (
                            <button key={id} role="tab" aria-selected={sort === id} className={sort === id ? 'active' : ''} onClick={() => setSort(id)}>{label}</button>
                        ))}
                    </div>
                </div>
            </header>

            {error && <p className="gl-error">✕ {error} <button className="gl-btn" onClick={() => load(0)}>Retry</button></p>}

            {!loading && !error && items.length === 0 && (
                <div className="gl-empty">
                    <div style={{ fontSize: 42 }}>🖼️</div>
                    <h3>{search ? 'No apps match your search' : 'No apps in the gallery yet'}</h3>
                    <p className="gl-muted">Publish a project from the IDE (🚀 Deploy), then tick “Show in the public gallery”.</p>
                </div>
            )}

            <div className="gl-grid">
                {items.map(app => (
                    <article key={app.slug} className="gl-card">
                        <a href={app.url} target="_blank" rel="noreferrer" className="gl-thumb-link" aria-label={`Open ${app.name}`}>
                            <Thumbnail url={app.url} name={app.name} />
                        </a>
                        <div className="gl-card-body">
                            <div className="gl-card-title">
                                <span title={app.projectType}>{TYPE_ICONS[app.projectType] || '📦'}</span>
                                <h3>{app.name}</h3>
                            </div>
                            {app.description && <p className="gl-desc">{app.description}</p>}
                            <div className="gl-meta">
                                {app.author && <Link to={`/profile/${app.author._id}`} className="gl-author">@{app.author.username}</Link>}
                                <span className="gl-stats" title="Views · forks">👁 {compact(app.views)}{app.forks > 0 && <> · ⑂ {compact(app.forks)}</>}</span>
                            </div>
                            <div className="gl-actions">
                                <a className="gl-btn primary" href={app.url} target="_blank" rel="noreferrer">Open ↗</a>
                                <button className={`gl-btn ${app.liked ? 'liked' : ''}`} onClick={() => like(app)} aria-pressed={app.liked} title={app.liked ? 'Unlike' : 'Like'}>
                                    {app.liked ? '❤' : '♡'} {compact(app.likes)}
                                </button>
                                {app.forkable && (
                                    <button className="gl-btn" onClick={() => (isAuthenticated ? setForking(app) : navigate('/login'))} title="Copy the source code into one of your rooms">⑂ Fork</button>
                                )}
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            {loading && <p className="gl-muted gl-center">Loading apps… (the first load can take a minute if the server was asleep)</p>}
            {hasMore && !loading && <div className="gl-center"><button className="gl-btn" onClick={() => load(page + 1)}>Load more</button></div>}

            {forking && <ForkModal app={forking} onClose={() => setForking(null)} />}
        </div>
    );
};

export default GalleryPage;
