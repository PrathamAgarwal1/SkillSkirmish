// battles/content/css.js — CSS battle targets (400 × 300).
//
// The target is drawn on the server from `shapes` into a PNG (battles/rasterize.js), so players only
// ever get a picture, never markup to copy. `solution` is a reference answer (used by the tests to
// prove each target can be matched, and shown after the match).
//
// shapes: { rect: [x, y, w, h], radius?, color } | { ellipse: [cx, cy, rx, ry], color }

const W = 400;
const H = 300;

const TARGETS = [
    {
        id: 'css-square', title: 'Simply Square', difficulty: 'easy',
        background: '#5d3a3a',
        shapes: [{ rect: [0, 0, 200, 200], color: '#b5e0ba' }],
        solution: '<div></div>\n<style>\n  .ss-root { background: #5d3a3a; }\n  div { width: 200px; height: 200px; background: #b5e0ba; }\n</style>'
    },
    {
        id: 'css-centered-circle', title: 'Full Moon', difficulty: 'easy',
        background: '#1a1a2e',
        shapes: [{ ellipse: [200, 150, 90, 90], color: '#f6e7a6' }],
        solution: '<div></div>\n<style>\n  .ss-root { background: #1a1a2e; display: grid; place-items: center; }\n  div { width: 180px; height: 180px; border-radius: 50%; background: #f6e7a6; }\n</style>'
    },
    {
        id: 'css-flag', title: 'Three Stripes', difficulty: 'easy',
        background: '#ffffff',
        shapes: [
            { rect: [0, 0, 133, 300], color: '#2b4c7e' },
            { rect: [133, 0, 134, 300], color: '#f5f5f5' },
            { rect: [267, 0, 133, 300], color: '#d1495b' }
        ],
        solution: '<div class="a"></div><div class="b"></div><div class="c"></div>\n<style>\n  .ss-root { display: flex; }\n  div { height: 300px; }\n  .a { width: 133px; background: #2b4c7e; }\n  .b { width: 134px; background: #f5f5f5; }\n  .c { width: 133px; background: #d1495b; }\n</style>'
    },
    {
        id: 'css-pill', title: 'The Pill', difficulty: 'easy',
        background: '#e8eef1',
        shapes: [{ rect: [80, 110, 240, 80], radius: 40, color: '#3d8361' }],
        solution: '<div></div>\n<style>\n  .ss-root { background: #e8eef1; }\n  div { position: absolute; left: 80px; top: 110px; width: 240px; height: 80px; border-radius: 40px; background: #3d8361; }\n</style>'
    },
    {
        id: 'css-traffic-light', title: 'Traffic Light', difficulty: 'medium',
        background: '#2d3436',
        shapes: [
            { rect: [160, 30, 80, 240], radius: 16, color: '#111111' },
            { ellipse: [200, 75, 25, 25], color: '#e74c3c' },
            { ellipse: [200, 150, 25, 25], color: '#f1c40f' },
            { ellipse: [200, 225, 25, 25], color: '#2ecc71' }
        ],
        solution: '<div class="box"><i class="r"></i><i class="y"></i><i class="g"></i></div>\n<style>\n  .ss-root { background: #2d3436; }\n  .box { position: absolute; left: 160px; top: 30px; width: 80px; height: 240px; border-radius: 16px; background: #111; }\n  i { position: absolute; left: 15px; width: 50px; height: 50px; border-radius: 50%; }\n  .r { top: 20px; background: #e74c3c; }\n  .y { top: 95px; background: #f1c40f; }\n  .g { top: 170px; background: #2ecc71; }\n</style>'
    },
    {
        id: 'css-target', title: 'Bullseye', difficulty: 'medium',
        background: '#f4f1de',
        shapes: [
            { ellipse: [200, 150, 120, 120], color: '#e07a5f' },
            { ellipse: [200, 150, 80, 80], color: '#f4f1de' },
            { ellipse: [200, 150, 40, 40], color: '#e07a5f' }
        ],
        solution: '<div></div>\n<style>\n  .ss-root { background: #f4f1de; display: grid; place-items: center; }\n  div { width: 80px; height: 80px; border-radius: 50%; background: #e07a5f; box-shadow: 0 0 0 40px #f4f1de, 0 0 0 80px #e07a5f; }\n</style>'
    },
    {
        id: 'css-corners', title: 'Four Corners', difficulty: 'medium',
        background: '#264653',
        shapes: [
            { rect: [20, 20, 60, 60], color: '#e9c46a' },
            { rect: [320, 20, 60, 60], color: '#e9c46a' },
            { rect: [20, 220, 60, 60], color: '#e9c46a' },
            { rect: [320, 220, 60, 60], color: '#e9c46a' }
        ],
        solution: '<i style="left:20px;top:20px"></i><i style="right:20px;top:20px"></i><i style="left:20px;bottom:20px"></i><i style="right:20px;bottom:20px"></i>\n<style>\n  .ss-root { background: #264653; }\n  i { position: absolute; width: 60px; height: 60px; background: #e9c46a; }\n</style>'
    },
    {
        id: 'css-eclipse', title: 'Eclipse', difficulty: 'medium',
        background: '#0b132b',
        shapes: [
            { ellipse: [200, 150, 100, 100], color: '#ffb703' },
            { ellipse: [240, 130, 100, 100], color: '#0b132b' }
        ],
        solution: '<div class="sun"></div><div class="moon"></div>\n<style>\n  .ss-root { background: #0b132b; }\n  div { position: absolute; width: 200px; height: 200px; border-radius: 50%; }\n  .sun { left: 100px; top: 50px; background: #ffb703; }\n  .moon { left: 140px; top: 30px; background: #0b132b; }\n</style>'
    },
    {
        id: 'css-cards', title: 'Card Stack', difficulty: 'hard',
        background: '#fefae0',
        shapes: [
            { rect: [90, 90, 160, 110], radius: 12, color: '#bc6c25' },
            { rect: [120, 70, 160, 110], radius: 12, color: '#dda15e' },
            { rect: [150, 50, 160, 110], radius: 12, color: '#283618' }
        ],
        solution: '<i style="left:90px;top:90px;background:#bc6c25"></i><i style="left:120px;top:70px;background:#dda15e"></i><i style="left:150px;top:50px;background:#283618"></i>\n<style>\n  .ss-root { background: #fefae0; }\n  i { position: absolute; width: 160px; height: 110px; border-radius: 12px; }\n</style>'
    },
    {
        id: 'css-snowman', title: 'Snowman', difficulty: 'hard',
        background: '#a8dadc',
        shapes: [
            { rect: [0, 260, 400, 40], color: '#f1faee' },
            { ellipse: [200, 215, 60, 60], color: '#f1faee' },
            { ellipse: [200, 120, 42, 42], color: '#f1faee' },
            { ellipse: [185, 112, 5, 5], color: '#1d3557' },
            { ellipse: [215, 112, 5, 5], color: '#1d3557' },
            { rect: [170, 60, 60, 14], color: '#1d3557' },
            { rect: [182, 30, 36, 32], color: '#1d3557' }
        ],
        solution: '<b class="ground"></b><b class="body"></b><b class="head"></b><b class="eye" style="left:180px"></b><b class="eye" style="left:210px"></b><b class="brim"></b><b class="hat"></b>\n<style>\n  .ss-root { background: #a8dadc; }\n  b { position: absolute; }\n  .ground { left: 0; top: 260px; width: 400px; height: 40px; background: #f1faee; }\n  .body { left: 140px; top: 155px; width: 120px; height: 120px; border-radius: 50%; background: #f1faee; }\n  .head { left: 158px; top: 78px; width: 84px; height: 84px; border-radius: 50%; background: #f1faee; }\n  .eye { top: 107px; width: 10px; height: 10px; border-radius: 50%; background: #1d3557; }\n  .brim { left: 170px; top: 60px; width: 60px; height: 14px; background: #1d3557; }\n  .hat { left: 182px; top: 30px; width: 36px; height: 32px; background: #1d3557; }\n</style>'
    }
];

module.exports = { TARGETS, W, H };
