import type { SetupAction } from './setup-protocol.ts';

export type KickoffChoice = {
  players: { action: SetupAction; selected: boolean }[];
  confirm: SetupAction | null;
  decline: SetupAction | null;
  selectedCount: number;
};

function actionName(id: string): string { return id.slice(id.indexOf(':') + 1); }

/** The action IDs and labels come from the current authoritative kickoff decision. */
export function kickoffChoice(actions: SetupAction[], role: string): KickoffChoice | null {
  if (role === 'spectator') return null;
  const offered = actions.filter(action => action.actor === role && action.kind === 'kickoffChoice');
  const players = offered.filter(action => actionName(action.id).startsWith('event-pick:') && action.target && 'playerId' in action.target
    && (action.label.startsWith('Select ') || action.label.startsWith('Deselect ')))
    .map(action => ({ action, selected: action.label.startsWith('Deselect ') }));
  if (!players.length) return null;
  return {
    players,
    confirm: offered.find(action => actionName(action.id) === 'event-confirm') ?? null,
    decline: offered.find(action => actionName(action.id) === 'decline-event') ?? null,
    selectedCount: players.filter(player => player.selected).length
  };
}
