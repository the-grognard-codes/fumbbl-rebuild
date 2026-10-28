export const PLAYER_STEP_MS = 200;
export const BALL_STEP_MS = 250;
export const DICE_GROUP_INTERVAL_MS = 1000;
export const DICE_ANIMATION_MS = 310;
// Pitch presentation uses the approved 0.5x pace; native tumble geometry stays intact.
export const PITCH_DICE_ROLL_MS = 620;
export const DICE_ENTRANCE_MS = 200;
export const DICE_EXIT_MS = 200;
export const DICE_RETENTION_MS = 2400;
export const EMPHASIZED_DICE_RETENTION_MS = 4800;

/** Live cadence is fixed; only replay exposes a speed control. */
export function playbackRate(speed: number, mode: 'live' | 'replay'): number {
  return mode === 'replay' && Number.isFinite(speed) && speed > 0 ? speed : 1;
}
