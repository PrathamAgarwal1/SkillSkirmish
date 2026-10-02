import React, { useEffect, useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import WindowManager from '../components/ide/WindowManager';
import AuthContext from '../context/AuthContext';
import FloatingCall from '../components/voice/FloatingCall';
import { Loading } from '../components/layout/Friendly';

const IDEPage = () => {
    const { projectId, roomId } = useParams();
    const { user } = useContext(AuthContext);
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [roomName, setRoomName] = useState('');

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const res = await axios.get(`/api/projects/${projectId}`);
                setProject(res.data);
                setLoading(false);
                // For the voice window's title (non-critical)
                axios.get(`/api/rooms/${res.data.room}`).then(r => setRoomName(r.data.name)).catch(() => {});
            } catch (err) {
                console.error("Failed to fetch project", err);
                setLoading(false);
            }
        };
        
        fetchProject();
    }, [projectId]);

    if (loading) {
        return <div className="ui-page"><Loading what="Opening the project" full /></div>;
    }

    if (!project) {
        return <div style={{ padding: '20px' }}><h1>Project not found or Access Denied</h1></div>;
    }

    return (
        <>
            <WindowManager
                projectId={projectId}
                projectType={project.projectType || 'React App'}
                projectName={project.name}
                roomId={roomId}
                user={user}
            />
            <FloatingCall roomId={String(project.room)} roomName={roomName} />
        </>
    );
};

export default IDEPage;