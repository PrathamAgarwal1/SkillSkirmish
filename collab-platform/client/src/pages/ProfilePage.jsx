import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { FaGithub, FaLinkedin, FaXTwitter, FaGlobe, FaCode, FaLocationDot, FaBuilding, FaCalendar } from 'react-icons/fa6';
import FriendButton from '../components/friends/FriendButton';
import InviteModal from '../components/rooms/InviteModal';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import './Profile.css';
import { Loading, EmptyState } from '../components/layout/Friendly';

const availableSkills = [
    'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue', 'Node.js', 'Express.js',
    'Python', 'Django', 'Flask', 'Java', 'Spring Boot', 'C', 'C++', 'C#', '.NET', 'Go', 'Rust',
    'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Linux',
    'Git', 'CI/CD', 'HTML', 'CSS', 'Sass'
];

// Codeforces-style ranks (colours lightened to stay readable on the dark background)
const RANKS = [
    { name: 'Newbie', min: 0, max: 1200, color: '#9da5b0' },
    { name: 'Pupil', min: 1200, max: 1400, color: '#3fb950' },
    { name: 'Specialist', min: 1400, max: 1600, color: '#39c5bb' },
    { name: 'Expert', min: 1600, max: 1900, color: '#6ea8fe' },
    { name: 'Candidate Master', min: 1900, max: 2100, color: '#d2a8ff' },
    { name: 'Master', min: 2100, max: 2300, color: '#ffa657' },
    { name: 'International Master', min: 2300, max: 2400, color: '#ffa657' },
    { name: 'Grandmaster', min: 2400, max: 2600, color: '#ff7b72' },
    { name: 'International Grandmaster', min: 2600, max: 3000, color: '#ff6b6b' },
    { name: 'Legendary Grandmaster', min: 3000, max: 99999, color: '#ff4d4d' }
];
const rankOf = (elo) => RANKS.find(r => elo >= r.min && elo < r.max) || RANKS[0];

const MODES = [
    { id: 'guessr', name: 'CodeGuessr', icon: '🧭' },
    { id: 'quiz', name: 'Skill Quiz', icon: '🧠' },
    { id: 'task', name: 'Dev Task', icon: '🛠️' },
    { id: 'debug', name: 'Debug Race', icon: '🐛' },
    { id: 'css', name: 'CSS Battle', icon: '🎨' },
    { id: 'algo', name: 'Algorithms', icon: '🧮' }
];
const modeName = (id) => MODES.find(m => m.id === id)?.name || id;

const LINKS = [
    { key: 'github', label: 'GitHub', icon: FaGithub, placeholder: 'https://github.com/you' },
    { key: 'linkedin', label: 'LinkedIn', icon: FaLinkedin, placeholder: 'https://linkedin.com/in/you' },
    { key: 'leetcode', label: 'LeetCode', icon: FaCode, placeholder: 'https://leetcode.com/u/you' },
    { key: 'twitter', label: 'X / Twitter', icon: FaXTwitter, placeholder: 'https://x.com/you' },
    { key: 'portfolio', label: 'Portfolio', icon: FaGlobe, placeholder: 'https://you.dev' }
];

const isRated = (s) => s && s.elo != null && (s.matchesPlayed || 0) > 0;
const hostOf = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };
const ago = (d) => {
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ChartTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { elo, n } = payload[0].payload;
    const rank = rankOf(elo);
    return (
        <div className="pf-tip">
            <div className="ui-muted ui-small">After assessment {n}</div>
            <div><span className="ui-num">{elo}</span> · <span style={{ color: rank.color }}>{rank.name}</span></div>
        </div>
    );
};

