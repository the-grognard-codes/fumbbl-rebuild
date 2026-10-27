export const PLAYER_STEP_MS = 200;
export const BALL_STEP_MS = 250;
export const DICE_GROUP_INTERVAL_MS = 500;
export const DICE_ANIMATION_MS = 310;

/** Live cadence is fixed; only replay exposes a speed control. */
export function playbackRate(speed: number, mode: 'live' | 'replay'): number {
  return mode === 'replay' && Number.isFinite(speed) && speed > 0 ? speed : 1;
}
