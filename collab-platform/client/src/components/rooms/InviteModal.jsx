import React from 'react';

const InviteModal = ({ user, rooms, onSend, onClose }) => {
    if (!user) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: '#0d0d0d',
                border: '2px solid #00ff00',
                borderRadius: '4px',
                padding: '2rem',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)'
            }}>
                <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>
                    Invite {user.username} to Room
                </h3>
                {rooms && rooms.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1rem' }}>
                        {rooms.map(room => (
                            <li key={room._id} style={{
                                padding: '0.8rem',
                                borderBottom: '1px solid #333',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span>{room.name}</span>
                                    <button
                                        className="btn-term-sm"
                                        onClick={() => {
                                            const msg = prompt(`Add a message for ${user.username}? (Optional)`);
                                            onSend(room._id, msg);
                                        }}
                                    >
                                        SEND
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{ color: '#999', marginBottom: '1rem' }}>
                        You don't have any rooms to invite users to. Create one first!
                    </p>
                )}
                <button
                    className="btn-term"
                    onClick={onClose}
                    style={{ width: '100%' }}
                >
                    CLOSE
                </button>
            </div>
        </div>
    );
};

export default InviteModal;