/** Edit name, bio, details and links. */
function EditProfileModal({ profile, onClose, onSaved }) {
    const [form, setForm] = useState(() => ({
        username: profile.username || '',
        bio: profile.bio || '',
        location: profile.location || '',
        company: profile.company || '',
        website: profile.website || '',
        socialsPublic: profile.socialsPublic !== false,
        ...Object.fromEntries(LINKS.map(l => [l.key, profile.socialLinks?.[l.key] || '']))
    }));
    const [saving, setSaving] = useState(false);
    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await axios.put('/api/profile', {
                username: form.username,
                bio: form.bio,
                location: form.location,
                company: form.company,
                website: form.website,
                socialsPublic: form.socialsPublic,
                socialLinks: Object.fromEntries(LINKS.map(l => [l.key, form[l.key]]))
            });
            if (res.data.username !== profile.username) socket.emit('profileUpdated', { userId: profile._id, username: res.data.username });
            toast.success('Profile saved');
            onSaved(res.data);
        } catch (err) {
            toast.error(`Couldn't save your profile: ${err.response?.data?.msg || 'something went wrong'}`);
            setSaving(false);
        }
    };

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <form className="ui-modal" style={{ width: 'min(620px, 100%)' }} onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
                <h2 id="edit-profile-title">Edit profile</h2>
                <label className="ui-field">
                    <span>Username</span>
                    <input className="ui-input" value={form.username} onChange={set('username')} required minLength={3} maxLength={30} />
                </label>
                <label className="ui-field">
                    <span>Bio</span>
                    <textarea className="ui-textarea" rows={3} maxLength={300} value={form.bio} onChange={set('bio')} placeholder="What do you build? What are you learning?" />
                    <small>{form.bio.length}/300</small>
                </label>
                <div className="pf-form-grid">
                    <label className="ui-field"><span>Location</span><input className="ui-input" value={form.location} onChange={set('location')} placeholder="Bengaluru, India" maxLength={100} /></label>
                    <label className="ui-field"><span>Company or school</span><input className="ui-input" value={form.company} onChange={set('company')} placeholder="IIT Delhi" maxLength={100} /></label>
                </div>
                <h3 className="pf-form-section">Links</h3>
                <div className="pf-form-grid">
                    {LINKS.map(l => (
                        <label key={l.key} className="ui-field"><span>{l.label}</span><input className="ui-input" value={form[l.key]} onChange={set(l.key)} placeholder={l.placeholder} /></label>
                    ))}
                </div>
                <label className="ui-check">
                    <input type="checkbox" checked={form.socialsPublic} onChange={set('socialsPublic')} />
                    <span>Show my links to other people<small>Turn off to keep them visible only to you.</small></span>
                </label>
                <div className="ui-modal-actions">
                    <button type="button" className="ui-btn ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="ui-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </form>
        </div>
    );
}

