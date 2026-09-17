import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Converts selected imagegen artwork into standalone, palette-limited SVG paths.
// No embedded raster images, font files, external resources, or background rectangles.
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/jaken/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const palette = ['#070d16', '#101c2b', '#2f7d32', '#1c5a32', '#4db2ff', '#ffe17b', '#874a2d', '#edf5ff'];
const rgb = palette.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));

async function readArt(name) {
  const { data, info: { width: w, height: h } } = await sharp(path.join(root, '_sources', name)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const outside = new Uint8Array(w * h), queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const background = i => {
    const c = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    return Math.max(...c) - Math.min(...c) < 32 && Math.max(...c) > 40;
  };
  function visit(i) { if (!outside[i] && background(i)) { outside[i] = 1; queue[tail++] = i; } }
  for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    if (x) visit(i - 1); if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w); if (i < w * (h - 1)) visit(i + w);
  }
  const labels = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) if (!outside[i]) {
    let best = Infinity, label = 0;
    for (let c = 0; c < rgb.length; c++) {
      const distance = rgb[c].reduce((sum, v, j) => sum + (v - data[i * 3 + j]) ** 2, 0);
      if (distance < best) { best = distance; label = c + 1; }
    }
    labels[i] = label;
  }
  const seen = new Uint8Array(w * h), components = [];
  for (let seed = 0; seed < labels.length; seed++) if (labels[seed] && !seen[seed]) {
    head = 0; tail = 0; queue[tail++] = seed; seen[seed] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    const pixels = [];
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w); pixels.push(i);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const n of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
        if (n >= 0 && labels[n] && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    if (pixels.length < 80) { for (const i of pixels) labels[i] = 0; }
    else components.push({ pixels, x0, y0, x1, y1 });
  }
  console.log(name, components.map(({ pixels, ...bounds }) => ({ ...bounds, area: pixels.length })));
  return { labels, w, h, components };
}

