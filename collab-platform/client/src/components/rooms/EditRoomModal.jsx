import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const EditRoomModal = ({ room, onClose, onRoomUpdated }) => {
    const [name, setName] = useState(room.name);
    const [description, setDescription] = useState(room.description || '');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await axios.put(`/api/rooms/${room._id}`, { name, description });
            toast.success('Room updated');
            onRoomUpdated(res.data);
            onClose();
        } catch (err) {
            toast.error(`Couldn't update the room: ${err.response?.data?.msg || 'something went wrong'}`);
            setSaving(false);
        }
    };

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <form className="ui-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="edit-room-title">
                <h2 id="edit-room-title">Edit room</h2>
                <label className="ui-field">
                    <span>Name</span>
                    <input className="ui-input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                </label>
                <label className="ui-field">
                    <span>Description</span>
                    <textarea className="ui-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <div className="ui-modal-actions">
                    <button type="button" className="ui-btn ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="ui-btn primary" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </form>
        </div>
    );
};

export default EditRoomModal;
