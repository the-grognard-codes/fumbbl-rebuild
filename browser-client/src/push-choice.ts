import type { SetupAction, SetupState } from './setup-protocol.ts';

export type PushChoice = { action: SetupAction; x: number; y: number; fromX: number; fromY: number };

/** Punt arrows are local selections until Confirm; native actions own their direction. */
export function pitchPuntChoices(view: SetupState, actions: SetupAction[], playerId: string,
  plannedFrom?: { x: number; y: number }): PushChoice[] {
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.actor !== view.callerRole) return [];
  const player = view.players.find(player => player.id === playerId && player.role === view.callerRole);
  if (player?.x == null || player.y == null) return [];
  const from = plannedFrom ?? { x: player.x, y: player.y };
  return actions.flatMap(action => {
    const target = action.target;
    if (!['punt', 'puntDirection'].includes(action.kind) || action.actor !== view.callerRole
      || action.sourcePlayerId !== playerId || !target || !('x' in target)) return [];
    const dx = target.x - player.x!, dy = target.y - player.y!;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return [];
    return [{ action, x: from.x + dx, y: from.y + dy, fromX: from.x, fromY: from.y }];
  });
}

/** A pitch choice exists only when every offered push has a known pushed player and square. */
export function pitchPushChoices(view: SetupState, actions: SetupAction[]): PushChoice[] {
  if (view.callerRole === 'spectator') return [];
  const offered = actions.filter(action => action.actor === view.callerRole && action.kind === 'push');
  if (!offered.length) return [];
  const choices: PushChoice[] = [];
  for (const action of offered) {
    const target = action.target;
    const match = /^\d+:push:(.+):(\d+):(\d+)$/.exec(action.id);
    if (!match || !target || !('x' in target) || +match[2] !== target.x || +match[3] !== target.y) return [];
    const pushed = view.players.find(player => player.id === match[1]);
    if (!pushed || pushed.x === null || pushed.y === null || Math.max(Math.abs(pushed.x - target.x), Math.abs(pushed.y - target.y)) !== 1) return [];
    choices.push({ action, x: target.x, y: target.y, fromX: pushed.x, fromY: pushed.y });
  }
  return choices;
}

/** Hit and Run reuses the same projected square arrows, pointing from its acting player. */
export function pitchHitAndRunChoices(view: SetupState, actions: SetupAction[]): PushChoice[] {
  if (view.phase !== 'PLAY' || view.turnMode !== 'HIT_AND_RUN' || view.callerRole === 'spectator'
    || view.actor !== view.callerRole) return [];
  const player = view.players.find(player => player.id === view.activePlayerId && player.role === view.callerRole);
  if (player?.x == null || player.y == null) return [];
  return actions.flatMap(action => {
    const target = action.target;
    if (action.kind !== 'hitAndRun' || action.actor !== view.callerRole || !target || !('x' in target)
      || Math.max(Math.abs(player.x! - target.x), Math.abs(player.y! - target.y)) !== 1) return [];
    return [{ action, x: target.x, y: target.y, fromX: player.x!, fromY: player.y! }];
  });
}

/** Sidestep's native square actions already combine optional use and the destination. */
export function pitchSidestepChoices(view: SetupState, actions: SetupAction[]): PushChoice[] {
  if (view.phase !== 'PLAY' || view.callerRole === 'spectator' || view.reaction?.actor !== view.callerRole
    || !/\bside\s*step\b/i.test(view.reaction.title)) return [];
  const offered = actions.filter(action => action.actor === view.callerRole && action.kind === 'reactiveSquare');
  if (!offered.length) return pitchPushChoices(view, actions);
  const choices: PushChoice[] = [];
  for (const action of offered) {
    const player = view.players.find(player => player.id === action.sourcePlayerId && player.role === action.actor);
    const target = action.target;
    const id = /^\d+:reaction-use:(\d+):(\d+)$/.exec(action.id);
    if (player?.x == null || player.y == null || !target || !('x' in target)
      || !id || +id[1] !== target.x || +id[2] !== target.y
      || Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y)) !== 1
      || choices.some(choice => choice.action.sourcePlayerId !== player.id)) return [];
    choices.push({ action, x: target.x, y: target.y, fromX: player.x, fromY: player.y });
  }
  return choices;
}
