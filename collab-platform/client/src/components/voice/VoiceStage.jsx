import React, { useMemo, useRef, useState } from 'react';
import { FaMicrophoneSlash, FaThumbtack, FaExpand } from 'react-icons/fa';
import { MdHeadsetOff, MdVolumeUp, MdSignalCellularAlt } from 'react-icons/md';
import { useVoice, useRoomVoice } from '../../voice/voiceContext';
import { colorFor, pingColor } from '../../voice/ui';
import Avatar from './Avatar';
import VideoView from './VideoView';
import VolumeMenu from './VolumeMenu';
import VoiceControls from './VoiceControls';
import './voice.css';

const gridColumns = (n) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5);

function Tile({ tile, speaking, pinned, onPin, onMenu }) {
    const ref = useRef(null);
    const { member } = tile;
    return (
        <div
            ref={ref}
            className={`vc-tile ${tile.screen ? 'screen' : ''} ${speaking ? 'speaking' : ''}`}
            onClick={() => onPin(tile.id)}
            onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu(e, member); } }}
            style={!tile.stream ? { background: colorFor(member.userId) } : undefined}
        >
            {tile.stream
                ? <VideoView stream={tile.stream} mirror={tile.mirror} />
                : <Avatar userId={member.userId} name={member.username} size={84} speaking={speaking} />}
            <div className="vc-tag">
                {tile.screen && <span className="vc-live">LIVE</span>}
                <span>{tile.screen ? `${member.username}'s screen` : member.username}{tile.self && !tile.screen ? ' (you)' : ''}</span>
                {!tile.screen && (member.deafened ? <MdHeadsetOff color="#f23f43" /> : member.muted && <FaMicrophoneSlash color="#f23f43" />)}
            </div>
            <div className="vc-tile-actions" onClick={(e) => e.stopPropagation()}>
                <button title={pinned ? 'Unpin' : 'Focus'} onClick={() => onPin(tile.id)}><FaThumbtack size={12} color={pinned ? '#5865f2' : '#fff'} /></button>
                <button title="Full screen" onClick={() => ref.current?.requestFullscreen?.()}><FaExpand size={12} /></button>
            </div>
        </div>
    );
}

/** Lobby shown in the room when you're not connected to one of its voice channels. */
function Lobby({ roomId, roomName }) {
    const voice = useVoice();
    const { channels, maxUsers } = useRoomVoice(roomId);
    return (
        <div className="vc-lobby">
            <div style={{ fontSize: 44 }}>🎧</div>
            <h2>Hop into a voice channel</h2>
            <p style={{ color: 'var(--vc-muted)', margin: 0, maxWidth: 460 }}>
                Talk, turn on your camera and share your screen with your team. You stay connected while you code in the IDE.
            </p>
            {voice.channel && voice.channel.roomId !== roomId && (
                <p style={{ color: 'var(--vc-yellow)', margin: 0 }}>You're connected to {voice.channel.name}{voice.channel.roomName ? ` in ${voice.channel.roomName}` : ''}. Joining here switches channels.</p>
            )}
            <div className="vc-cards">
                {channels.map((c) => {
                    const limit = Math.min(c.userLimit || maxUsers, maxUsers);
                    return (
                        <div className="vc-card" key={c.id}>
                            <div className="vc-card-title"><MdVolumeUp size={20} /> {c.name}</div>
                            <div className="vc-card-people">
                                {c.members.length === 0 && <span style={{ color: 'var(--vc-muted)', fontSize: 13 }}>No one here yet</span>}
                                {c.members.slice(0, 6).map(m => <Avatar key={m.socketId} userId={m.userId} name={m.username} size={30} />)}
                                {c.members.length > 6 && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--vc-muted)' }}>+{c.members.length - 6}</span>}
                            </div>
                            <button className="vc-join" disabled={voice.status === 'connecting' || c.members.length >= limit}
                                onClick={() => voice.join(roomId, c.id, { roomName })}>
                                {voice.status === 'connecting' ? 'Connecting…' : c.members.length >= limit ? 'Full' : 'Join voice'}
                            </button>
                        </div>
                    );
                })}
            </div>
            {voice.error && <div style={{ color: 'var(--vc-red)' }}>{voice.error}</div>}
        </div>
    );
}

