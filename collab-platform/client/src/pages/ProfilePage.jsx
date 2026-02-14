import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import AIAssessmentModal from '../components/assessment/AIAssessmentModal';
import AuthContext from '../context/AuthContext';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';

const availableSkills = [
    "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js", "Express.js",
    "Python", "Django", "Flask", "Java", "Spring Boot", "C#", ".NET",
    "MongoDB", "PostgreSQL", "MySQL", "Docker", "Kubernetes", "AWS", "Azure",
    "Git", "CI/CD", "HTML5", "CSS3", "Sass"
];

// --- CODEFORCES RANK DATA ---
const CF_RANKS = [
    { name: 'Newbie', min: 0, max: 1200, color: '#808080' },
    { name: 'Pupil', min: 1200, max: 1400, color: '#008000' },
    { name: 'Specialist', min: 1400, max: 1600, color: '#03A89E' },
    { name: 'Expert', min: 1600, max: 1900, color: '#0000FF' },
    { name: 'Candidate Master', min: 1900, max: 2100, color: '#AA00AA' },
    { name: 'Master', min: 2100, max: 2300, color: '#FF8C00' },
    { name: 'International Master', min: 2300, max: 2400, color: '#FF8C00' },
    { name: 'Grandmaster', min: 2400, max: 2600, color: '#FF0000' },
    { name: 'International Grandmaster', min: 2600, max: 3000, color: '#CC0000' },
    { name: 'Legendary Grandmaster', min: 3000, max: 5000, color: '#800000' }
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

    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSkillToAdd, setSelectedSkillToAdd] = useState(availableSkills[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [graphFilter, setGraphFilter] = useState('');

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
        } catch (err) {
            console.error("Failed to fetch profile:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    const handleModalClose = () => {
        setIsModalOpen(false);
        fetchProfile();
    };

    const handleAddSkill = () => {
        if (!profile || profile.skills.find(skill => skill.name === selectedSkillToAdd)) {
            alert("Skill already added!");
            return;
        }
        const newSkill = { name: selectedSkillToAdd, mastery: 0, elo: null, matchesPlayed: 0, isProvisional: true };
        const updatedSkills = [...profile.skills, newSkill];

        setProfile({ ...profile, skills: updatedSkills });
        setGraphFilter(selectedSkillToAdd);

        axios.put('/api/profile', { skills: updatedSkills })
            .then(res => setProfile(res.data))
            .catch(err => {
                console.error(err);
                alert("Failed to save skill.");
            });
    };

    // Helper: is this skill actually rated?
    const isRated = (s) => s && s.elo != null && (s.matchesPlayed || 0) > 0;
    const displayElo = (s) => isRated(s) ? s.elo : null;

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

    if (loading) return (
        <div className="dashboard-container" style={{ paddingTop: '2rem', color: 'var(--text-main)' }}>
            Loading Profile...
        </div>
    );
    if (!profile) return (
        <div className="dashboard-container" style={{ paddingTop: '2rem', color: 'var(--text-main)' }}>
            Could not load profile.
        </div>
    );

    const cooldownTime = profile.assessmentCooldownExpires ? new Date(profile.assessmentCooldownExpires) : null;
    const isOnCooldown = cooldownTime && cooldownTime > new Date();
    const graphData = getGraphData();

    const dataElos = graphData.map(d => d.elo);
    const minDataElo = Math.min(...dataElos);
    const maxDataElo = Math.max(...dataElos);
    const minGraphElo = Math.max(0, minDataElo - 200);
    const maxGraphElo = maxDataElo + 200;

    return (
        <div className="dashboard-container">
            {isOwnProfile && isModalOpen && (
                <AIAssessmentModal onClose={handleModalClose} userSkills={profile.skills} />
            )}

            {/* HEADER CARD */}
            <div className="term-card" style={{ marginBottom: '1.5rem' }}>
                <div className="term-header">
                    <div className="window-dots">
                        <div className="dot dot-red"></div>
                        <div className="dot dot-yellow"></div>
                        <div className="dot dot-green"></div>
                    </div>
                    <span>~/profile/{profile.username}</span>
                    {!isOwnProfile && (
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--term-gold)',
                            border: '1px solid var(--term-gold)', padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)'
                        }}>VIEWING</span>
                    )}
                </div>
                <div className="term-body" style={{
                    padding: '1.5rem', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--text-bright)',
                            fontFamily: 'var(--font-mono)'
                        }}>
                            {profile.username}
                        </h1>
                        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--term-blue)' }}>ID:</span> {profile._id}
                            <span style={{ margin: '0 10px', color: 'var(--border-subtle)' }}>|</span>
                            <span style={{ color: 'var(--term-blue)' }}>EMAIL:</span> {profile.email}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{
                            fontSize: '0.75rem', color: 'var(--text-muted)',
                            letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem'
                        }}>MAX RATING</div>
                        {(() => {
                            const ratedSkills = profile.skills.filter(s => isRated(s));
                            const maxElo = ratedSkills.length > 0 ? Math.max(...ratedSkills.map(s => s.elo)) : null;
                            return (
                                <div style={{
                                    fontSize: '1.8rem', fontWeight: 'bold',
                                    color: maxElo != null ? getRankColor(maxElo) : 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)'
                                }}>
                                    {maxElo != null ? getRankName(maxElo) : 'Unrated'}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            <div className="dashboard-grid" style={{
                gridTemplateColumns: isOwnProfile ? '300px 1fr' : '1fr',
                gap: '1.5rem'
            }}>

                {/* --- LEFT COLUMN (ONLY VISIBLE IF IT IS MY PROFILE) --- */}
                {isOwnProfile && (
                    <div className="dashboard-sidebar" style={{ gap: '1.5rem' }}>
                        {/* Skill Check Card */}
                        <div className="term-card">
                            <div className="term-header">
                                <span style={{ color: 'var(--term-blue)' }}>skill_check.exe</span>
                            </div>
                            <div className="term-body" style={{ padding: '1.5rem' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                    Take an AI-driven assessment to verify your skills and increase your rating.
                                </p>
                                <label style={{
                                    display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem',
                                    color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                                }}>SELECT_SKILL</label>
                                <select className="term-input" id="assessment-skill-select"
                                    defaultValue={profile.skills?.[0]?.name || ''}
                                    style={{ marginBottom: '1rem' }}>
                                    {profile.skills.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                </select>
                                <button className="btn-term-primary"
                                    onClick={() => {
                                        const skill = document.getElementById('assessment-skill-select').value;
                                        if (skill) window.location.href = `/assessment/${skill}`;
                                    }}
                                    disabled={isOnCooldown || profile.skills.length === 0}
                                    style={{ width: '100%', padding: '0.7rem' }}>
                                    {isOnCooldown ? 'COOLDOWN ACTIVE' : '⚡ START ASSESSMENT'}
                                </button>
                                {isOnCooldown && (
                                    <div style={{
                                        marginTop: '0.8rem', fontSize: '0.75rem',
                                        color: 'var(--term-gold)', textAlign: 'center',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        Next: {cooldownTime.toLocaleTimeString()}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Add Skill Card */}
                        <div className="term-card">
                            <div className="term-header">
                                <span style={{ color: 'var(--term-green)' }}>add_skill.sh</span>
                            </div>
                            <div className="term-body" style={{ padding: '1.5rem' }}>
                                <label style={{
                                    display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem',
                                    color: 'var(--term-blue)', fontFamily: 'var(--font-mono)'
                                }}>SKILL_NAME</label>
                                <select className="term-input" value={selectedSkillToAdd}
                                    onChange={e => setSelectedSkillToAdd(e.target.value)}
                                    style={{ marginBottom: '1rem' }}>
                                    {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={handleAddSkill} className="btn-term" style={{
                                    width: '100%', justifyContent: 'center', padding: '0.6rem',
                                    borderColor: 'var(--term-green)', color: 'var(--term-green)'
                                }}>
                                    + ADD TO PROFILE
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- RIGHT COLUMN (GRAPH) --- */}
                <div className="dashboard-main">
                    <div className="term-card">
                        <div className="term-header" style={{ justifyContent: 'space-between' }}>
                            <span>rating_history.log</span>
                            <select className="term-input" style={{
                                width: '180px', padding: '0.3rem 0.5rem', fontSize: '0.8rem',
                                border: '1px solid var(--border-subtle)'
                            }}
                                value={graphFilter} onChange={e => setGraphFilter(e.target.value)}>
                                {profile.skills.length === 0 && <option value="">No Skills Added</option>}
                                {profile.skills.map(s => (
                                    <option key={s.name} value={s.name}>{s.name} ({isRated(s) ? s.elo : 'Unrated'})</option>
                                ))}
                            </select>
                        </div>
                        <div className="term-body" style={{ padding: '1rem' }}>
                            <div style={{
                                width: '100%', height: 450, backgroundColor: 'var(--bg-deep)',
                                borderRadius: 'var(--radius-sm)', padding: '10px', position: 'relative',
                                border: '1px solid var(--border-subtle)'
                            }}>
                                {profile.skills.length > 0 && graphFilter ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={graphData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                            {CF_RANKS.map((rank) => (
                                                <ReferenceArea key={rank.name} y1={rank.min} y2={rank.max} fill={rank.color} fillOpacity={0.1} stroke="none" />
                                            ))}
                                            <XAxis dataKey="match" type="number" domain={['dataMin', 'dataMax']}
                                                tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                                                tickCount={graphData.length} interval={0} />
                                            <YAxis domain={[minGraphElo, maxGraphElo]}
                                                tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={50} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line type="monotone" dataKey="elo" stroke="var(--term-gold)" strokeWidth={3}
                                                dot={{ r: 4, fill: 'var(--bg-deep)', stroke: 'var(--term-gold)', strokeWidth: 2 }}
                                                activeDot={{ r: 7, fill: 'var(--term-gold)', stroke: 'var(--text-bright)', strokeWidth: 2 }}
                                                animationDuration={1500} isAnimationActive={true} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{
                                        height: '100%', display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'
                                    }}>
                                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>No Data Available</p>
                                        <p>Add a skill to your profile to see your rating graph.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;