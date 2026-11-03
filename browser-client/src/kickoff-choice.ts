import type { SetupAction, SetupState } from './setup-protocol.ts';

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

/** Browser-local draft: only confirmation is submitted to the engine. */
export function kickoffDraft(view: SetupState, ids: string[]) {
  if (view.callerRole === 'spectator' || view.reaction) return null;
  const actions = view.actions.filter(action => action.actor === view.callerRole);
  const group = kickoffChoice(actions, view.callerRole);
  const singles = view.turnMode === 'HIGH_KICK'
    ? actions.filter(action => action.kind === 'kickoffMove' && action.sourcePlayerId)
    : view.turnMode === 'TOUCHBACK'
      ? actions.filter(action => action.kind === 'touchback' && action.target && 'playerId' in action.target) : [];
  const players = group?.players.map(({ action }) => ({ action, id: (action.target as { playerId: string }).playerId }))
    ?? singles.map(action => ({ action, id: action.sourcePlayerId ?? (action.target as { playerId: string }).playerId }));
  if (!players.length) return null;
  const maximum = group ? view.kickoff?.allowed ?? players.length : 1;
  const selected = ids.filter(id => players.some(player => player.id === id));
  const confirm = group?.confirm ?? (!group && selected.length === 1 ? players.find(player => player.id === selected[0])!.action : null);
  return { players, selected, maximum, batch: !!group, confirm,
    decline: group?.decline ?? actions.find(action => action.id.endsWith(':end-event')) ?? null };
}

export function toggleKickoffPlayer(ids: string[], id: string, maximum: number): string[] {
  return ids.includes(id) ? ids.filter(value => value !== id) : ids.length < maximum ? [...ids, id] : ids;
}
