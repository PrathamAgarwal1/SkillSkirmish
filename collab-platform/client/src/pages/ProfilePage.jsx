import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FriendButton from '../components/friends/FriendButton';
import '../components/friends/friends.css';
import { useParams, useNavigate } from 'react-router-dom';
import AIAssessmentModal from '../components/assessment/AIAssessmentModal';
import InviteModal from '../components/rooms/InviteModal';
import AuthContext from '../context/AuthContext';
import { socket } from '../socket';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';

const availableSkills = [
    "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js", "Express.js",
    "Python", "Django", "Flask", "Java", "Spring Boot", "C#", ".NET",
    "MongoDB", "PostgreSQL", "MySQL", "Docker", "Kubernetes", "AWS", "Azure",
    "Git", "CI/CD", "HTML5", "CSS3", "Sass"
];

// --- CODEFORCES-STYLE RANKS (colours lightened to stay readable on the dark background) ---
const CF_RANKS = [
    { name: 'Newbie', min: 0, max: 1200, color: '#9da5b0' },
    { name: 'Pupil', min: 1200, max: 1400, color: '#3fb950' },
    { name: 'Specialist', min: 1400, max: 1600, color: '#39c5bb' },
    { name: 'Expert', min: 1600, max: 1900, color: '#6ea8fe' },
    { name: 'Candidate Master', min: 1900, max: 2100, color: '#d2a8ff' },
    { name: 'Master', min: 2100, max: 2300, color: '#ffa657' },
    { name: 'International Master', min: 2300, max: 2400, color: '#ffa657' },
    { name: 'Grandmaster', min: 2400, max: 2600, color: '#ff7b72' },
    { name: 'International Grandmaster', min: 2600, max: 3000, color: '#ff6b6b' },
    { name: 'Legendary Grandmaster', min: 3000, max: 5000, color: '#ff4d4d' }
];

const getRankName = (elo) => {
    const rank = CF_RANKS.find(r => elo >= r.min && elo < r.max);
    return rank ? rank.name : 'Unrated';
};

const getRankColor = (elo) => {
    const rank = CF_RANKS.find(r => elo >= r.min && elo < r.max);
    return rank ? rank.color : '#808080';
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const rankName = getRankName(data.elo);

        return (
            <div style={{
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                color: 'var(--text-main)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                fontSize: '0.85rem', fontFamily: 'var(--font-mono)'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>Assessment {label + 1}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'center' }}>
                    <span>Rating:</span>
                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-bright)' }}>{data.elo}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'center', marginTop: '4px' }}>
                    <span>Rank:</span>
                    <span style={{ fontWeight: 'bold', color: getRankColor(data.elo) }}>{rankName}</span>
                </div>
            </div>
        );
    }
    return null;
};

