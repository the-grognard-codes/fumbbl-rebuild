import type { MovementPlan, MovementRequest } from './movement-protocol.ts';
import type { SetupAction, SetupState } from './setup-protocol.ts';

/** Presentation eligibility only; the native preview and commit validate every declaration. */
export function canPlanMovement(view: SetupState, actions: SetupAction[], playerId: string, kind: MovementRequest['kind']): boolean {
  const player = view.players.find(player => player.id === playerId);
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.actor !== view.callerRole
    || ['QUICK_SNAP', 'HIGH_KICK'].includes(view.turnMode) || player?.role !== view.callerRole
    || player.x === null || player.y === null) return false;
  const offered = actions.filter(action => action.sourcePlayerId === playerId);
  if (isBallTransfer(kind)) return view.activePlayerId !== playerId && view.turnMode === 'REGULAR'
    && offered.some(action => action.kind === (kind === 'pass' ? 'declarePass' : 'declareHandOff'));
  if (kind === 'move') return offered.some(action => ['select', 'stand'].includes(action.kind))
    || view.activePlayerId === playerId && view.turnMode === 'SELECT_BLITZ_TARGET'
      && offered.some(action => action.kind === 'blitzTarget')
    || view.activePlayerId === playerId && offered.some(action => action.kind === 'move');
  if (kind === 'foul') return offered.some(action => action.kind === 'declareFoul')
    || view.activePlayerId === playerId && offered.some(action => action.kind === 'foul');
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
  return (['blitz', 'foul'].includes(intent.kind) ? intent.waypoints.length <= plan.waypoints.length : intent.waypoints.length === plan.waypoints.length)
    && intent.waypoints.every((point, index) => point.x === plan.waypoints[index].x && point.y === plan.waypoints[index].y
      && !!point.jump === !!plan.waypoints[index].jump);
}

export function isBallTransfer(kind: string | undefined): kind is 'pass' | 'handOff' {
  return kind === 'pass' || kind === 'handOff';
}

/** The server validates possession and the complete recipient offer before confirmation. */
export function canPlanBallTransfer(view: SetupState, playerId: string, route: MovementPlan['route'] | null): boolean {
  if (view.activePlayerId === playerId || !view.ballState?.inPlay) return false;
  if (view.ballState.carrierPlayerId === playerId) return true;
  return view.ballState.moving && !!view.ball && !!route?.steps.some(step => step.x === view.ball!.x && step.y === view.ball!.y);
}
