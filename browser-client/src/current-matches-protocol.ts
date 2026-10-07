export type CurrentMatch = {
  matchId: string; callerRole: 'home' | 'away';
  lifecycle: 'WAITING_FOR_OPPONENT' | 'AWAITING_SETUP' | 'ACTIVATED' | 'UNAVAILABLE';
  homeTeamName: string | null; awayTeamName: string | null; phase: string | null;
};

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const optionalText = (value: unknown) => value === null || typeof value === 'string' && value.length > 0 && value.length <= 200;

export function decodeCurrentMatches(matches: unknown, next: unknown): CurrentMatch[] {
  if (!Array.isArray(matches) || matches.length > 100 || next !== null && (typeof next !== 'string' || !uuid.test(next)))
    throw Error('Invalid current match page');
  let previous = '';
  for (const match of matches) {
    const keys = ['matchId', 'callerRole', 'lifecycle', 'homeTeamName', 'awayTeamName', 'phase'];
    if (!match || typeof match !== 'object' || Array.isArray(match)
      || Object.keys(match).length !== keys.length || keys.some(key => !Object.hasOwn(match, key))
      || typeof match.matchId !== 'string' || !uuid.test(match.matchId) || match.matchId <= previous
      || !['home', 'away'].includes(match.callerRole)
      || !['WAITING_FOR_OPPONENT', 'AWAITING_SETUP', 'ACTIVATED', 'UNAVAILABLE'].includes(match.lifecycle)
      || ![match.homeTeamName, match.awayTeamName, match.phase].every(optionalText)
      || match.lifecycle !== 'UNAVAILABLE' && match.homeTeamName === null
      || ['AWAITING_SETUP', 'ACTIVATED'].includes(match.lifecycle) && match.awayTeamName === null)
      throw Error('Invalid current match');
    previous = match.matchId;
  }
  if (next !== null && next < previous) throw Error('Invalid current match cursor');
  return matches as CurrentMatch[];
}

export function currentMatchStatus(match: CurrentMatch): string {
  if (match.lifecycle === 'WAITING_FOR_OPPONENT') return 'Waiting for opponent';
  if (match.lifecycle === 'AWAITING_SETUP') return 'Ready to start';
  if (match.lifecycle === 'UNAVAILABLE') return 'Temporarily unavailable';
  if (['PRE_MATCH', 'READY_FOR_KICKOFF', 'SETUP'].includes(match.phase ?? '')) return 'Awaiting kickoff';
  if (match.phase === 'FULL_TIME') return 'Finishing';
  return 'In progress';
}
