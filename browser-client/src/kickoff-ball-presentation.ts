import { PITCH_LENGTH, PITCH_WIDTH, type Point } from './pitch-projection.ts';

/** Off-pitch kick results share the first exterior square along each crossed edge. */
export function kickoffMarkerPosition(square: Point): Point {
  return { x: Math.max(-1, Math.min(PITCH_LENGTH, square.x)),
    y: Math.max(-1, Math.min(PITCH_WIDTH, square.y)) };
}
