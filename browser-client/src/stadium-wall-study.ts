// #211: shared modular stone construction for the two long sidelines, without spectators.
import type { WorldPoint } from './pitch-projection.ts';

export type WallSide = 'north' | 'south';
export type WallStudyFace = {
  id: string; side: WallSide; role: 'face' | 'coping' | 'return'; variant: 0 | 1;
  origin: WorldPoint; across: WorldPoint; down: WorldPoint; textureOffset?: number;
};
export type WallStudyProp = {
  id: string; side: WallSide; role: 'post' | 'torch' | 'blueBanner' | 'redBanner';
  anchor: WorldPoint; height: number;
};
const p = (x: number, y: number, z = 0): WorldPoint => ({ x, y, z });
export const WALL_STUDY_GEOMETRY = { x0: -2, x1: 28, north: -2.45, south: 17.45,
  thickness: .48, height: 1.25, moduleLength: 3 } as const;

export function wallStudyFaces(): WallStudyFace[] {
  const faces: WallStudyFace[] = [];
  const g = WALL_STUDY_GEOMETRY;
  for (const side of ['north', 'south'] as const) {
    const y = g[side], outward = side === 'north' ? -1 : 1;
    for (let i = 0; i < 10; i++) {
      const x = g.x0 + i * g.moduleLength, variant = (i % 2) as 0 | 1;
      faces.push({ id: `${side}-face-${i}`, side, role: 'face', variant,
        origin: p(x, y, g.height), across: p(g.moduleLength, 0), down: p(0, 0, -g.height) });
      faces.push({ id: `${side}-back-${i}`, side, role: 'face', variant,
        origin: p(x, y + outward * g.thickness, g.height), across: p(g.moduleLength, 0), down: p(0, 0, -g.height) });
      // Individual cap blocks have actual varied thickness and projection, not a painted skew.
      for (let stone = 0; stone < 5; stone++) {
        const top = g.height + .05 + ((i + stone) % 3) * .015;
        const overhang = .035 + ((i + stone) % 2) * .015;
        const inner = y - outward * overhang, depth = g.thickness + 2 * overhang;
        const sx = x + stone * .6;
        faces.push({ id: `${side}-coping-${i}-${stone}`, side, role: 'coping', variant,
          origin: p(sx, inner, top), across: p(.6, 0), down: p(0, outward * depth), textureOffset: stone * .6 * 128 });
        faces.push({ id: `${side}-cap-face-${i}-${stone}`, side, role: 'face', variant,
          origin: p(sx, inner, top), across: p(.6, 0), down: p(0, 0, g.height - top) });
      }
    }
    for (const x of [g.x0, g.x1]) faces.push({ id: `${side}-return-${x}`, side, role: 'return', variant: 0,
      origin: p(x, y, g.height), across: p(0, outward * g.thickness), down: p(0, 0, -g.height) });
  }
  return faces;
}

export function wallStudyProps(): WallStudyProp[] {
  const props: WallStudyProp[] = [];
  for (const side of ['north', 'south'] as const) {
    const y = WALL_STUDY_GEOMETRY[side] + (side === 'north' ? .08 : -.08);
    for (const [i, x] of [-2, 2, 6, 10, 14, 18, 22, 26, 28].entries()) {
      const torch = i % 2 === 0;
      props.push({ id: `${side}-post-${x}`, side, role: torch ? 'torch' : 'post', anchor: p(x, y), height: torch ? 2.25 : 1.85 });
    }
    for (const x of [4, 12, 20]) props.push({ id: `${side}-banner-${x}`, side,
      role: side === 'north' ? 'blueBanner' : 'redBanner', anchor: p(x, y, .6), height: 1.3 });
  }
  return props;
}

// Measured alpha bounds of the untouched generated atlases; gutters never map onto masonry.
export const WALL_MATERIAL_ART = { file: 'reference-wall-materials-v1.png', width: 1536, height: 1024,
  face: [{ x: 43, y: 123, width: 682, height: 444 }, { x: 812, y: 123, width: 681, height: 444 }],
  coping: [{ x: 44, y: 706, width: 681, height: 159 }, { x: 812, y: 707, width: 681, height: 158 }] };
export const WALL_ACCESSORY_ART = { file: 'reference-wall-accessories-v1.png', width: 1254, height: 1254,
  blueBanner: { x: 167, y: 64, width: 350, height: 466, pivotX: 342 }, redBanner: { x: 736, y: 64, width: 352, height: 466, pivotX: 912 },
  torch: { x: 271, y: 560, width: 175, height: 631, pivotX: 322 }, post: { x: 875, y: 622, width: 160, height: 569, pivotX: 923 } };
