import React, { useState } from 'react';
import axios from 'axios';
import { FaMicrophoneSlash, FaVideo, FaPlus, FaTrash, FaPen } from 'react-icons/fa';
import { MdHeadsetOff, MdVolumeUp } from 'react-icons/md';
import { useVoice, useRoomVoice } from '../../voice/voiceContext';
import Avatar from './Avatar';
import VolumeMenu from './VolumeMenu';
import './voice.css';

/**
 * Sidebar list of a room's voice channels, Discord style: click a channel to join, see who's in
 * each one live (speaking ring, muted/deafened, camera, LIVE screen share). Right-click someone in
 * your channel to change their volume.
 */
const VoiceChannelList = ({ roomId, roomName, isOwner, userId }) => {
    const voice = useVoice();
    const { channels, maxUsers, speaking: remoteSpeaking } = useRoomVoice(roomId);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [editing, setEditing] = useState(null); // { id, name }
    const [menu, setMenu] = useState(null);       // { x, y, member }
    const [error, setError] = useState('');

    const call = async (fn) => {
        setError('');
        try { await fn(); } catch (err) { setError(err.response?.data?.msg || err.message); }
    };

    const create = () => call(async () => {
        if (!newName.trim()) return;
        await axios.post(`/api/rooms/${roomId}/voice-channels`, { name: newName });
        setNewName('');
        setCreating(false);
    });
    const rename = () => call(async () => {
        await axios.patch(`/api/rooms/${roomId}/voice-channels/${editing.id}`, { name: editing.name });
        setEditing(null);
    });
    const remove = (c) => window.confirm(`Delete the voice channel "${c.name}"? Anyone in it will be disconnected.`) &&
        call(() => axios.delete(`/api/rooms/${roomId}/voice-channels/${c.id}`));

    const isSpeaking = (m) => (voice.channel && m.socketId === voice.selfId ? voice.speaking.self
        : voice.speaking[m.socketId] ?? remoteSpeaking[m.socketId]);

    return (
        <div className="vc-list">
            {channels.map((c) => {
                const here = voice.channel?.id === c.id;
                const limit = Math.min(c.userLimit || maxUsers, maxUsers);
                const full = !here && c.members.length >= limit;
                const canManage = isOwner || c.createdBy === userId;
                return (
                    <div key={c.id}>
                        {editing?.id === c.id ? (
                            <div className="vc-inline-form">
                                <input autoFocus value={editing.name} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }} />
                            </div>
                        ) : (
                            <div
                                className={`vc-channel ${here ? 'current' : ''}`}
                                onClick={() => !here && !full && voice.join(roomId, c.id, { roomName })}
                                title={here ? 'You are here' : full ? `${c.name} is full` : `Join ${c.name}`}
                            >
                                <MdVolumeUp size={18} />
                                <span className="vc-name">{c.name}</span>
                                {c.members.length > 0 && <span className="vc-count">{c.members.length}{c.userLimit ? `/${c.userLimit}` : ''}</span>}
                                {canManage && (
                                    <span className="vc-actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="vc-icon-btn" title="Rename" onClick={() => setEditing({ id: c.id, name: c.name })}><FaPen /></button>
                                        {channels.length > 1 && <button className="vc-icon-btn" title="Delete channel" onClick={() => remove(c)}><FaTrash /></button>}
                                    </span>
                                )}
                            </div>
                        )}
                        {c.members.map((m) => {
                            const self = here && m.socketId === voice.selfId;
                            return (
                                <div
                                    key={m.socketId}
                                    className="vc-member"
                                    onContextMenu={(e) => {
                                        if (!here || self) return;
                                        e.preventDefault();
                                        setMenu({ x: e.clientX, y: e.clientY, member: m });
                                    }}
                                >
                                    <Avatar userId={m.userId} name={m.username} size={22} speaking={!!isSpeaking(m) && !m.muted} />
                                    <span className="vc-name" style={isSpeaking(m) && !m.muted ? { color: '#fff' } : undefined}>{m.username}{self ? ' (you)' : ''}</span>
                                    <span className="vc-state">
                                        {m.screen && <span className="vc-live">LIVE</span>}
                                        {m.video && <FaVideo title="Camera on" />}
                                        {m.deafened ? <MdHeadsetOff title="Deafened" color="#f23f43" /> : m.muted && <FaMicrophoneSlash title="Muted" color="#f23f43" />}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {creating ? (
                <div className="vc-inline-form">
                    <input autoFocus placeholder="new-channel" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }} />
                    <button className="vc-icon-btn" onClick={create}>Add</button>
                </div>
            ) : (
                <div className="vc-channel" onClick={() => setCreating(true)} style={{ fontSize: 13 }}>
                    <FaPlus size={11} /> <span className="vc-name">Create channel</span>
                </div>
            )}
            {error && <div style={{ color: '#f23f43', fontSize: 12, padding: '4px 10px' }}>{error}</div>}

            {menu && (
                <VolumeMenu
                    x={menu.x} y={menu.y} name={menu.member.username}
                    volume={voice.settings.volumes[menu.member.userId] ?? 1}
                    onChange={(v) => voice.setUserVolume(menu.member.userId, v)}
                    onClose={() => setMenu(null)}
                />
            )}
        </div>
    );
};

export default VoiceChannelList;