/** The call: everyone's camera or avatar, screen shares in focus, controls at the bottom. */
const VoiceStage = ({ roomId, roomName }) => {
    const voice = useVoice();
    const [pinned, setPinned] = useState(null);
    const [menu, setMenu] = useState(null);

    const selfCamera = useMemo(() => (voice.cameraTrack ? new MediaStream([voice.cameraTrack]) : null), [voice.cameraTrack]);
    const selfScreen = useMemo(() => (voice.screenTrack ? new MediaStream([voice.screenTrack]) : null), [voice.screenTrack]);

    if (!voice.channel || voice.channel.roomId !== roomId) return <Lobby roomId={roomId} roomName={roomName} />;

    const tiles = [];
    for (const m of voice.members) {
        const self = m.socketId === voice.selfId;
        const media = voice.remote[m.socketId] || {};
        const camera = self ? selfCamera : (m.video ? media.camera : null);
        tiles.push({ id: `${m.socketId}:cam`, member: self ? { ...m, muted: voice.muted, deafened: voice.deafened } : m, self, stream: camera || null, mirror: self });
        const screen = self ? selfScreen : (m.screen ? media.screen : null);
        if (screen) tiles.push({ id: `${m.socketId}:screen`, member: m, self, stream: screen, screen: true });
    }
    const speakingOf = (t) => !t.screen && !t.member.muted && (t.self ? voice.speaking.self : voice.speaking[t.member.socketId]);

    // Focus: what you pinned, otherwise the newest screen share
    const focusId = tiles.some(t => t.id === pinned) ? pinned : (pinned === 'grid' ? null : tiles.filter(t => t.screen).pop()?.id);
    const focus = tiles.find(t => t.id === focusId);
    const others = tiles.filter(t => t !== focus);
    const togglePin = (id) => setPinned(p => (p === id || (id === focusId && !p) ? 'grid' : id));
    const openMenu = (e, member) => member.socketId !== voice.selfId && setMenu({ x: e.clientX, y: e.clientY, member });

    const peers = Object.values(voice.peerInfo);
    const relayed = peers.some(p => p.relayed);
    const statusText = voice.status === 'reconnecting' ? 'Reconnecting…'
        : voice.status === 'connecting' ? 'Connecting…'
            : voice.members.length <= 1 ? 'Waiting for others to join' : voice.mode === 'sfu' ? 'Server relay' : relayed ? 'Peer-to-peer (TURN)' : 'Peer-to-peer';

    return (
        <div className="vc-stage">
            <div className="vc-stage-header">
                <MdVolumeUp size={20} />
                <b>{voice.channel.name}</b>
                <span>· {voice.members.length} connected</span>
                <span style={{ flex: 1 }} />
                <span className="vc-quality" style={{ color: pingColor(voice.ping) }}>
                    <MdSignalCellularAlt /> {statusText}{voice.ping != null ? ` · ${voice.ping} ms` : ''}
                </span>
            </div>

            {focus ? (
                <div className="vc-spotlight">
                    <div className="vc-spotlight-main">
                        <div style={{ flex: 1, display: 'flex' }}>
                            <Tile tile={focus} speaking={speakingOf(focus)} pinned onPin={togglePin} onMenu={openMenu} />
                        </div>
                    </div>
                    {others.length > 0 && (
                        <div className="vc-filmstrip">
                            {others.map(t => <Tile key={t.id} tile={t} speaking={speakingOf(t)} pinned={false} onPin={togglePin} onMenu={openMenu} />)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="vc-grid" style={{ gridTemplateColumns: `repeat(${gridColumns(tiles.length)}, 1fr)` }}>
                    {tiles.map(t => <Tile key={t.id} tile={t} speaking={speakingOf(t)} pinned={false} onPin={togglePin} onMenu={openMenu} />)}
                </div>
            )}

            <div className="vc-bottom"><VoiceControls /></div>

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

export default VoiceStage;
