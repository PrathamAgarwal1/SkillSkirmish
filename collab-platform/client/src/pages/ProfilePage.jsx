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

// --- DARK MODE CODEFORCES RANK DATA ---
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
                backgroundColor: '#161b22', 
                border: '1px solid #30363d', 
                padding: '10px 14px', 
                borderRadius: '6px', 
                color: '#c9d1d9', 
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-code)'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#8b949e' }}>Assessment {label + 1}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'center' }}>
                    <span>Rating:</span>
                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{data.elo}</span>
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
    const { userId } = useParams(); // Will be undefined if visiting /profile (my profile)
    
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSkillToAdd, setSelectedSkillToAdd] = useState(availableSkills[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [graphFilter, setGraphFilter] = useState('');

    // Determine if we are viewing our own profile
    // 1. No userId param = viewing "me"
    // 2. userId matches our logged-in ID = viewing "me"
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
        const newSkill = { name: selectedSkillToAdd, mastery: 0, elo: 1200 };
        const updatedSkills = [...profile.skills, newSkill];
        
        // Optimistic UI update
        setProfile({ ...profile, skills: updatedSkills });
        setGraphFilter(selectedSkillToAdd);

        // Backend update
        axios.put('/api/profile', { skills: updatedSkills })
            .then(res => setProfile(res.data))
            .catch(err => {
                console.error(err);
                alert("Failed to save skill.");
            });
    };

    // --- GRAPH DATA GENERATION ---
    const getGraphData = () => {
        if (!profile || !graphFilter) return [];
        
        const skill = profile.skills.find(s => s.name === graphFilter);
        if (!skill) return [];

        const currentElo = skill.elo || 1200;
        const startElo = 1200;
        
        const data = [];
        const points = 10; 
        
        for (let i = 0; i < points; i++) {
            const progress = i / (points - 1);
            const easedProgress = progress; 

            let estimatedElo = startElo + (currentElo - startElo) * easedProgress;
            
            data.push({
                match: i,
                elo: Math.round(estimatedElo)
            });
        }
        return data;
    };

    if (loading) return <div className="container" style={{ paddingTop: '2rem', color: '#fff' }}>Loading Profile...</div>;
    if (!profile) return <div className="container" style={{ paddingTop: '2rem', color: '#fff' }}>Could not load profile.</div>;

    const cooldownTime = profile.assessmentCooldownExpires ? new Date(profile.assessmentCooldownExpires) : null;
    const isOnCooldown = cooldownTime && cooldownTime > new Date();
    const graphData = getGraphData();
    
    const dataElos = graphData.map(d => d.elo);
    const minDataElo = Math.min(...dataElos);
    const maxDataElo = Math.max(...dataElos);
    const minGraphElo = Math.max(0, minDataElo - 200); 
    const maxGraphElo = maxDataElo + 200;

    return (
        <div className="container">
            {isOwnProfile && isModalOpen && (
                <AIAssessmentModal onClose={handleModalClose} userSkills={profile.skills} />
            )}

            <div className="main-panel" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fff' }}>
                        {profile.username} 
                        {!isOwnProfile && <span style={{fontSize: '0.8rem', color: '#888', marginLeft: '10px', border: '1px solid #444', padding: '2px 6px', borderRadius: '4px'}}>VIEWING</span>}
                    </h1>
                    <div style={{ fontFamily: 'var(--font-code)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <span style={{ color: '#888' }}>ID:</span> {profile._id} <span style={{ margin: '0 10px', color: '#444' }}>|</span> <span style={{ color: '#888' }}>EMAIL:</span> {profile.email}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                     <div style={{ fontSize: '0.8rem', color: '#888', letterSpacing: '1px' }}>MAX RATING</div>
                     <div style={{ 
                         fontSize: '2rem', 
                         fontWeight: 'bold', 
                         color: getRankColor(Math.max(...profile.skills.map(s => s.elo || 1200), 1200)),
                         textShadow: '0 0 20px rgba(0,0,0,0.5)'
                     }}>
                         {getRankName(Math.max(...profile.skills.map(s => s.elo || 1200), 1200))}
                     </div>
                </div>
            </div>

            <div className="dashboard-layout" style={{ gridTemplateColumns: isOwnProfile ? '300px 1fr' : '1fr', gap: '1.5rem' }}>
                
                {/* --- LEFT COLUMN (ONLY VISIBLE IF IT IS MY PROFILE) --- */}
                {isOwnProfile && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="feature-card" style={{ borderColor: 'var(--accent-primary)' }}>
                            <h3 style={{ color: 'var(--accent-primary)', margin: '0 0 1rem 0' }}>// SKILL CHECK</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                Take an AI-driven assessment to verify your skills and increase your rating.
                            </p>
                            <button className="btn" onClick={() => setIsModalOpen(true)} disabled={isOnCooldown || false} style={{ width: '100%' }}>
                                {isOnCooldown ? 'COOLDOWN ACTIVE' : 'START ASSESSMENT'}
                            </button>
                            {isOnCooldown && <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#ffcc00', textAlign: 'center' }}>Next: {cooldownTime.toLocaleTimeString()}</div>}
                        </div>

                        <div className="main-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginTop: 0 }}>ADD SKILL</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <select 
                                    value={selectedSkillToAdd} 
                                    onChange={e => setSelectedSkillToAdd(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '4px' }}
                                >
                                    {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={handleAddSkill} className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>+ Add to Profile</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- RIGHT COLUMN (GRAPH) --- */}
                <div className="main-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0 }}>RATING HISTORY</h3>
                        <select 
                            value={graphFilter} 
                            onChange={e => setGraphFilter(e.target.value)}
                            style={{ width: '200px', padding: '0.5rem', background: '#0d1117', color: '#fff', border: '1px solid #30363d', borderRadius: '4px' }}
                        >
                            {profile.skills.length === 0 && <option value="">No Skills Added</option>}
                            {profile.skills.map(s => (
                                <option key={s.name} value={s.name}>{s.name} ({s.elo || 1200})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ width: '100%', height: 450, backgroundColor: '#0d1117', borderRadius: '4px', padding: '10px', position: 'relative', border: '1px solid #30363d' }}>
                        {profile.skills.length > 0 && graphFilter ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#30363d" />
                                    {CF_RANKS.map((rank) => (
                                        <ReferenceArea key={rank.name} y1={rank.min} y2={rank.max} fill={rank.color} fillOpacity={0.1} stroke="none" />
                                    ))}
                                    <XAxis dataKey="match" type="number" domain={['dataMin', 'dataMax']} tick={{fontSize: 12, fill: '#8b949e'}} tickCount={graphData.length} interval={0} />
                                    <YAxis domain={[minGraphElo, maxGraphElo]} tick={{fontSize: 12, fill: '#8b949e'}} width={50} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line type="monotone" dataKey="elo" stroke="#FFC107" strokeWidth={3} dot={{ r: 4, fill: '#0d1117', stroke: '#FFC107', strokeWidth: 2 }} activeDot={{ r: 7, fill: '#FFC107', stroke: '#fff', strokeWidth: 2 }} animationDuration={1500} isAnimationActive={true} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#c9d1d9' }}>No Data Available</p>
                                <p>Add a skill to your profile to see your rating graph.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;