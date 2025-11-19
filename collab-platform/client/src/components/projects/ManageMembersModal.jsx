import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ManageMembersModal = ({ project, roomMembers, onClose, onMembersUpdated }) => {
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

    if (loading) {
        return (
            <div className="modal-backdrop">
                <div className="modal-content"><h2>Loading...</h2></div>
            </div>
        );
    }

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Manage Members for "{project.name}"</h2>
                <div className="members-management-grid">
                    <div>
                        <h4>Project Members</h4>
                        <ul className="member-list">
                            {projectMembers.map(member => (
                                <li key={member._id} className="member-item">
                                    <span>{member.username}</span>
                                    <button
                                        className="btn-action btn-delete"
                                        onClick={() => handleRemoveMember(member._id)}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4>Add from Room</h4>
                        <ul className="member-list">
                            {roomMembers
                                .filter(rm => !isMemberOfProject(rm._id))
                                .map(member => (
                                    <li key={member._id} className="member-item">
                                        <span>{member.username}</span>
                                        <button
                                            className="btn-action btn-edit"
                                            onClick={() => handleAddMember(member._id)}
                                        >
                                            Add
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    </div>
                </div>
                <div className="modal-actions">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}; // ✅ <-- This closing curly brace fixes your parsing error

export default ManageMembersModal;
