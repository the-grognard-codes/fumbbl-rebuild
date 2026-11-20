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
  context.fillStyle = '#95784f';
  if (fillExterior) context.fillRect(0, 0, bowl.width, bowl.height);
  else context.fillRect(west, north, openingWidth, openingHeight);
  for (let i = 0; i < 14000; i++) {
    context.fillStyle = i % 3 ? '#90754d' : '#9f8359';
    context.fillRect(west + next(openingWidth - 3), north + next(openingHeight - 2), 1 + next(3), 1 + next(2));
  }
  const { pitchX: px, pitchY: py } = bowl;
  context.fillStyle = '#597442';
  context.fillRect(px, py, pitch.width, pitch.height);
  // Irregular clumps extend past the chalk independently along each side.
  for (const horizontal of [true, false]) {
    const length = horizontal ? pitch.width : pitch.height;
    for (const far of [false, true]) {
      for (let pos = 0; pos < length;) {
        const run = Math.min(length - pos, 2 + next(9));
        const growth = 2 + next(5);
        context.fillStyle = '#597442';
        if (horizontal) context.fillRect(px + pos, far ? py + pitch.height : py - growth, run, growth);
        else context.fillRect(far ? px + pitch.width : px - growth, py + pos, growth, run);
        context.fillStyle = '#68804c';
        if (horizontal) context.fillRect(px + pos, far ? py + pitch.height + growth - 1 : py - growth - 1, 1, 2);
        else context.fillRect(far ? px + pitch.width + growth - 1 : px - growth - 1, py + pos, 2, 1);
        pos += run;
      }
    }
  }
  for (let i = 0; i < 4600; i++) {
    context.fillStyle = i % 2 ? '#5d7746' : '#56713f';
    context.fillRect(px + next(pitch.width - 3), py + next(pitch.height - 2), 1 + next(3), 1);
  }
  context.fillStyle = '#6c8254';
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
