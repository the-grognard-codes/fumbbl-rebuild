import type { PitchProjection } from './pitch-projection.ts';

const vectors: Record<string, [number, number]> = {
  north: [0, -1], northeast: [1, -1], east: [1, 0], southeast: [1, 1],
  south: [0, 1], southwest: [-1, 1], west: [-1, 0], northwest: [-1, -1],
};
export const nativeDirectionAngles: Record<string, number> = {
  north: -90, northeast: -45, east: 0, southeast: 45,
  south: 90, southwest: 135, west: 180, northwest: -135,
};

/** The dice overlay is screen-fixed; its arrows follow the displayed ground plane. */
export function diceDirectionAngles(camera: PitchProjection): Record<string, number> {
  const center = { x: 13, y: 7.5 };
  const from = camera.project(center);
  if (!from) return {};
  return Object.fromEntries(Object.entries(vectors).flatMap(([direction, [x, y]]) => {
    const to = camera.project({ x: center.x + x, y: center.y + y });
    return to ? [[direction, Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI]] : [];
  }));
}
