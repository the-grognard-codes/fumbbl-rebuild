// Throwaway #211 experiment: one north/home side section joined to its home corner.
// These are world surfaces and intact groups, never scanline slices of a panorama.
import { PitchProjection, type Point, type WorldPoint } from './pitch-projection.ts';

export type HybridFace = {
  id: string; origin: WorldPoint; across: WorldPoint; down: WorldPoint;
  material: 'wall' | 'cap' | 'terrace' | 'doorway'; outline?: Point[];
};
export type HybridGroup = {
  id: string; section: 'side' | 'corner'; anchor: WorldPoint; facing: number; rank: number;
};
export const HYBRID_JOIN = { x: -2, y: -2 };
export const HYBRID_RANKS = [
  { inner: .45, outer: 1.55, rise: 1.1 },
  { inner: 1.55, outer: 2.65, rise: 1.52 },
  { inner: 2.65, outer: 4, rise: 1.94 }
] as const;
const p = (x: number, y: number, z = 0): WorldPoint => ({ x, y, z });
const arc = (radius: number, angle: number, z = 0) =>
  p(HYBRID_JOIN.x + radius * Math.cos(angle), HYBRID_JOIN.y + radius * Math.sin(angle), z);

export function hybridFaces(): HybridFace[] {
  const faces: HybridFace[] = [];
  const front = (id: string, a: WorldPoint, b: WorldPoint, base: number, top: number) => {
    faces.push({ id, origin: { ...a, z: top }, across: p(b.x - a.x, b.y - a.y), down: p(0, 0, base - top), material: 'wall' });
  };
  for (const [rank, level] of HYBRID_RANKS.entries()) {
    const base = rank ? HYBRID_RANKS[rank - 1].rise : 0;
    const y = -2 - level.inner;
    // The stone doorway replaces one part of the retaining face; furniture is pitch-side.
    for (const [part, x0, x1] of [['left', -2, 4.7], ['right', 7.1, 13]] as const)
      if (rank === 0) front('wall-side-' + part, p(x0, y), p(x1, y), base, level.rise);
    if (rank) front('riser-side-' + rank, p(-2, y), p(13, y), base, level.rise);
    for (let i = 0; i < 10; i++) faces.push({ id: 'tread-side-' + rank + '-' + i, material: 'terrace', origin: p(-2 + i * 1.5, -2 - level.outer, level.rise),
      across: p(1.5, 0), down: p(0, level.outer - level.inner) });
    if (!rank) faces.push({ id: 'doorway', material: 'doorway', origin: p(4.7, y, 1.1), across: p(2.4, 0), down: p(0, 0, -1.1) });
    // Annular treads and faceted vertical risers have exactly the same side endpoint.
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = Math.PI + i * Math.PI / (2 * steps), b = Math.PI + (i + 1) * Math.PI / (2 * steps);
      const innerA = arc(level.inner, a), innerB = arc(level.inner, b);
      front('riser-corner-' + rank + '-' + i, innerA, innerB, base, level.rise);
    }
    const contour = [
      ...Array.from({ length: steps + 1 }, (_, i) => arc(level.outer, Math.PI + i * Math.PI / (2 * steps))),
      ...Array.from({ length: steps + 1 }, (_, i) => arc(level.inner, Math.PI * 1.5 - i * Math.PI / (2 * steps)))
    ];
    faces.push({ id: 'tread-corner-' + rank, material: 'terrace', origin: p(-6, -6, level.rise),
      across: p(4, 0), down: p(0, 4), outline: contour.map(v => ({ x: (v.x + 6) * 128, y: (v.y + 6) * 128 })) });
  }
  // Independent coping stones and shallow face stones supply actual depth variation.
  for (let i = 0; i < 25; i++) {
    const x = -2 + i * .6, depth = .2 + (i % 3) * .035, top = 1.14 + (i % 4) * .012;
    faces.push({ id: 'cap-' + i, material: 'cap', origin: p(x, -2.45 - depth, top), across: p(.58, 0), down: p(0, depth + .1) });
    if (x + .58 <= 4.7 || x >= 7.1)
      front('cap-face-' + i, p(x, -2.35), p(x + .58, -2.35), 1.05, top);
  }
  faces.push({ id: 'cap-corner', material: 'cap', origin: p(-6, -6, 1.14), across: p(4, 0), down: p(0, 4),
    outline: [...Array.from({ length: 13 }, (_, i) => arc(.68, Math.PI + i * Math.PI / 24)),
      ...Array.from({ length: 13 }, (_, i) => arc(.35, Math.PI * 1.5 - i * Math.PI / 24))]
      .map(v => ({ x: (v.x + 6) * 128, y: (v.y + 6) * 128 })) });
  return faces;
}

export function hybridGroups(): HybridGroup[] {
  const groups: HybridGroup[] = [];
  for (const [rank, level] of HYBRID_RANKS.entries()) {
    const radius = (level.inner + level.outer) / 2;
    for (let i = 0; i < 10; i++) groups.push({ id: 'side-' + rank + '-' + i, section: 'side', rank,
      anchor: p(-1.25 + i * 1.45 + (rank % 2) * .17, -2 - radius, level.rise), facing: Math.PI / 2 });
    const count = [2, 4, 6][rank];
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + (i + .5) * Math.PI / (2 * count);
      groups.push({ id: 'corner-' + rank + '-' + i, section: 'corner', rank,
        anchor: arc(radius, angle, level.rise), facing: angle + Math.PI });
    }
  }
  return groups;
}

/** Direction selects authored art; position and uniform image scale follow the shared lens. */
export function hybridViewRow(group: HybridGroup, camera: PitchProjection): number {
  if (camera.mode === 'top-down') return 4;
  const sign = camera.end === 'home' ? 1 : -1;
  const eyeX = camera.focus - sign * camera.distance * Math.cos(camera.elevation * Math.PI / 180);
  const eyeY = camera.transverseFocus;
  const relative = Math.atan2(eyeY - group.anchor.y, eyeX - group.anchor.x) - group.facing;
  const angle = Math.atan2(Math.sin(relative), Math.cos(relative));
  if (Math.abs(angle) < Math.PI / 4) return 0;
  if (Math.abs(angle) > Math.PI * 3 / 4) return 1;
  return angle > 0 ? 3 : 2;
}
export function hybridDepth(anchor: WorldPoint, camera: PitchProjection): number {
  return camera.distance + (anchor.x - camera.focus) * (camera.end === 'home' ? 1 : -1)
    * Math.cos(camera.elevation * Math.PI / 180) - anchor.z * Math.sin(camera.elevation * Math.PI / 180);
}
export function hybridFaceCenter(face: HybridFace): WorldPoint {
  return p(face.origin.x + (face.across.x + face.down.x) / 2,
    face.origin.y + (face.across.y + face.down.y) / 2, face.origin.z + (face.across.z + face.down.z) / 2);
}
// Measured transparent gutters in the original image, not assumed equal grid rows.
export const HYBRID_ATLAS = { width: 1122, height: 1402, cellWidth: 374,
  rows: [{ y: 20, height: 270 }, { y: 290, height: 270 }, { y: 590, height: 270 }, { y: 880, height: 270 }, { y: 1170, height: 222 }] };
