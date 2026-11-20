import { STILL_LAYOUT } from './stadium-mockup.ts';

const { pixelsPerSquare: square, pitch } = STILL_LAYOUT;
const apron = square * 1.5;
const west = 108, north = 121;
const openingWidth = pitch.width + apron * 2;
const openingHeight = pitch.height + apron * 2;
export const bowl = {
  width: west + openingWidth + 106, height: north + openingHeight + 139,
  pitchX: west + apron, pitchY: north + apron,
};
const turf = '#60784b';
const gateCenter = Math.floor(bowl.width / 2);

// Repeat the seating bays at native scale. Keep the central gate and all four corners unique.
export function drawBowl(context: CanvasRenderingContext2D, art: HTMLImageElement) {
  const xs = [[0, west, west], [west, 131, 131], [west, 314, 314],
    [291, 131, 131], [422, 106, 106]];
  const ys = [[0, north, north], [north, 484, openingHeight / 2],
    [north, 484, openingHeight / 2], [605, 139, 139]];
  context.imageSmoothingEnabled = false;
  let y = 0;
  for (const [sy, sh, dh] of ys) {
    let x = 0;
    for (const [sx, sw, dw] of xs) {
      context.drawImage(art, sx, sy, sw, sh, x, y, dw, dh);
      x += dw;
    }
    y += dh;
  }
  drawBowlGround(context);
}

export function drawBowlGround(context: CanvasRenderingContext2D, fillExterior = false) {
  // One deterministic grain pattern for the packed earth and the untrimmed turf.
  let seed = 572;
  function next(limit: number) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * limit);
  }
  const groundX = fillExterior ? 0 : west;
  const groundY = fillExterior ? 0 : north;
  const groundWidth = fillExterior ? bowl.width : openingWidth;
  const groundHeight = fillExterior ? bowl.height : openingHeight;
  context.fillStyle = '#9b754e';
  context.fillRect(groundX, groundY, groundWidth, groundHeight);

  const { pitchX: px, pitchY: py } = bowl;
  const pitchBottom = py + pitch.height;
  const groundBottom = groundY + groundHeight;
  // The worn lane continues beneath the gate art, so the opening and apron share one surface.
  for (let y = pitchBottom; y < groundBottom; y++) {
    const distance = y - pitchBottom;
    const spread = Math.min(34, 24 + Math.floor(distance / 4));
    const left = gateCenter - spread - next(5);
    const right = gateCenter + spread + next(5);
    context.fillStyle = '#a17a51';
    context.fillRect(left, y, right - left, 1);
    context.fillStyle = '#a77d52';
    context.fillRect(left + 4, y, right - left - 8, 1);
    context.fillStyle = '#ac8053';
    context.fillRect(left + 9, y, right - left - 18, 1);
  }

  const grainCount = Math.floor(groundWidth * groundHeight / 38);
  for (let i = 0; i < grainCount; i++) {
    context.fillStyle = i % 3 ? '#70513229' : '#e5bd822e';
    context.fillRect(groundX + next(groundWidth - 3), groundY + next(groundHeight - 2), 1 + next(3), 1 + next(2));
  }
  for (let i = 0; i < 360; i++) {
    context.fillStyle = i % 3 ? '#795b3b38' : '#e5bd8245';
    const x = gateCenter - 27 + next(54);
    const y = pitchBottom + next(groundBottom - pitchBottom);
    context.fillRect(x, y, 1 + next(4), 1 + next(2));
  }

  context.fillStyle = turf;
  context.fillRect(px, py, pitch.width, pitch.height);
  // Irregular clumps extend past the chalk independently along each side.
  for (const horizontal of [true, false]) {
    const length = horizontal ? pitch.width : pitch.height;
    for (const far of [false, true]) {
      for (let pos = 0; pos < length;) {
        const run = Math.min(length - pos, 2 + next(9));
        const growth = 2 + next(5);
        context.fillStyle = pos % 3 ? turf : '#5c7347';
        if (horizontal) context.fillRect(px + pos, far ? py + pitch.height : py - growth, run, growth);
        else context.fillRect(far ? px + pitch.width : px - growth, py + pos, growth, run);
        context.fillStyle = '#6d8152';
        if (horizontal) context.fillRect(px + pos, far ? py + pitch.height + growth - 1 : py - growth - 1, 1, 2);
        else context.fillRect(far ? px + pitch.width + growth - 1 : px - growth - 1, py + pos, 2, 1);
        pos += run;
      }
    }
  }
  for (let i = 0; i < 4600; i++) {
    context.fillStyle = i % 2 ? '#657d4f' : '#597345';
    context.fillRect(px + next(pitch.width - 3), py + next(pitch.height - 2), 1 + next(3), 1);
  }
  context.fillStyle = '#71845a';
  for (let x = square; x < pitch.width; x += square) context.fillRect(px + x, py, 1, pitch.height);
  for (let y = square; y < pitch.height; y += square) context.fillRect(px, py + y, pitch.width, 1);
  context.strokeStyle = '#c6c7a2';
  context.strokeRect(px + .5, py + .5, pitch.width - 1, pitch.height - 1);
  context.fillStyle = '#b7bc97';
  for (const row of [1, 13, 25]) context.fillRect(px, py + row * square, pitch.width, 1);
  for (const col of [4, 11]) {
    for (let y = square; y < pitch.height - square; y += 12) context.fillRect(px + col * square, py + y, 1, 6);
  }
}
