import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

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
            toast.error("Couldn't add them to the project.");
        }
    };
    
    const handleRemoveMember = async (memberId) => {
        try {
            const res = await axios.delete(`/api/projects/${project._id}/members/${memberId}`);
            setProjectMembers(res.data);
            if (onMembersUpdated) onMembersUpdated();
        } catch (err) {
            console.error("Failed to remove member:", err);
            toast.error("Couldn't remove them from the project.");
        }
    };
    
    const isMemberOfProject = (userId) => projectMembers.some(pm => pm._id === userId);
    
    // Check if user is the room owner
    const isRoomOwner = (userId) => roomOwner && (roomOwner === userId || roomOwner._id === userId);

    const available = roomMembers.filter(rm => !isMemberOfProject(rm._id));

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ui-modal" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="members-title">
                <h2 id="members-title">Who can work on {project.name}</h2>
                {loading ? <p className="ui-muted">Loading…</p> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                        <section>
                            <h3 style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>In this project</h3>
                            <ul className="ui-list">
                                {projectMembers.length === 0 && <li className="ui-empty" style={{ paddingTop: 6 }}>Nobody yet.</li>}
                                {projectMembers.map(member => {
                                    const owner = isRoomOwner(member._id);
                                    return (
                                        <li key={member._id} className="ui-row">
                                            <span className="ui-row-main">{member.username}</span>
                                            {owner
                                                ? <span className="ui-tag">Owner</span>
                                                : <button className="ui-btn small quiet danger" onClick={() => handleRemoveMember(member._id)}>Remove</button>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                        <section>
                            <h3 style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>Room members you can add</h3>
                            <ul className="ui-list">
                                {available.length === 0 && <li className="ui-empty" style={{ paddingTop: 6 }}>Everyone in the room is already in this project.</li>}
                                {available.map(member => (
                                    <li key={member._id} className="ui-row">
                                        <span className="ui-row-main">{member.username}</span>
                                        <button className="ui-btn small" onClick={() => handleAddMember(member._id)}>Add</button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                )}
                <div className="ui-modal-actions">
                    <button type="button" className="ui-btn ghost" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

export default ManageMembersModal;
