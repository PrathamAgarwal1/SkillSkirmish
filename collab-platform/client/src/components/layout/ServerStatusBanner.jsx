import React, { useContext, useEffect, useRef, useState } from 'react';
import AuthContext from '../../context/AuthContext';
import { socket } from '../../socket';
import { getServerState, onServerState, pingServer, waitForServer } from '../../utils/serverStatus';
import './ServerStatusBanner.css';

/**
 * A small banner at the top of the page while the server is waking up (free hosting sleeps when
 * idle) or the live connection drops, so people see "waking up…" instead of a broken page.
 */
const ServerStatusBanner = () => {
    const { isAuthenticated } = useContext(AuthContext);
    const [server, setServer] = useState(getServerState());
    const [socketDown, setSocketDown] = useState(false);
    const [justRecovered, setJustRecovered] = useState(false);
    const [, tick] = useState(0);
    const wasDown = useRef(false);

    // First visit: a slow health check means the server is asleep
    useEffect(() => {
        let done = false;
        const slow = setTimeout(() => { if (!done) waitForServer(); }, 2000);
        pingServer().then(ok => { done = true; if (!ok) waitForServer(); });
        return () => clearTimeout(slow);
    }, []);

    useEffect(() => onServerState(setServer), []);

    // The live connection (chat, presence, calls) dropped and hasn't come back within a few seconds
    useEffect(() => {
        if (!isAuthenticated) { setSocketDown(false); return undefined; }
        let timer;
        const onDown = () => {
            clearTimeout(timer);
            timer = setTimeout(() => socket.active && !socket.connected && setSocketDown(true), 4000);
        };
        const onUp = () => { clearTimeout(timer); setSocketDown(false); };
        socket.on('disconnect', onDown);
        socket.on('connect_error', onDown);
        socket.on('connect', onUp);
        return () => {
            clearTimeout(timer);
            socket.off('disconnect', onDown);
            socket.off('connect_error', onDown);
            socket.off('connect', onUp);
        };
    }, [isAuthenticated]);

    const down = server.status === 'waking' || server.status === 'offline' || socketDown;

    // Briefly confirm the recovery, then get out of the way
    useEffect(() => {
        if (down) { wasDown.current = true; return undefined; }
        if (!wasDown.current) return undefined;
        wasDown.current = false;
        setJustRecovered(true);
        const t = setTimeout(() => setJustRecovered(false), 2500);
        return () => clearTimeout(t);
    }, [down]);

    // Elapsed-seconds counter while waiting
    useEffect(() => {
        if (!down) return undefined;
        const id = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, [down]);

    if (!down && !justRecovered) return null;

    if (!down) {
        return <div className="ss-banner ok" role="status">✓ Connected to the server</div>;
    }

    const seconds = Math.round((Date.now() - server.since) / 1000);
    const retry = () => {
        waitForServer();
        if (socket.active && !socket.connected) socket.connect();
    };

    let text;
    if (server.status === 'offline') {
        text = <>Can't reach the server. Check your connection, or try again in a minute.</>;
    } else if (server.status === 'waking') {
        text = <>Waking up the server… free hosting sleeps when idle, so this takes up to a minute <span className="ss-banner-time">{seconds}s</span></>;
    } else {
        text = <>Reconnecting to the server… your work is safe; changes resume when it's back</>;
    }

    return (
        <div className={`ss-banner ${server.status === 'offline' ? 'error' : 'waking'}`} role="status" aria-live="polite">
            {server.status !== 'offline' && <span className="ss-banner-spinner" aria-hidden="true" />}
            <span>{text}</span>
            <button onClick={retry}>Retry now</button>
        </div>
    );
};

export default ServerStatusBanner;
