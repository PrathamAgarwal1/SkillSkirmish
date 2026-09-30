import React, { useEffect, useRef } from 'react';

/** <video> bound to a MediaStream (always muted: call audio plays through Web Audio). */
const VideoView = ({ stream, mirror = false, style }) => {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        el.srcObject = stream || null;
        if (stream) el.play().catch(() => {});
        return () => { el.srcObject = null; };
    }, [stream]);
    return <video ref={ref} autoPlay playsInline muted style={{ transform: mirror ? 'scaleX(-1)' : undefined, ...style }} />;
};

export default VideoView;