const ProfilePage = () => {
    const { user: currentUser } = useContext(AuthContext);
    const { userId } = useParams();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSkillToAdd, setSelectedSkillToAdd] = useState(availableSkills[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [graphFilter, setGraphFilter] = useState('');

    // Edit Profile State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        username: '',
        github: '',
        linkedin: '',
        leetcode: ''
    });

    // Invite Logic State
    const [myRooms, setMyRooms] = useState([]);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const isOwnProfile = !userId || (currentUser && currentUser._id === userId);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const endpoint = userId ? `/api/profile/user/${userId}` : '/api/profile/me';
            const res = await axios.get(endpoint);
            setProfile(res.data);

            if (res.data.skills && res.data.skills.length > 0 && !graphFilter) {
                setGraphFilter(res.data.skills[0].name);
            }
            setEditForm({
                username: res.data.username || '',
                github: res.data.socialLinks?.github || '',
                linkedin: res.data.socialLinks?.linkedin || '',
                leetcode: res.data.socialLinks?.leetcode || ''
            });
        } catch (err) {
            console.error("Failed to fetch profile:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    // Fetch my rooms for invite functionality
    useEffect(() => {
        if (!isOwnProfile && currentUser) {
            axios.get('/api/rooms/myrooms')
                .then(res => setMyRooms(res.data))
                .catch(err => console.error("Failed to fetch rooms for invite", err));
        }
    }, [isOwnProfile, currentUser]);

    const handleModalClose = () => {
        setIsModalOpen(false);
        fetchProfile();
    };

    const handleAddSkill = (name) => {
        if (!profile || !name || profile.skills.find(skill => skill.name === name)) return;
        const newSkill = { name, mastery: 0, elo: null, matchesPlayed: 0, isProvisional: true };
        const updatedSkills = [...profile.skills, newSkill];

        setProfile({ ...profile, skills: updatedSkills });
        setGraphFilter(name);

        axios.put('/api/profile', { skills: updatedSkills })
            .then(res => { setProfile(res.data); toast.success(`${name} added`); })
            .catch(err => {
                console.error(err);
                toast.error("Couldn't save the skill.");
            });
    };

    const isRated = (s) => s && s.elo != null && (s.matchesPlayed || 0) > 0;

    const handleSaveProfile = async () => {
        try {
            const res = await axios.put('/api/profile', {
                username: editForm.username,
                socialLinks: {
                    ...profile.socialLinks,
                    github: editForm.github,
                    linkedin: editForm.linkedin,
                    leetcode: editForm.leetcode
                }
            });
            setProfile(res.data);
            setIsEditing(false);
            if (res.data.username !== profile.username) {
                socket.emit('profileUpdated', { userId: profile._id, username: res.data.username });
            }
        } catch (err) {
            toast.error(`Couldn't save your profile: ${err.response?.data?.msg || 'something went wrong'}`);
        }
    };

    const handleSendInvite = async (roomId, message) => {
        try {
            await axios.post(`/api/rooms/${roomId}/send-invite`, {
                userId: profile._id,
                message
            });
            toast.success(`Invite sent to ${profile.username}`);
            setShowInviteModal(false);
        } catch (err) {
            toast.error(`Couldn't send the invite: ${err.response?.data?.msg || 'something went wrong'}`);
        }
    };

    // --- GRAPH DATA GENERATION ---
    const getGraphData = () => {
        if (!profile || !graphFilter) return [];
        const skill = profile.skills.find(s => s.name === graphFilter);
        if (!skill) return [];
        if (skill.history && skill.history.length > 0) {
            return skill.history.map((h, i) => ({ match: i, elo: h.newElo }));
        }
        if (isRated(skill)) {
            return [{ match: 0, elo: skill.elo }];
        }
        return [];
    };

    if (loading) return <div className="ui-page"><p className="ui-muted">Loading profile…</p></div>;
    if (!profile) return <div className="ui-page"><p className="ui-muted">Couldn't load this profile.</p></div>;

    const cooldownTime = profile.assessmentCooldownExpires ? new Date(profile.assessmentCooldownExpires) : null;
    const isOnCooldown = cooldownTime && cooldownTime > new Date();
    const graphData = getGraphData();

    const dataElos = graphData.map(d => d.elo);
    const minGraphElo = Math.max(0, Math.min(...dataElos) - 200);
    const maxGraphElo = Math.max(...dataElos) + 200;

    const ratedSkills = profile.skills.filter(isRated);
    const bestElo = ratedSkills.length ? Math.max(...ratedSkills.map(s => s.elo)) : null;
    const unaddedSkills = availableSkills.filter(s => !profile.skills.some(k => k.name === s));
    const links = [['GitHub', profile.socialLinks?.github], ['LinkedIn', profile.socialLinks?.linkedin], ['LeetCode', profile.socialLinks?.leetcode]].filter(([, url]) => url);
    const setField = (key) => (e) => setEditForm({ ...editForm, [key]: e.target.value });

    return (
        <div className="ui-page">
            {isOwnProfile && isModalOpen && <AIAssessmentModal onClose={handleModalClose} userSkills={profile.skills} />}

            <section className="ui-card" style={{ marginBottom: 20 }}>
                {!isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                        <div className="nav-avatar" style={{ width: 64, height: 64, fontSize: 26 }} aria-hidden="true">{profile.username.slice(0, 1).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <h1 style={{ margin: 0, fontSize: 26 }}>{profile.username}</h1>
                            <div className="ui-muted" style={{ marginTop: 4, fontSize: 14 }}>
                                {bestElo != null
                                    ? <><span style={{ color: getRankColor(bestElo), fontWeight: 600 }}>{getRankName(bestElo)}</span> · best rating <span className="ui-num">{bestElo}</span></>
                                    : 'Unrated so far'}
                                {links.length > 0 && <span> · {links.map(([label, url], i) => <React.Fragment key={label}>{i > 0 && ' · '}<a className="ui-link" href={url} target="_blank" rel="noreferrer">{label}</a></React.Fragment>)}</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {isOwnProfile ? (
                                <button className="ui-btn" onClick={() => setIsEditing(true)}>Edit profile</button>
                            ) : (
                                <>
                                    <FriendButton userId={profile._id} className="ui-btn" />
                                    <button className="ui-btn" onClick={() => setShowInviteModal(true)}>Invite to room</button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}>
                        <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Edit profile</h2>
                        <div style={{ display: 'grid', gap: '0 16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                            <label className="ui-field"><span>Username</span><input className="ui-input" value={editForm.username} onChange={setField('username')} /></label>
                            <label className="ui-field"><span>GitHub URL</span><input className="ui-input" value={editForm.github} onChange={setField('github')} placeholder="https://github.com/you" /></label>
                            <label className="ui-field"><span>LinkedIn URL</span><input className="ui-input" value={editForm.linkedin} onChange={setField('linkedin')} placeholder="https://linkedin.com/in/you" /></label>
                            <label className="ui-field"><span>LeetCode URL</span><input className="ui-input" value={editForm.leetcode} onChange={setField('leetcode')} placeholder="https://leetcode.com/you" /></label>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="ui-btn primary">Save</button>
                            <button type="button" className="ui-btn ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                        </div>
                    </form>
                )}
            </section>

            <div className="ui-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 1.6fr)' }}>
                <section className="ui-card">
                    <div className="ui-card-head"><h2>Skills</h2></div>
                    {isOwnProfile && <p>Take a short assessment to get a rating for a skill. Ratings also move with skill quiz battles.</p>}
                    {profile.skills.length > 0 ? (
                        <ul className="ui-list">
                            {profile.skills.map(s => (
                                <li key={s.name} className="ui-row">
                                    <div className="ui-row-main">
                                        <span className="ui-row-title">{s.name}</span>
                                        <span className="ui-row-sub" style={isRated(s) ? { color: getRankColor(s.elo) } : undefined}>{isRated(s) ? getRankName(s.elo) : 'Not assessed yet'}</span>
                                    </div>
                                    {isRated(s) && <span className="ui-num">{s.elo}</span>}
                                    {isOwnProfile && (
                                        <button className="ui-btn small" disabled={isOnCooldown} onClick={() => navigate(`/assessment/${encodeURIComponent(s.name)}`)}>
                                            Assess
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="ui-empty">{isOwnProfile ? 'Add the skills you work with, then take an assessment.' : 'No skills added yet.'}</div>
                    )}
                    {isOwnProfile && isOnCooldown && (
                        <p className="ui-small" style={{ color: 'var(--term-gold)', margin: '10px 0 0' }}>You can take another assessment at {cooldownTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
                    )}
                    {isOwnProfile && unaddedSkills.length > 0 && (
                        <div className="ui-inline" style={{ marginTop: 14 }}>
                            <select className="ui-select" value={unaddedSkills.includes(selectedSkillToAdd) ? selectedSkillToAdd : unaddedSkills[0]} onChange={e => setSelectedSkillToAdd(e.target.value)} aria-label="Skill to add">
                                {unaddedSkills.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button className="ui-btn" onClick={() => handleAddSkill(unaddedSkills.includes(selectedSkillToAdd) ? selectedSkillToAdd : unaddedSkills[0])}>Add skill</button>
                        </div>
                    )}
                </section>

                <section className="ui-card">
                    <div className="ui-card-head">
                        <h2>Rating history</h2>
                        {profile.skills.length > 0 && (
                            <select className="ui-select" style={{ width: 'auto', padding: '5px 10px' }} value={graphFilter} onChange={e => setGraphFilter(e.target.value)} aria-label="Skill">
                                {profile.skills.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </select>
                        )}
                    </div>
                    {graphData.length > 0 ? (
                        <div style={{ width: '100%', height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#21262d" />
                                    {CF_RANKS.map((rank) => (
                                        <ReferenceArea key={rank.name} y1={rank.min} y2={rank.max} fill={rank.color} fillOpacity={0.05} stroke="none" />
                                    ))}
                                    <XAxis dataKey="match" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 12, fill: '#8b949e' }} tickCount={graphData.length} interval={0} />
                                    <YAxis domain={[minGraphElo, maxGraphElo]} tick={{ fontSize: 12, fill: '#8b949e' }} width={50} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line type="monotone" dataKey="elo" stroke="#58a6ff" strokeWidth={2.5}
                                        dot={{ r: 3, fill: '#0d1117', stroke: '#58a6ff', strokeWidth: 2 }}
                                        activeDot={{ r: 6, fill: '#58a6ff', stroke: '#fff', strokeWidth: 2 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="ui-empty">
                            {profile.skills.length === 0
                                ? 'Ratings show up here once there are skills to rate.'
                                : `No rating for ${graphFilter || 'this skill'} yet.${isOwnProfile ? ' Take an assessment to get one.' : ''}`}
                        </div>
                    )}
                </section>
            </div>

            {showInviteModal && <InviteModal user={profile} rooms={myRooms} onSend={handleSendInvite} onClose={() => setShowInviteModal(false)} />}
        </div>
    );
};

export default ProfilePage;