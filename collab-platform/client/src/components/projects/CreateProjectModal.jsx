import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';


// Keep in sync with PROJECT_TYPES in server/models/Project.js
const PROJECT_TYPE_INFO = {
    'React App': 'React + Vite with hot reload · deploys as a static site',
    'MERN Stack': 'Express + MongoDB API with a React frontend on one port · deploys as a server',
    'Next.js': 'Next.js pages + API routes · deploys as a server',
    'Node.js API': 'Express REST API · deploys as a server',
    'Express + EJS': 'Server-rendered pages with EJS templates',
    'Vanilla Web': 'Plain HTML, CSS and JavaScript · deploys as a static site',
    'Python API (FastAPI)': 'FastAPI with interactive /docs · deploys as a server',
    'Python Script': 'Python scripts with an interactive terminal',
    'Machine Learning (Jupyter)': 'JupyterLab, pandas, scikit-learn, PyTorch, Kaggle CLI · deploys a Streamlit app',
    'Android (Expo)': 'React Native app: browser preview + your phone via Expo Go · deploys the web build'
};
const projectTypes = Object.keys(PROJECT_TYPE_INFO);

const CreateProjectModal = ({ roomId, onClose, onProjectCreated }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectType, setProjectType] = useState(projectTypes[0]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const body = { name, description, projectType, roomId };
            const res = await axios.post('/api/projects', body); // Relative URL
            onProjectCreated(res.data);
            onClose();
        } catch (err) {
            console.error(err.response?.data || err.message);
            toast.error(`Couldn't create the project: ${err.response?.data?.msg || err.message}`);
            setIsLoading(false);
        }
    };

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !isLoading && onClose()}>
            <form className="ui-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="new-project-title">
                <h2 id="new-project-title">New project</h2>
                <label className="ui-field">
                    <span>Name</span>
                    <input className="ui-input" placeholder="my-awesome-app" value={name} onChange={(e) => setName(e.target.value)} required autoFocus disabled={isLoading} />
                </label>
                <label className="ui-field">
                    <span>Description <small>(optional)</small></span>
                    <textarea className="ui-textarea" placeholder="What are you building?" value={description} onChange={(e) => setDescription(e.target.value)} rows="3" disabled={isLoading} />
                </label>
                <label className="ui-field">
                    <span>Template</span>
                    <select className="ui-select" value={projectType} onChange={(e) => setProjectType(e.target.value)} disabled={isLoading}>
                        {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <small>{PROJECT_TYPE_INFO[projectType]}</small>
                </label>
                <div className="ui-modal-actions">
                    <button type="button" className="ui-btn ghost" onClick={onClose} disabled={isLoading}>Cancel</button>
                    <button type="submit" className="ui-btn primary" disabled={isLoading || !name.trim()}>{isLoading ? 'Creating project…' : 'Create project'}</button>
                </div>
            </form>
        </div>
    );
};

export default CreateProjectModal;