function simplify(points, tolerance = 0.9) {
  if (points.length < 4) return points;
  function distance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
  }
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let furthest = -1, max = tolerance ** 2;
    for (let i = a + 1; i < b; i++) { const d = distance(points[i], points[a], points[b]); if (d > max) { max = d; furthest = i; } }
    if (furthest >= 0) { keep[furthest] = 1; stack.push([a, furthest], [furthest, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function trace(art, selected = art.components, silhouette = false) {
  const { w, h } = art, labels = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const c of selected) {
    x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1);
    for (const i of c.pixels) labels[i] = silhouette ? 1 : art.labels[i];
  }
  const stride = w + 1, paths = [];
  for (let color = 1; color <= (silhouette ? 1 : palette.length); color++) {
    const edges = new Map();
    const edge = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x, a = y * stride + x;
      if (labels[i] !== color) continue;
      if (!y || labels[i - w] !== color) edge(a, a + 1);
      if (x === w - 1 || labels[i + 1] !== color) edge(a + 1, a + stride + 1);
      if (y === h - 1 || labels[i + w] !== color) edge(a + stride + 1, a + stride);
      if (!x || labels[i - 1] !== color) edge(a + stride, a);
    }
    const contours = [];
    while (edges.size) {
      const start = edges.keys().next().value; let current = start; const points = [];
      do {
        points.push([current % stride - x0, Math.floor(current / stride) - y0]);
        const next = edges.get(current); if (!next) throw new Error('Open contour');
        const n = next.pop(); if (!next.length) edges.delete(current); current = n;
      } while (current !== start);
      let area = 0; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (Math.abs(area) < 12) continue;
      points.push(points[0]); const p = simplify(points);
      contours.push(`M${p.map(v => v.join(',')).join('L')}Z`);
    }
    paths.push(`<path fill="${palette[color - 1]}" fill-rule="evenodd" d="${contours.join('')}"/>`);
  }
  const underlay = silhouette ? '' : trace(art, selected, true).body;
  return { body: underlay + paths.join('\n'), w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const wrap = (w, h, body, title, description) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${description}</desc>${body}</svg>`;
function place(art, x, y, w, h) {
  const s = Math.min(w / art.w, h / art.h);
  return `<g transform="translate(${(x + (w - art.w * s) / 2).toFixed(4)} ${(y + (h - art.h * s) / 2).toFixed(4)}) scale(${s.toFixed(6)})">${art.body}</g>`;
}
// Native pitch geometry makes both end-zone outlines and both wide zones exact.
// Preserve the v3 character and lettering, placing the mole in soil below the pitch.
function withPitch(art, id) {
  const pitch = `<path fill="#070d16" d="M0 576h1120v316h-20v14H20v-14H0Z"/>
<path fill="#874a2d" d="M28 874h1064v12h-28v8H56v-8H28Z"/>
<path fill="#4db2ff" d="M14 590h1092v280H14Z"/>
<path fill="#2f7d32" d="M154 604h812v252H154Z"/>
<path fill="#1c5a32" d="M154 688h812v84H154Z"/>
<path fill="#ffe17b" d="M28 604h112v252H28Z"/>
<path fill="#4db2ff" d="M980 604h112v252H980Z"/>
<path fill="#edf5ff" d="M554 604h12v252h-12Z"/>
<path fill="none" stroke="#edf5ff" stroke-width="10" stroke-dasharray="28 28" d="M174 650H946 M174 810H946"/>`;
  const tunnel = `<path fill="#070d16" d="M0 294h1120v80h-24v120h-24v150h-24v190h-32v72h-48v30H152v-30h-48v-72H72V644H48V494H24V374H0Z"/>
<path fill="#874a2d" d="M24 306h1072v60h-24v120h-24v150h-24v190h-32v60h-40v26H168v-26h-40v-60H96V636H72V486H48V366H24Z"/>
<path fill="#070d16" d="M348 330h424v24h80v36h64v64h48v96h32v278h-40v58H164v-58h-40V550h32v-96h48v-64h64v-36h80Z"/>
<path fill="#101c2b" d="M72 378h28v28H72Z M1020 404h24v24h-24Z M96 528h24v24H96Z M996 616h24v24h-24Z"/>`;
  return { ...art, h: 936, body: `<defs><clipPath id="${id}"><path d="M0 0h${art.w}v576H0Z"/></clipPath></defs>${tunnel}<g transform="translate(0 330)"><g clip-path="url(#${id})">${art.body}</g></g><g transform="translate(0 -576)">${pitch}</g>` };
}
const primary = await readArt('primary.png'), mark = withPitch(trace(await readArt('mark.png')), 'mark-character');
const letters = trace(primary, primary.components.filter(c => c.x0 > primary.w * .4 && c.x1 > primary.w * .9));
if (letters.w < 500) throw new Error('Wordmark segmentation failed');
const assets = [];
async function save(name, w, h, body, title, description) {
  const svg = wrap(w, h, body, title, description);
  await fs.writeFile(path.join(root, name + '.svg'), svg);
  assets.push({ name: name + '.svg', width: w, height: h });
  return svg;
}
async function png(name, svg, w, h) {
  await sharp(Buffer.from(svg), { density: 144 }).resize(w, h).png({ compressionLevel: 9 }).toFile(path.join(root, name + '.png'));
  const metadata = await sharp(path.join(root, name + '.png')).metadata();
  const size = (await fs.stat(path.join(root, name + '.png'))).size;
  if (metadata.width !== w || metadata.height !== h || !metadata.hasAlpha) throw new Error('Invalid export: ' + name);
  if (name === 'oauth-google-app-logo-120' && size >= 1000000) throw new Error('Google logo too large');
  assets.push({ name: name + '.png', width: w, height: h, bytes: size, alpha: true });
}
const title = 'Moles Under the Pitch';
const description = 'An original pixel mole with round gold glasses emerging from a soil tunnel beneath a green tabletop gridiron, with a gold left end zone, cyan right end zone, one center scrimmage line and two dotted wide-zone lines.';
const logo = await save('moles-under-the-pitch-logo', 1400, 400, place(mark, 40, 32, 380, 336) + place(letters, 450, 66, 910, 268), title, description);
await png('moles-under-the-pitch-logo', logo, 1400, 400);
await png('moles-under-the-pitch-logo-700', logo, 700, 200);
const compact = await save('moles-under-the-pitch-logo-compact', 640, 640, place(mark, 120, 36, 400, 375) + place(letters, 32, 440, 576, 166), title, description);
await png('moles-under-the-pitch-logo-compact', compact, 640, 640);
await png('moles-under-the-pitch-logo-compact-160', compact, 160, 160);
const symbol = await save('moles-under-the-pitch-mark', 512, 512, place(mark, 48, 48, 416, 416), title + ' symbol', description);
await png('moles-under-the-pitch-mark', symbol, 512, 512);
await png('moles-under-the-pitch-mark-32', symbol, 32, 32);
// Optical-size master: integer pixel geometry retains the glasses at 16 px.
const tiny = await save('moles-under-the-pitch-mark-16', 16, 16, `<g shape-rendering="crispEdges">
<g transform="translate(0 5)">
<path fill="#070d16" d="M6 1h4v1h2v1h1v3h1v3h1v1H1V9h1V6h1V3h1V2h2Z"/>
<path fill="#101c2b" d="M6 2h4v1h2v5H4V3h2Z"/>
<path fill="#4db2ff" d="M6 2h4v1H6Z"/>
<path fill="#874a2d" d="M2 9h2V8h2v1h4V8h2v1h2v1H2Z M7 7h2v1H7Z"/>
<path fill="#ffe17b" fill-rule="evenodd" d="M3 4h4v1h2V4h4v4H9V6H7v2H3Z M4 5v2h2V5Z M10 5v2h2V5Z"/>
<path fill="#4db2ff" d="M4 5h2v2H4Z M10 5h2v2h-2Z"/>
<path fill="#edf5ff" d="M4 5h1v1H4Z M10 5h1v1h-1Z"/>
 </g><g transform="translate(0 -9)">
<path fill="#4db2ff" d="M1 10h14v5H1Z"/>
<path fill="#2f7d32" d="M4 11h9v3H4Z"/>
<path fill="#1c5a32" d="M4 12h9v1H4Z"/>
<path fill="#ffe17b" d="M2 11h2v3H2Z"/>
<path fill="#4db2ff" d="M4 11h1v3H4Z"/>
<path fill="#edf5ff" d="M8 11h1v3H8Z M5 11h1v1H5Z M11 11h1v1h-1Z M5 13h1v1H5Z M11 13h1v1h-1Z"/>
</g></g>`, title + ' small symbol', 'Optical 16 pixel variant with a mole beneath the pitch, round gold glasses, pixel soil, gold and cyan end zones, a center line and two dotted wide-zone lines.');
await png('moles-under-the-pitch-mark-16', tiny, 16, 16);
await png('oauth-google-app-logo-120', symbol, 120, 120);
await png('oauth-microsoft-app-logo-512', symbol, 512, 512);
await png('magic-link-email-mark', symbol, 256, 256);
await fs.writeFile(path.join(root, 'auth-card-logo.svg'), logo);
assets.push({ name: 'auth-card-logo.svg', width: 1400, height: 400 });
const banner = await save('magic-link-email-banner', 1200, 300, place(mark, 48, 24, 260, 252) + place(letters, 348, 42, 804, 216), title, description);
await png('magic-link-email-banner', banner, 1200, 300);
const auth = withPitch(trace(await readArt('auth.png')), 'email-character');
const illustration = await save('magic-link-complete-illustration', 640, 640, place(auth, 64, 64, 512, 512), 'A mole checking an email link', 'A friendly mole examines an envelope bearing a link symbol in a soil tunnel beneath a tabletop gridiron. This wordless illustration does not prescribe success or failure.');
await png('magic-link-complete-illustration', illustration, 640, 640);
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ palette, typographyReference: 'primary-logo-approved-direction-v2.png', assets }, null, 2) + '\n');
console.log('Wrote', assets.length, 'assets to', root);
