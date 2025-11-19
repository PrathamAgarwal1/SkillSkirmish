import React, { useState } from 'react';
import axios from 'axios';


const EditRoomModal = ({ room, onClose, onRoomUpdated }) => {
    const [name, setName] = useState(room.name);
    const [description, setDescription] = useState(room.description || '');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const body = { name, description };
            const res = await axios.put(`/api/rooms/${room._id}`, body);
            onRoomUpdated(res.data);
            onClose();
        } catch (err) {
            console.error(err);
            alert('Failed to update room.');
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Edit Room</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Room Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditRoomModal;