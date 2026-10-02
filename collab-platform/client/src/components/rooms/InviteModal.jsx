import React, { useState } from 'react';

/** Pick one of your rooms to invite someone to, with an optional message. */
const InviteModal = ({ user, rooms, onSend, onClose }) => {
    const [message, setMessage] = useState('');
    if (!user) return null;

    return (
        <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
                <h2 id="invite-title">Invite {user.username}</h2>
                {rooms && rooms.length > 0 ? (
                    <>
                        <label className="ui-field">
                            <span>Message <small>(optional)</small></span>
                            <input className="ui-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Want to join our team?" />
                        </label>
                        <ul className="ui-list">
                            {rooms.map(room => (
                                <li key={room._id} className="ui-row">
                                    <div className="ui-row-main">
                                        <span className="ui-row-title">{room.name}</span>
                                        {room.description && <span className="ui-row-sub">{room.description}</span>}
                                    </div>
                                    <button className="ui-btn small primary" onClick={() => onSend(room._id, message)}>Invite</button>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="ui-muted">You don't have any rooms yet. Create one first, then invite people to it.</p>
                )}
                <div className="ui-modal-actions">
                    <button className="ui-btn ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default InviteModal;
