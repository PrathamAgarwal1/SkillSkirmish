import React, { useState } from 'react';
import axios from 'axios';


const projectTypes = ['React App', 'Node.js API', 'Static HTML/CSS', 'Python Script'];

const CreateProjectModal = ({ roomId, onClose, onProjectCreated }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectType, setProjectType] = useState(projectTypes[0]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const body = { name, description, projectType, roomId };
            const res = await axios.post('/api/projects', body); // Relative URL
            onProjectCreated(res.data);
            onClose();
        } catch (err) {
            console.error(err.response.data);
            alert('Failed to create project. Only the room owner can create projects.');
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Create New Project</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Project Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
                    </div>
                    <div className="form-group">
                        <label>Project Type</label>
                        <select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                            {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn">Create</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;