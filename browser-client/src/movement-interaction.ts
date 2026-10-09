import type { MovementPlan, MovementRequest } from './movement-protocol.ts';
import type { SetupAction, SetupState } from './setup-protocol.ts';

/** Presentation eligibility only; the native preview and commit validate every declaration. */
export function canPlanMovement(view: SetupState, actions: SetupAction[], playerId: string, kind: MovementRequest['kind']): boolean {
  const player = view.players.find(player => player.id === playerId);
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.actor !== view.callerRole
    || ['QUICK_SNAP', 'HIGH_KICK'].includes(view.turnMode) || player?.role !== view.callerRole
    || player.x === null || player.y === null) return false;
  const offered = actions.filter(action => action.sourcePlayerId === playerId);
  if (kind === 'move') return offered.some(action => ['select', 'stand'].includes(action.kind))
    || view.activePlayerId === playerId && offered.some(action => action.kind === 'move');
  return offered.some(action => action.kind === 'blitz') || view.activePlayerId === playerId
    && (offered.some(action => action.kind === 'blitzTarget')
      || offered.some(action => action.kind === 'move') && offered.some(action => action.kind === 'block'));
}

export function matchesMovementPlan(plan: MovementPlan | null, intent: MovementRequest | null, view: SetupState): boolean {
  if (!plan || !intent || plan.kind !== intent.kind || plan.targetPlayerId !== intent.targetPlayerId
    || plan.route.revision !== view.revision || plan.route.actor !== view.callerRole
    || plan.route.playerId !== intent.playerId) return false;
  const player = view.players.find(player => player.id === intent.playerId);
  if (player?.role !== view.callerRole || player.x !== plan.route.from.x || player.y !== plan.route.from.y) return false;
  return !intent.waypoints.length && intent.kind === 'blitz' || intent.waypoints.length === plan.waypoints.length
    && intent.waypoints.every((point, index) => point.x === plan.waypoints[index].x && point.y === plan.waypoints[index].y);
}
