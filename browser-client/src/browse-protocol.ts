export type BrowseTeam = { name: string; type: string; teamValue: number | null; coach: string | null };
export type BrowseDetails = {
  home: BrowseTeam; away: BrowseTeam; ruleset: string; competition: string | null;
  phase: string | null; half: number | null; turn: number | null;
  homeScore: number | null; awayScore: number | null; spectators: number;
};
export type BrowseGame = { matchId: string; label: string; details?: BrowseDetails };

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw Error('Unexpected browse fields');
  return value as Record<string, unknown>;
}
const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const optionalText = (value: unknown) => value === null || text(value);
const optionalCount = (value: unknown) => value === null || count(value);

/** Only the public directory projection may reach the game list. */
export function decodeBrowseGames(value: unknown): BrowseGame[] {
  if (!Array.isArray(value) || value.length > 100) throw Error('Invalid browse list');
  const ids = new Set<string>();
  for (const item of value) {
    const entry = exact(item, Object.hasOwn(item ?? {}, 'details') ? ['matchId', 'label', 'details'] : ['matchId', 'label']);
    if (typeof entry.matchId !== 'string' || !uuid.test(entry.matchId) || ids.has(entry.matchId) || !text(entry.label))
      throw Error('Invalid browse game');
    ids.add(entry.matchId);
    if (!Object.hasOwn(entry, 'details')) continue;
    const details = exact(entry.details, ['home', 'away', 'ruleset', 'competition', 'phase', 'half', 'turn', 'homeScore', 'awayScore', 'spectators']);
    for (const side of ['home', 'away']) {
      const team = exact(details[side], ['name', 'type', 'teamValue', 'coach']);
      if (!text(team.name) || !text(team.type) || !optionalCount(team.teamValue) || !optionalText(team.coach))
        throw Error('Invalid browse team');
    }
    if (!text(details.ruleset) || !optionalText(details.competition) || !optionalText(details.phase)
      || !['half', 'turn', 'homeScore', 'awayScore'].every(key => optionalCount(details[key])) || !count(details.spectators))
      throw Error('Invalid browse details');
  }
  return value as BrowseGame[];
}

export function gameLabel(game: BrowseGame): string {
  return game.details ? `${game.details.home.name} vs. ${game.details.away.name}` : game.label;
}

export function filterLiveGames(games: BrowseGame[], query: string): BrowseGame[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return games.filter(game => {
    const details = game.details;
    const haystack = [game.matchId, gameLabel(game), details?.home.type, details?.away.type,
      details?.home.coach, details?.away.coach, details?.ruleset, details?.competition].join(' ').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

export type ReplayFilters = { gameId: string; playerName: string; teamName: string; teamType: string };
export const emptyReplayFilters: ReplayFilters = { gameId: '', playerName: '', teamName: '', teamType: '' };

/** Directory search seam: a replay archive endpoint can replace this empty source later. */
export function searchReplayGames(filters: ReplayFilters): { games: BrowseGame[]; available: boolean; filters: ReplayFilters } {
  return { games: [], available: false,
    filters: Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, value.trim()])) as ReplayFilters };
}
