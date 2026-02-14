import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import WindowManager from '../components/ide/WindowManager';

const IDEPage = () => {
    const { projectId, roomId } = useParams();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const res = await axios.get(`/api/projects/${projectId}`);
                setProject(res.data);
                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch project", err);
                setLoading(false);
            }
        };
        
        fetchProject();
    }, [projectId]);

    if (loading) {
        return <div style={{ padding: '20px' }}><h1>Loading...</h1></div>;
    }

    if (!project) {
        return <div style={{ padding: '20px' }}><h1>Project not found</h1></div>;
    }

    return (
        <WindowManager 
            projectId={projectId}
            projectType={project.projectType || 'React App'}
            roomId={roomId}
        />
    );
};

export default IDEPage;