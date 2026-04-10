import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ManageMembersModal = ({ project, roomMembers, roomOwner, onClose, onMembersUpdated }) => {
    const [projectMembers, setProjectMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- THIS IS THE FIX ---
    // We will now properly use this useEffect to fetch fresh data
    useEffect(() => {
        const fetchProjectDetails = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`/api/projects/${project._id}`);
                setProjectMembers(res.data.members); // Use the populated members from the API response
            } catch (error) {
                console.error("Failed to fetch project details", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchProjectDetails(); // Call the function
    }, [project._id]);
    // --- END OF FIX ---

    const handleAddMember = async (userId) => {
        try {
            const res = await axios.post(`/api/projects/${project._id}/members`, { userId });
            setProjectMembers(res.data);
            if (onMembersUpdated) onMembersUpdated();
        } catch (err) {
            console.error("Failed to add member:", err);
            alert('Failed to add member.');
        }
    };
    
    const handleRemoveMember = async (memberId) => {
        try {
            const res = await axios.delete(`/api/projects/${project._id}/members/${memberId}`);
            setProjectMembers(res.data);
            if (onMembersUpdated) onMembersUpdated();
        } catch (err) {
            console.error("Failed to remove member:", err);
            alert('Failed to remove member.');
        }
    };
    
    const isMemberOfProject = (userId) => projectMembers.some(pm => pm._id === userId);
    
    // Check if user is the room owner
    const isRoomOwner = (userId) => roomOwner && (roomOwner === userId || roomOwner._id === userId);

    if (loading) {
        return (
            <div className="modal-backdrop" style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(5px)' }}>
                <div className="term-card" style={{ width: '300px', maxWidth: '90%', textAlign: 'center' }}>
                    <div className="term-body">
                        <h3 style={{ color: 'var(--term-blue)' }}>Loading data...</h3>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-backdrop" style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(5px)' }}>
            <div className="term-card" style={{ width: '600px', maxWidth: '95%', animation: 'fadeIn 0.3s' }}>
                <div className="term-header">
                    <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                    <span>manage_members.sh</span>
                </div>
                <div className="term-body">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--term-blue)' }}>
                        &gt; Managing Access: {project.name}
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        
                        {/* Current Members List */}
                        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '1rem', borderRadius: '4px' }}>
                            <h4 style={{ color: '#8b949e', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>$ PROJECT_MEMBERS</h4>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                                {projectMembers.length === 0 && <li style={{ color: '#484f58', fontSize: '0.9rem', fontStyle: 'italic' }}>No members added yet.</li>}
                                {projectMembers.map(member => {
                                    const owner = isRoomOwner(member._id);
                                    return (
                                    <li key={member._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #1f1f1f' }}>
                                        <span style={{ color: '#c9d1d9', fontSize: '0.9rem' }}>
                                            {member.username} 
                                            {owner && <span style={{color: '#f0883e', fontSize: '0.75rem', marginLeft: '6px', fontWeight: 'bold'}}>[LEADER]</span>}
                                        </span>
                                        {!owner ? (
                                            <button
                                                className="btn-term"
                                                onClick={() => handleRemoveMember(member._id)}
                                                style={{ color: '#f85149', borderColor: 'transparent', padding: '4px 8px' }}
                                            >
                                                REMOVE
                                            </button>
                                        ) : (
                                            <span style={{ color: '#8b949e', fontSize: '0.75rem', padding: '4px 8px', fontStyle: 'italic' }}>OWNER</span>
                                        )}
                                    </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {/* Room Members List (to add) */}
                        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '1rem', borderRadius: '4px' }}>
                            <h4 style={{ color: '#8b949e', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>$ AVAILABLE_USERS</h4>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '250px', overflowY: 'auto' }}>
                                {roomMembers.filter(rm => !isMemberOfProject(rm._id)).length === 0 && (
                                    <li style={{ color: '#484f58', fontSize: '0.9rem', fontStyle: 'italic' }}>Everyone is already in the project.</li>
                                )}
                                {roomMembers
                                    .filter(rm => !isMemberOfProject(rm._id))
                                    .map(member => (
                                        <li key={member._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #1f1f1f' }}>
                                            <span style={{ color: '#c9d1d9', fontSize: '0.9rem' }}>{member.username}</span>
                                            <button
                                                className="btn-term"
                                                onClick={() => handleAddMember(member._id)}
                                                style={{ color: '#3fb950', borderColor: 'transparent', padding: '4px 8px' }}
                                            >
                                                ADD
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                    
                    <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn-term" onClick={onClose}>CLOSE</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManageMembersModal;
