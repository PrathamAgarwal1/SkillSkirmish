import React, { useState } from 'react';
import axios from 'axios';

const EditProjectModal = ({ project, onClose, onProjectUpdated }) => {
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description || '');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`/api/projects/${project._id}`, { name, description });
            if (onProjectUpdated) onProjectUpdated();
            onClose();
        } catch (err) {
            // --- FIX for unused 'err' ---
            console.error("Failed to update project:", err);
            alert('Failed to update project.');
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Edit Project "{project.name}"</h2>
                <form onSubmit={handleSubmit}>
                    {/* --- FIX for unused 'setName' and 'setDescription' --- */}
                    <div className="form-group">
                        <label>Project Name</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea 
                            value={description} 
                            onChange={(e) => setDescription(e.target.value)}
                            rows="4"
                        ></textarea>
                    </div>
                    {/* --- END OF FIX --- */}
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditProjectModal;