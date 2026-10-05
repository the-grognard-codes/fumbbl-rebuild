import type { SetupAction, SetupState } from './setup-protocol.ts';

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

/** A recipient click reviews the native square target of the already active Pass. */
export function passTargetForPlayer(view: SetupState, actions: SetupAction[], playerId: string, targetId: string): SetupAction | undefined {
  if (view.phase !== 'PLAY' || view.actor !== view.callerRole || view.activePlayerId !== playerId || playerId === targetId) return undefined;
  const target = view.players.find(player => player.id === targetId);
  if (target?.x == null || target.y == null) return undefined;
  return actions.find(action => action.kind === 'pass' && action.actor === view.callerRole && action.sourcePlayerId === playerId
    && action.target && 'x' in action.target && action.target.x === target.x && action.target.y === target.y);
}

export type SmartAttack = { kind: 'block' | 'blitz' | 'foul'; action: SetupAction; targetId: string };

/** Resolve a clicked opponent only through the actions offered for the selected player. */
export function smartAttack(view: SetupState, actions: SetupAction[], playerId: string, targetId: string, preferBlitz = false): SmartAttack | null {
  const player = view.players.find(item => item.id === playerId && item.role === view.callerRole);
  const target = view.players.find(item => item.id === targetId && item.role !== view.callerRole);
  if (!player || !target || player.x === null || player.y === null || target.x === null || target.y === null) return null;
  const adjacent = Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y)) === 1;
  const direct = (kind: string) => actions.find(action => action.kind === kind && action.sourcePlayerId === playerId
    && action.target && 'playerId' in action.target && action.target.playerId === targetId);
  const declaration = (kind: string) => actions.find(action => action.kind === kind && action.sourcePlayerId === playerId);
  const active = view.activePlayerId === playerId;
  if (view.turnMode === 'SELECT_BLITZ_TARGET' && active) {
    const action = direct('blitzTarget');
    return action ? { kind: 'blitz', action, targetId } : null;
  }
  if (/prone|stunned/i.test(target.state)) {
    const action = active ? direct('foul') : declaration('declareFoul');
    return action ? { kind: 'foul', action, targetId } : null;
  }
  if (!/standing/i.test(target.state)) return null;
  if (adjacent) {
    if (preferBlitz && !active) {
      const blitz = declaration('blitz');
      if (blitz) return { kind: 'blitz', action: blitz, targetId };
    }
    const action = active ? direct('block') : declaration('selectBlock');
    return action ? { kind: 'block', action, targetId } : null;
  }
  const action = active ? direct('blitzTarget') : declaration('blitz');
  return action ? { kind: 'blitz', action, targetId } : null;
}

/** Candidate waypoints beside the opponent, nearest first; the server validates each route. */
export function attackApproaches(view: SetupState, playerId: string, targetId: string): { x: number; y: number }[] {
  const player = view.players.find(item => item.id === playerId);
  const target = view.players.find(item => item.id === targetId);
  if (player?.x === null || player?.x === undefined || player.y === null || target?.x === null || target?.x === undefined || target.y === null) return [];
  const squares: { x: number; y: number }[] = [];
  for (let y: number = target.y - 1; y <= target.y + 1; y++) for (let x: number = target.x - 1; x <= target.x + 1; x++) {
    if (x === target.x && y === target.y || x < 0 || x > 25 || y < 0 || y > 14) continue;
    if (view.players.some(item => item.x === x && item.y === y && item.id !== playerId)) continue;
    squares.push({ x, y });
  }
  squares.sort((first, second) => Math.max(Math.abs(first.x - player.x!), Math.abs(first.y - player.y!))
    - Math.max(Math.abs(second.x - player.x!), Math.abs(second.y - player.y!))
    || first.y - second.y || first.x - second.x);
  return squares;
}

export function hasUnactivatedPlayers(actions: SetupAction[]): boolean {
  return actions.some(action => commonKinds.has(action.kind) && action.sourcePlayerId);
}

export function recentActionLabel(action: SetupAction): string {
  if (!action.kind.startsWith('declare')) return action.label;
  return action.kind.slice('declare'.length).replace(/([a-z])([A-Z])/g, '$1 $2');
}
