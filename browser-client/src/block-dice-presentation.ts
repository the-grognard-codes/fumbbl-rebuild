import type { SetupAction, SetupState } from './setup-protocol.ts';
import type { MovementPlan } from './movement-protocol.ts';

export type PotentialBlockDice = { dice: number; targetPlayerId: string };

/** Only an explicitly proposed target and current native forecast can show dice. */
export function potentialBlockDice(view: SetupState, playerId: string, targetPlayerId: string,
  action: SetupAction | undefined, blitzPlan: MovementPlan | null): PotentialBlockDice | null {
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.actor !== view.callerRole) return null;
  if (blitzPlan?.kind === 'blitz' && blitzPlan.route.revision === view.revision
    && blitzPlan.route.actor === view.callerRole && blitzPlan.route.playerId === playerId
    && blitzPlan.targetPlayerId === targetPlayerId && blitzPlan.blockDice !== undefined)
    return { dice: blitzPlan.blockDice, targetPlayerId };
  if (!action || action.actor !== view.callerRole || !['selectBlock', 'block', 'blitzTarget'].includes(action.kind)
    || action.sourcePlayerId !== playerId) return null;
  const target = action.kind === 'selectBlock' ? targetPlayerId
    : action.target && 'playerId' in action.target ? action.target.playerId : '';
  const roll = view.blockPreview?.rolls.find(roll => roll.playerId === playerId && roll.targetPlayerId === target);
  return roll ? { dice: roll.dice, targetPlayerId: target } : null;
}
