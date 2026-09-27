import type { SetupAction } from './setup-protocol.ts';

const commonKinds = new Set(['select', 'stand', 'selectBlock', 'blitz']);
const contextualKinds = new Set(['move', 'jump', 'block', 'blitzTarget', 'pass', 'handOff', 'foul', 'liftTeamMate', 'throwTeamMate', 'push',
  'gaze', 'bomb', 'punt', 'kickMate', 'kickMateTo']);
const decisionKinds = new Set(['blockDie', 'reroll', 'skill', 'apothecary', 'argueTheCall', 'interception', 'followUp']);

export function actionForPlayer(actions: SetupAction[], playerId: string, kind: string): SetupAction | undefined {
  return actions.find(action => action.kind === kind && action.sourcePlayerId === playerId);
}

export function moreActions(actions: SetupAction[], playerId: string): SetupAction[] {
  if (!playerId) return [];
  return actions.filter(action => action.sourcePlayerId === playerId && !commonKinds.has(action.kind)
    && !contextualKinds.has(action.kind) && !decisionKinds.has(action.kind) && action.kind !== 'endTurn');
}

export function assistedTarget(actions: SetupAction[], explicitBlitz: boolean): SetupAction | undefined {
  if (!actions.length) return undefined;
  const eligible = explicitBlitz ? actions : actions.filter(action => action.kind !== 'blitzTarget');
  if (eligible.length === 1) return eligible[0];
  const preferred = eligible.filter(action => action.kind === 'block');
  return preferred.length === 1 ? preferred[0] : undefined;
}

export function hasUnactivatedPlayers(actions: SetupAction[]): boolean {
  return actions.some(action => commonKinds.has(action.kind) && action.sourcePlayerId);
}

export function recentActionLabel(action: SetupAction): string {
  if (!action.kind.startsWith('declare')) return action.label;
  return action.kind.slice('declare'.length).replace(/([a-z])([A-Z])/g, '$1 $2');
}