const ProfilePage = () => {
    const { user: currentUser } = useContext(AuthContext);
    const { userId } = useParams();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');
    const [graphSkill, setGraphSkill] = useState('');
    const [skillToAdd, setSkillToAdd] = useState('');
    const [editing, setEditing] = useState(false);
    const [myRooms, setMyRooms] = useState([]);
    const [showInvite, setShowInvite] = useState(false);

    const isOwnProfile = !userId || (currentUser && currentUser._id === userId);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(userId ? `/api/profile/user/${userId}` : '/api/profile/me');
            setProfile(res.data);
            const rated = (res.data.skills || []).filter(isRated).sort((a, b) => b.elo - a.elo);
            setGraphSkill(s => s || rated[0]?.name || res.data.skills?.[0]?.name || '');
            axios.get(`/api/profile/user/${res.data._id}/summary`).then(r => setSummary(r.data)).catch(() => setSummary(null));
        } catch (err) {
            console.error('Failed to fetch profile:', err);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { setGraphSkill(''); setTab('overview'); load(); }, [load]);

    useEffect(() => {
        if (!isOwnProfile && currentUser) axios.get('/api/rooms/myrooms').then(r => setMyRooms(r.data)).catch(() => {});
    }, [isOwnProfile, currentUser]);

    const addSkill = (name) => {
        if (!profile || !name || profile.skills.some(s => s.name === name)) return;
        const skills = [...profile.skills, { name }];
        setProfile({ ...profile, skills: [...profile.skills, { name, elo: null, matchesPlayed: 0 }] });
        axios.put('/api/profile', { skills })
            .then(res => { setProfile(res.data); toast.success(`${name} added`); })
            .catch(() => { toast.error("Couldn't add the skill."); load(); });
    };

    const removeSkill = (name) => {
        const s = profile.skills.find(k => k.name === name);
        if (isRated(s) && !window.confirm(`Remove ${name}? Its rating and history will be deleted.`)) return;
        axios.put('/api/profile', { skills: profile.skills.filter(k => k.name !== name).map(k => k.name) })
            .then(res => { setProfile(res.data); if (graphSkill === name) setGraphSkill(''); })
            .catch(() => toast.error("Couldn't remove the skill."));
    };

    const sendInvite = async (roomId, message) => {
        try {
            await axios.post(`/api/rooms/${roomId}/send-invite`, { userId: profile._id, message });
            toast.success(`Invite sent to ${profile.username}`);
            setShowInvite(false);
        } catch (err) {
            toast.error(`Couldn't send the invite: ${err.response?.data?.msg || 'something went wrong'}`);
        }
    };

    if (loading && !profile) return <div className="ui-page"><Loading what="Loading the profile" full /></div>;
    if (!profile) return <div className="ui-page"><p className="ui-muted">Couldn't load this profile.</p></div>;

    const skills = profile.skills || [];
    const rated = skills.filter(isRated).sort((a, b) => b.elo - a.elo);
    const best = rated[0] || null;
    const bestRank = best ? rankOf(best.elo) : null;
    const cooldownUntil = profile.assessmentCooldownExpires ? new Date(profile.assessmentCooldownExpires) : null;
    const onCooldown = cooldownUntil && cooldownUntil > new Date();
    const unadded = availableSkills.filter(s => !skills.some(k => k.name === s));
    const links = LINKS.filter(l => profile.socialLinks?.[l.key]);

    const modes = summary?.battles?.modes || {};
    const totals = Object.values(modes).reduce((t, m) => ({ played: t.played + m.played, wins: t.wins + m.wins, losses: t.losses + m.losses }), { played: 0, wins: 0, losses: 0 });
    const playedModes = MODES.filter(m => modes[m.id]?.played);
    const recent = summary?.battles?.recent || [];
    const apps = summary?.apps || [];

    const graphEntry = skills.find(s => s.name === graphSkill);
    const graphData = graphEntry?.history?.length
        ? graphEntry.history.map((h, i) => ({ n: i + 1, elo: h.newElo }))
        : isRated(graphEntry) ? [{ n: 1, elo: graphEntry.elo }] : [];
    const elos = graphData.map(d => d.elo);

    const stats = [
        { label: 'Best rating', value: best ? best.elo : '—', sub: best ? <span style={{ color: bestRank.color }}>{bestRank.name} · {best.name}</span> : 'Take an assessment' },
        { label: 'Battles', value: totals.played, sub: totals.played ? `${totals.wins} won · ${totals.losses} lost` : 'None yet' },
        { label: 'Apps published', value: apps.length, sub: apps.length ? `${apps.reduce((n, a) => n + a.likes, 0)} likes` : 'None yet' },
        { label: 'Friends', value: summary?.friends ?? '—', sub: summary?.battles?.dailyStreak ? `🔥 ${summary.battles.dailyStreak}-day daily streak` : ' ' }
    ];

    return (
        <div className="ui-page pf-page">
            {editing && <EditProfileModal profile={profile} onClose={() => setEditing(false)} onSaved={(p) => { setProfile(p); setEditing(false); }} />}
            {showInvite && <InviteModal user={profile} rooms={myRooms} onSend={sendInvite} onClose={() => setShowInvite(false)} />}

            <section className="pf-hero" style={{ '--pf-accent': bestRank?.color || '#58a6ff' }}>
                <div className="pf-cover" aria-hidden="true" />
                <div className="pf-hero-body">
                    {profile.profilePicture
                        ? <img className="pf-avatar" src={profile.profilePicture} alt="" referrerPolicy="no-referrer" />
                        : <div className="pf-avatar" aria-hidden="true">{profile.username.slice(0, 1).toUpperCase()}</div>}
                    <div className="pf-id">
                        <div className="ui-path" aria-hidden="true"><span className="ui-prompt">❯</span> ~/u/{profile.username}</div>
                        <h1>{profile.username}</h1>
                        {bestRank && <span className="pf-rank" style={{ color: bestRank.color, borderColor: bestRank.color }}>{bestRank.name}</span>}
                        {profile.bio
                            ? <p className="pf-bio">{profile.bio}</p>
                            : isOwnProfile && <p className="pf-bio ui-muted">Add a short bio so people know what you build. <button className="ui-link" onClick={() => setEditing(true)}>Add bio</button></p>}
                        <div className="pf-meta">
                            {profile.location && <span><FaLocationDot aria-hidden="true" /> {profile.location}</span>}
                            {profile.company && <span><FaBuilding aria-hidden="true" /> {profile.company}</span>}
                            {profile.website && <a href={profile.website} target="_blank" rel="noreferrer"><FaGlobe aria-hidden="true" /> {hostOf(profile.website)}</a>}
                            {summary?.memberSince && <span><FaCalendar aria-hidden="true" /> Joined {new Date(summary.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
                        </div>
                        {links.length > 0 && (
                            <div className="pf-links">
                                {links.map(l => {
                                    const Icon = l.icon;
                                    return <a key={l.key} href={profile.socialLinks[l.key]} target="_blank" rel="noreferrer" aria-label={l.label} title={l.label}><Icon /></a>;
                                })}
                            </div>
                        )}
                    </div>
                    <div className="pf-actions">
                        {isOwnProfile ? (
                            <button className="ui-btn" onClick={() => setEditing(true)}>Edit profile</button>
                        ) : (
                            <>
                                <FriendButton userId={profile._id} className="ui-btn" onChange={() => load()} />
                                <button className="ui-btn" onClick={() => setShowInvite(true)}>Invite to room</button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            <div className="pf-stats">
                {stats.map(s => (
                    <div key={s.label} className="pf-stat">
                        <div className="ui-muted ui-small">{s.label}</div>
                        <div className="pf-stat-value">{s.value}</div>
                        <div className="ui-small ui-muted pf-stat-sub">{s.sub}</div>
                    </div>
                ))}
            </div>

            <div className="ui-tabs" role="tablist" aria-label="Profile">
                {[['overview', 'Overview'], ['battles', `Battles${totals.played ? ` · ${totals.played}` : ''}`], ['apps', `Apps${apps.length ? ` · ${apps.length}` : ''}`]].map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={tab === id} className={`ui-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>

            {tab === 'overview' && (
                <div className="ui-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 1.5fr)' }}>
                    <section className="ui-card">
                        <div className="ui-card-head"><h2>Skills</h2></div>
                        {skills.length > 0 ? (
                            <ul className="ui-list">
                                {[...rated, ...skills.filter(s => !isRated(s))].map(s => {
                                    const r = isRated(s) ? rankOf(s.elo) : null;
                                    return (
                                        <li key={s.name} className="ui-row pf-skill">
                                            <div className="ui-row-main">
                                                <button className="pf-skill-name" onClick={() => setGraphSkill(s.name)} aria-pressed={graphSkill === s.name} title="Show rating history">{s.name}</button>
                                                <span className="ui-row-sub" style={r ? { color: r.color } : undefined}>{r ? r.name : 'Not assessed yet'}</span>
                                            </div>
                                            {r && <span className="ui-num">{s.elo}</span>}
                                            {isOwnProfile && (
                                                <>
                                                    <button className="ui-btn small" disabled={onCooldown} onClick={() => navigate(`/assessment/${encodeURIComponent(s.name)}`)}>{r ? 'Reassess' : 'Assess'}</button>
                                                    <button className="ui-btn small quiet danger pf-remove" onClick={() => removeSkill(s.name)} aria-label={`Remove ${s.name}`} title="Remove">×</button>
                                                </>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <EmptyState compact title={isOwnProfile ? 'What do you code in?' : 'No skills yet'}>{isOwnProfile ? 'Add the skills you work with below, then take a short assessment to get a rating.' : `${profile.username} hasn't added any skills yet.`}</EmptyState>
                        )}
                        {isOwnProfile && onCooldown && (
                            <p className="ui-small" style={{ color: 'var(--term-gold)', margin: '10px 0 0' }}>Next assessment available at {cooldownUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
                        )}
                        {isOwnProfile && unadded.length > 0 && (
                            <form className="ui-inline" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); addSkill(skillToAdd || unadded[0]); setSkillToAdd(''); }}>
                                <select className="ui-select" value={skillToAdd || unadded[0]} onChange={e => setSkillToAdd(e.target.value)} aria-label="Skill to add">
                                    {unadded.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button className="ui-btn" type="submit">Add skill</button>
                            </form>
                        )}
                    </section>

                    <section className="ui-card">
                        <div className="ui-card-head">
                            <h2>Rating history{graphSkill ? ` · ${graphSkill}` : ''}</h2>
                        </div>
                        {graphData.length > 0 ? (
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={graphData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#21262d" />
                                        {RANKS.map(r => <ReferenceArea key={r.name} y1={r.min} y2={r.max} fill={r.color} fillOpacity={0.05} stroke="none" />)}
                                        <XAxis dataKey="n" tick={{ fontSize: 12, fill: '#8b949e' }} allowDecimals={false} />
                                        <YAxis domain={[Math.max(0, Math.min(...elos) - 150), Math.max(...elos) + 150]} tick={{ fontSize: 12, fill: '#8b949e' }} width={48} />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Line type="monotone" dataKey="elo" stroke="var(--ui-link)" strokeWidth={2.5}
                                            dot={{ r: 3, fill: 'var(--bg-dark)', stroke: 'var(--ui-link)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--ui-link)', stroke: '#fff', strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="ui-empty">
                                {skills.length === 0 ? 'Ratings show up here once there are skills to rate.'
                                    : `No rating for ${graphSkill || 'this skill'} yet.${isOwnProfile ? ' Take an assessment or play skill quiz battles to get one.' : ''}`}
                            </div>
                        )}
                        {rated.length > 1 && <p className="ui-small ui-muted" style={{ margin: '10px 0 0' }}>Click a skill to see its history.</p>}
                    </section>
                </div>
            )}

            {tab === 'battles' && (
                <div className="ui-grid">
                    <section className="ui-card">
                        <div className="ui-card-head"><h2>Recent battles</h2><Link to="/battle" className="ui-link ui-small">Go to battles</Link></div>
                        {recent.length > 0 ? (
                            <ul className="ui-list">
                                {recent.map(b => (
                                    <li key={b.id} className="ui-row">
                                        <span className={`pf-result ${b.result}`}>{b.result === 'won' ? 'Won' : b.result === 'lost' ? 'Lost' : b.result === 'draw' ? 'Draw' : '—'}</span>
                                        <div className="ui-row-main">
                                            <span className="ui-row-title" style={{ fontWeight: 500 }}>
                                                {modeName(b.kind)}{b.kind === 'quiz' && b.skill ? ` · ${b.skill}` : ''}
                                                {b.opponent && <> vs <Link to={`/profile/${b.opponent.userId}`} className="ui-link">{b.opponent.username}</Link></>}
                                            </span>
                                            <span className="ui-row-sub">{ago(b.endedAt)}</span>
                                        </div>
                                        {b.ratingChange != null && <span className={b.ratingChange >= 0 ? 'ui-up' : 'ui-down'}>{b.ratingChange >= 0 ? '+' : ''}{b.ratingChange}</span>}
                                    </li>
                                ))}
                            </ul>
                        ) : <EmptyState compact title="No battles yet" action={isOwnProfile ? { label: 'Find a battle', to: '/battle', primary: true } : null}>{isOwnProfile ? 'Ranked and friend battles you play show up here.' : `${profile.username} hasn't battled anyone yet.`}</EmptyState>}
                    </section>
                    <section className="ui-card">
                        <div className="ui-card-head"><h2>Ratings by mode</h2></div>
                        {playedModes.length > 0 ? (
                            <ul className="ui-list">
                                {playedModes.map(m => {
                                    const s = modes[m.id];
                                    return (
                                        <li key={m.id} className="ui-row">
                                            <span aria-hidden="true" style={{ fontSize: 18 }}>{m.icon}</span>
                                            <div className="ui-row-main">
                                                <span className="ui-row-title">{m.name}</span>
                                                <span className="ui-row-sub">{s.wins}W · {s.losses}L{s.draws ? ` · ${s.draws}D` : ''}{s.bestStreak > 1 ? ` · best streak ${s.bestStreak}` : ''}</span>
                                            </div>
                                            <span className="ui-num">{s.rating}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : <div className="ui-empty">Every battle mode has its own rating. Play one to get started.</div>}
                        {summary?.battles?.solved > 0 && <p className="ui-small ui-muted" style={{ margin: '10px 0 0' }}>{summary.battles.solved} different challenges solved.</p>}
                    </section>
                </div>
            )}

            {tab === 'apps' && (
                apps.length > 0 ? (
                    <div className="pf-apps">
                        {apps.map(a => (
                            <a key={a.slug} className="ui-card pf-app" href={a.url} target="_blank" rel="noreferrer">
                                <div className="pf-app-name">{a.name}</div>
                                {a.projectType && <span className="ui-tag">{a.projectType}</span>}
                                {a.description && <p>{a.description}</p>}
                                <div className="ui-small ui-muted pf-app-stats">♥ {a.likes} · {a.views} views{a.forks ? ` · ${a.forks} forks` : ''}</div>
                            </a>
                        ))}
                    </div>
                ) : (
                    <div className="ui-card">
                        <EmptyState title="No apps published yet" action={isOwnProfile ? { label: 'Browse the gallery', to: '/gallery' } : null}>
                            {isOwnProfile ? 'Deploy a project from the IDE and list it in the gallery, and it shows up here.' : `${profile.username} hasn't published any apps yet.`}
                        </EmptyState>
                    </div>
                )
            )}
        </div>
    );
};

export default ProfilePage;
