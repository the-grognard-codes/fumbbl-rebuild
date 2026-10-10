import { PITCH_LENGTH, PITCH_WIDTH, type PitchProjection, type Point } from './pitch-projection.ts';
import type { RoutePoint } from './route-protocol.ts';

export type RangeEdge = { from: Point; to: Point; key: string };
export type ProjectedRangeEdge = RangeEdge & { screenFrom: Point; screenTo: Point };
export type RangeWarning = { square: RoutePoint; triangle: Point[]; path: string; center: Point; size: number };

const keyOf = (point: Point) => `${point.x},${point.y}`;
const inPitch = (point: Point) => Number.isInteger(point.x) && Number.isInteger(point.y)
  && point.x >= 0 && point.x < PITCH_LENGTH && point.y >= 0 && point.y < PITCH_WIDTH;

/** Outline the outer footprint, bridging occupied notches without changing reachable destinations. */
export function outerRangeEdges(squares: readonly RoutePoint[], origin?: RoutePoint,
  occupied: readonly RoutePoint[] = []): RangeEdge[] {
  const cells = new Set(squares.filter(inPitch).map(keyOf));
  if (!cells.size) return [];
  if (origin && inPitch(origin)) cells.add(keyOf(origin));
  const neighbors = ({ x, y }: Point) => [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }];
  // A player between two footprint squares must not cut a notch in the perimeter.
  // Repeat so adjacent players on the boundary can be bridged as a group.
  const obstacles = occupied.filter(inPitch);
  let changed = true;
  while (changed) {
    changed = false;
    for (const square of obstacles) {
      if (!cells.has(keyOf(square)) && neighbors(square).filter(point => cells.has(keyOf(point))).length >= 2) {
        cells.add(keyOf(square)); changed = true;
      }
    }
  }
  // Flood the exterior on a padded pitch. Enclosed holes are not outer boundaries.
  const exterior = new Set(['-1,-1']), queue: Point[] = [{ x: -1, y: -1 }];
  for (let index = 0; index < queue.length; index++) {
    for (const point of neighbors(queue[index])) {
      const key = keyOf(point);
      if (point.x < -1 || point.x > PITCH_LENGTH || point.y < -1 || point.y > PITCH_WIDTH
        || cells.has(key) || exterior.has(key)) continue;
      exterior.add(key); queue.push(point);
    }
  }
  const edges: RangeEdge[] = [];
  const add = (from: Point, to: Point) => {
    const a = keyOf(from), b = keyOf(to);
    edges.push({ from, to, key: a < b ? `${a}|${b}` : `${b}|${a}` });
  };
  for (const cell of cells) {
    const [x, y] = cell.split(',').map(Number);
    if (exterior.has(`${x - 1},${y}`)) add({ x, y }, { x, y: y + 1 });
    if (exterior.has(`${x + 1},${y}`)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (exterior.has(`${x},${y - 1}`)) add({ x, y }, { x: x + 1, y });
    if (exterior.has(`${x},${y + 1}`)) add({ x, y: y + 1 }, { x: x + 1, y: y + 1 });
  }
  return edges;
}

/** Clip straight projected ground edges so offscreen portions never enter the SVG. */
function clipEdge(from: Point, to: Point, width: number, height: number): [Point, Point] | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  let start = 0, end = 1;
  for (const [p, q] of [[-dx, from.x], [dx, width - from.x], [-dy, from.y], [dy, height - from.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const fraction = q / p;
    if (p < 0) start = Math.max(start, fraction);
    else end = Math.min(end, fraction);
  }
  if (start >= end) return null;
  return [{ x: from.x + start * dx, y: from.y + start * dy },
    { x: from.x + end * dx, y: from.y + end * dy }];
}

export function projectRangeEdges(edges: readonly RangeEdge[], camera: PitchProjection): ProjectedRangeEdge[] {
  const projected: ProjectedRangeEdge[] = [];
  for (const edge of edges) {
    const from = camera.project(edge.from), to = camera.project(edge.to);
    if (!from || !to) continue;
    const visible = clipEdge(from, to, camera.width, camera.height);
    if (visible) projected.push({ ...edge, screenFrom: visible[0], screenTo: visible[1] });
  }
  return projected;
}

export function projectRangeWarnings(full: readonly RoutePoint[], normal: readonly RoutePoint[],
  camera: PitchProjection): RangeWarning[] {
  const normalCells = new Set(normal.map(keyOf));
  const warnings: RangeWarning[] = [];
  const orientation = camera.end === 'home' ? 1 : -1;
  for (const square of full) {
    if (!inPitch(square) || normalCells.has(keyOf(square))) continue;
    const x = square.x + .5, y = square.y + .5;
    const center = camera.project({ x, y });
    if (!center || !camera.isVisible({ x, y })) continue;
    const triangle = camera.polygon([
      { x: x + orientation * .105, y },
      { x: x - orientation * .075, y: y + .10 },
      { x: x - orientation * .075, y: y - .10 },
    ], true);
    if (triangle.length >= 3) {
      const height = Math.max(...triangle.map(point => point.y)) - Math.min(...triangle.map(point => point.y));
      warnings.push({ square, triangle, path: roundedWarningPath(triangle), center,
        size: Math.min(6, height * .65) });
    }
  }
  return warnings;
}

function roundedWarningPath(polygon: Point[]): string {
  const corners = polygon.map((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length], next = polygon[(index + 1) % polygon.length];
    return { point, before: { x: point.x + (previous.x - point.x) * .12, y: point.y + (previous.y - point.y) * .12 },
      after: { x: point.x + (next.x - point.x) * .12, y: point.y + (next.y - point.y) * .12 } };
  });
  return corners.map(({ point, before, after }, index) =>
    `${index ? 'L' : 'M'}${before.x},${before.y} Q${point.x},${point.y} ${after.x},${after.y}`).join(' ') + 'Z';
}

export function movementRangePresentation(normal: readonly RoutePoint[], full: readonly RoutePoint[],
  origin: RoutePoint, camera: PitchProjection, occupied: readonly RoutePoint[] = []) {
  const normalEdges = outerRangeEdges(normal, origin, occupied);
  const normalKeys = new Set(normalEdges.map(edge => edge.key));
  return {
    normal: projectRangeEdges(normalEdges, camera),
    full: projectRangeEdges(outerRangeEdges(full, origin, occupied).filter(edge => !normalKeys.has(edge.key)), camera),
    warnings: projectRangeWarnings(full, normal, camera),
  };
}
