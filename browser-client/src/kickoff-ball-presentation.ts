import { PITCH_LENGTH, PITCH_WIDTH, type Point } from './pitch-projection.ts';
import type { SetupAction, SetupState } from './setup-protocol.ts';

/** Legal actions can be visible to both coaches; only their owner places the kick. */
export function kickoffPlacementTarget(view: SetupState, actions: SetupAction[], pinned: SetupAction | undefined,
  hover: Point | null): Point | null {
  if (view.phase !== 'READY_FOR_KICKOFF' || view.callerRole === 'spectator' || view.actor !== view.callerRole) return null;
  const placement = actions.filter(action => action.kind === 'kickoff' && action.actor === view.callerRole);
  const selected = placement.find(action => action.id === pinned?.id)?.target;
  if (selected && 'x' in selected) return { x: selected.x, y: selected.y };
  return hover && placement.some(action => action.target && 'x' in action.target
    && action.target.x === hover.x && action.target.y === hover.y) ? hover : null;
}

/** Off-pitch kick results share the first exterior square along each crossed edge. */
export function kickoffMarkerPosition(square: Point): Point {
  return { x: Math.max(-1, Math.min(PITCH_LENGTH, square.x)),
    y: Math.max(-1, Math.min(PITCH_WIDTH, square.y)) };
}
