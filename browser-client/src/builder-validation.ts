import type { TeamDraft } from './team-protocol.ts';

/** Resolve only known form paths; server text never becomes a selector. */
export function builderValidationTarget(path: string, draft: TeamDraft, code?: string): string {
  if (path === 'teamName') return 'builder-team-name';
  if (path === 'rosterId') return 'builder-team-roster';
  if (/^formations(?:\.|$)/.test(path)) return 'builder-formations';
  if (/^colors(?:\.|$)/.test(path)) return 'builder-kit-toggle';
  if (path === 'resources') return 'builder-resources';
  const resource = /^resources\.([a-zA-Z]+)$/.exec(path)?.[1];
  if (resource && Object.hasOwn(draft.resources, resource)) return `builder-resource-${resource}`;
  if (path === 'captainId') {
    const player = draft.players.find(player => player.id === draft.captainId) ?? draft.players[0];
    return player ? `builder-player-${player.slot}-captain` : 'builder-roster';
  }
  const match = /^players\[(\d+)\](?:\.(playerName|jerseyNumber|captainId|skillIds)(?:\[\d+\])?)?$/.exec(path);
  const player = match ? draft.players[Number(match[1])] : undefined;
  if (player) {
    const fields: Record<string, string> = { playerName: 'name', jerseyNumber: 'jersey', captainId: 'captain', skillIds: 'skill' };
    const codeFields: Record<string, string> = { PLAYER_NAME: 'name', JERSEY_NUMBER: 'jersey', DUPLICATE_JERSEY: 'jersey', CAPTAIN_INELIGIBLE: 'captain', SKILL_LIMIT: 'skill', SKILL: 'skill', DUPLICATE_SKILL: 'skill', SKILL_INELIGIBLE: 'skill', ELITE_LIMIT: 'skill' };
    const field = fields[match?.[2] ?? ''] ?? codeFields[code ?? ''];
    return `builder-player-${player.slot}${field ? `-${field}` : ''}`;
  }
  return 'builder-roster';
}
