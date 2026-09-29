import type { SetupAction, SetupState } from './setup-protocol.ts';

export type PushChoice = { action: SetupAction; x: number; y: number; fromX: number; fromY: number };

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
