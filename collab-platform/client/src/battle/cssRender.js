// battle/cssRender.js — renders a player's HTML/CSS to pixels and scores it against a target picture.
//
// The markup is parsed with the browser's (forgiving) HTML parser, scripts are dropped, and it is
// drawn through an SVG <foreignObject> into a canvas, so it never runs as a page. `html` / `body`
// selectors are pointed at the 400×300 stage (`.ss-root`) so CSSBattle-style answers work.
export const W = 400;
export const H = 300;
const TOLERANCE = 24; // max |Δr| + |Δg| + |Δb| for a pixel to count as matching

const ROOT_SELECTOR = /(^|[\s,{}>+~])(html|body)(?=[\s,{.:#[>+~]|$)/g;

function toXhtml(code) {
    const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${code}</body></html>`, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, link').forEach(el => el.remove());
    for (const el of doc.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
    doc.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(ROOT_SELECTOR, '$1.ss-root'); });
    // The stage is its own element (not a div), so rules like `div { … }` only hit the player's divs.
    // Its size is fixed; the defaults use :where() (zero specificity) so any player rule overrides them.
    const root = doc.createElement('ss-stage');
    root.className = 'ss-root';
    root.setAttribute('style', `width:${W}px;height:${H}px;overflow:hidden;box-sizing:border-box;`);
    const defaults = doc.createElement('style');
    defaults.textContent = ':where(.ss-root){display:block;position:relative;background:#ffffff;margin:0;padding:0;font-family:sans-serif;}';
    root.appendChild(defaults);
    for (const node of [...doc.head.childNodes, ...doc.body.childNodes]) root.appendChild(node);
    return new XMLSerializer().serializeToString(root);
}

const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render this HTML'));
    img.src = src;
});

const pixelsOf = (img) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
};

/** RGBA pixels of the player's code rendered at 400×300. */
export async function renderPixels(code) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${toXhtml(code)}</foreignObject></svg>`;
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    return pixelsOf(img);
}

const targetCache = new Map();
/** RGBA pixels of a target picture (data: URL from the server). */
export async function targetPixels(dataUrl) {
    if (!targetCache.has(dataUrl)) targetCache.set(dataUrl, pixelsOf(await loadImage(dataUrl)));
    return targetCache.get(dataUrl);
}

/** % of pixels that match (0–100, one decimal). */
export function matchPercent(a, b) {
    let same = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= TOLERANCE) same++;
    }
    return Math.floor((same / (a.length / 4)) * 1000) / 10;
}

/** Renders `code` and scores it against the target. */
export async function scoreCss(code, targetDataUrl) {
    const [mine, target] = await Promise.all([renderPixels(code), targetPixels(targetDataUrl)]);
    return { score: matchPercent(mine, target), pixels: mine };
}

/** Paints pixels into a canvas element. */
export function paint(canvas, pixels) {
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), W, H), 0, 0);
}
