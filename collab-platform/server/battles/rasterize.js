// battles/rasterize.js — draws a CSS-battle target (solid rectangles, rounded rectangles, ellipses)
// into a PNG, so players get a picture rather than markup. Pixels are sampled at their centres, like
// a browser does for shapes on whole-pixel boundaries.
const zlib = require('zlib');

const hex = (c) => {
    const h = c.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
};

const inside = (s, x, y) => {
    if (s.ellipse) {
        const [cx, cy, rx, ry] = s.ellipse;
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    }
    const [rx, ry, w, h] = s.rect;
    if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false;
    const r = Math.min(s.radius || 0, w / 2, h / 2);
    if (!r) return true;
    // Rounded corners: outside the corner circles is outside the shape
    const cx = x < rx + r ? rx + r : x > rx + w - r ? rx + w - r : x;
    const cy = y < ry + r ? ry + r : y > ry + h - r ? ry + h - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** RGBA pixels (Uint8Array, width × height × 4) */
function draw(target, width = 400, height = 300) {
    const px = new Uint8Array(width * height * 4);
    const bg = hex(target.background || '#ffffff');
    const shapes = target.shapes.map(s => ({ ...s, rgb: hex(s.color) }));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let c = bg;
            for (const s of shapes) if (inside(s, x + 0.5, y + 0.5)) c = s.rgb;
            const i = (y * width + x) * 4;
            px[i] = c[0];
            px[i + 1] = c[1];
            px[i + 2] = c[2];
            px[i + 3] = 255;
        }
    }
    return px;
}

/* ── minimal PNG encoder (RGBA, 8-bit, no interlace) ── */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
};

function encodePng(px, width, height) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        Buffer.from(px.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const cache = new Map();
/** data: URL of the target's PNG (cached) */
function targetImage(target) {
    if (!cache.has(target.id)) {
        cache.set(target.id, `data:image/png;base64,${encodePng(draw(target), 400, 300).toString('base64')}`);
    }
    return cache.get(target.id);
}

/** The colours used in a target (shown as a palette to players, like CSSBattle) */
const palette = (target) => [...new Set([target.background, ...target.shapes.map(s => s.color)].map(c => c.toLowerCase()))];

module.exports = { draw, encodePng, targetImage, palette, hex };
