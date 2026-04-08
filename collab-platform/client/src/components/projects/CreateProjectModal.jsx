import React, { useState } from 'react';
import axios from 'axios';


const projectTypes = ['MERN Stack', 'React App', 'Node.js API', 'Vanilla Web', 'Express + EJS'];

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
            alert('Failed to create project. Only the room owner can create projects.');
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(5px)' }}>
            <div className="term-card" style={{ width: '500px', maxWidth: '90%', animation: 'fadeIn 0.3s' }}>
                <div className="term-header">
                    <div className="window-dots"><div className="dot dot-red"></div><div className="dot dot-yellow"></div><div className="dot dot-green"></div></div>
                    <span>init_project_wizard.exe</span>
                </div>
                <div className="term-body">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--term-blue)' }}>&gt; Initialize Repository</h2>
                    
                    {isLoading ? (
                        <div style={{ padding: '2rem', background: '#0a0a0a', borderRadius: '4px', border: '1px solid #333' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', color: '#3fb950', fontSize: '0.9rem', lineHeight: '1.8' }}>
                                <div>&gt; Allocating container space for '{name}'... <span style={{color: '#58a6ff'}}>[OK]</span></div>
                                <div style={{ animation: 'fadeIn 0.5s 0.3s both' }}>&gt; Fetching '{projectType}' template blueprint...</div>
                                <div style={{ animation: 'fadeIn 0.5s 0.8s both' }}>&gt; Cloning template files to disk...</div>
                                <div style={{ animation: 'fadeIn 0.5s 1.5s both' }}>&gt; Writing configuration to database...</div>
                                <div style={{ margin: '1.5rem 0 0 0', color: '#f0883e', animation: 'fadeIn 0.5s 2.2s both' }}>
                                    &gt; Finalizing project setup... <span className="blink">█</span>
                                </div>
                            </div>
                            <style>{`
                                .blink { animation: blinker 1s step-start infinite; }
                                @keyframes blinker { 50% { opacity: 0; } }
                                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                            `}</style>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>Project Name:</label>
                                <input type="text" className="term-input" placeholder="e.g. my-awesome-app" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>Description:</label>
                                <textarea className="term-input" placeholder="Short description..." value={description} onChange={(e) => setDescription(e.target.value)} rows="3"></textarea>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>Stack / Template:</label>
                                <select className="term-input" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                                    {projectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" className="btn-term" onClick={onClose} disabled={isLoading}>CANCEL</button>
                                <button type="submit" className="btn-term-primary" disabled={isLoading}>INIT PROJECT</button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateProjectModal;