import { canPlaceReserve } from './setup-protocol.ts';
import type { SetupAction, SetupPlayer, SetupState } from './setup-protocol.ts';
import type { RoutePoint } from './route-protocol.ts';

export function canDragSetupPlayer(view: SetupState, player: SetupPlayer, actions: SetupAction[]): boolean {
  if (view.actor !== view.callerRole || player.role !== view.callerRole) return false;
  if (view.phase === 'SETUP') return player.x !== null || (player.offPitch ?? 'reserve') === 'reserve';
  return view.phase === 'PLAY' && view.turnMode === 'SOLID_DEFENCE' && player.x !== null
    && actions.some(action => action.actor === view.callerRole && (
      action.kind === 'kickoffChoice' && action.target && 'playerId' in action.target
        && action.target.playerId === player.id && action.id.includes(':event-pick:')
      || action.kind === 'kickoffMove' && action.id.includes(`:solid-place:${player.id}:`)));
}

export function canDropSetupPlayer(view: SetupState, playerId: string, to: RoutePoint | null): boolean {
  const player = view.players.find(item => item.id === playerId && item.role === view.callerRole);
  if (!player || view.phase !== 'SETUP' || view.actor !== view.callerRole) return false;
  return to ? canPlaceReserve(view, playerId, to.x, to.y) : player.x !== null;
}

/** The Solid Defence target and selection must both be offered by this revision. */
export function solidDefenceDrop(view: SetupState, actions: SetupAction[], playerId: string, to: RoutePoint): {
  action: SetupAction; selecting: boolean
} | null {
  if (view.phase !== 'PLAY' || view.turnMode !== 'SOLID_DEFENCE' || view.actor !== view.callerRole) return null;
  const player = view.players.find(item => item.id === playerId && item.role === view.callerRole);
  if (!player || player.x === null || !canPlaceReserve({ ...view, phase: 'SETUP' }, playerId, to.x, to.y)) return null;
  const available = actions.filter(action => action.actor === view.callerRole);
  const placement = available.find(action => action.kind === 'kickoffMove' && action.id.includes(`:solid-place:${playerId}:`)
    && action.target && 'x' in action.target && action.target.x === to.x && action.target.y === to.y);
  if (placement) return { action: placement, selecting: false };
  const select = available.find(action => action.kind === 'kickoffChoice' && action.id.endsWith(`:event-pick:${playerId}`));
  return select ? { action: select, selecting: true } : null;
}
