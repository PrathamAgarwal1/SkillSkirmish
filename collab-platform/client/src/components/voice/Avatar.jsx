import React from 'react';
import { colorFor, initials } from '../../voice/ui';

const Avatar = ({ userId, name, size = 24, speaking = false }) => (
    <span
        className={`vc-avatar ${speaking ? 'speaking' : ''}`}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38), background: colorFor(userId) }}
        title={name}
    >
        {initials(name)}
    </span>
);

export default Avatar;
