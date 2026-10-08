import { stadiumAtlases, stadiumVenues, stadiumTeams, stadiumRoleLayout } from './generated-stadium-art.ts';
import type { MatchTeamArt, SetupState } from './setup-protocol.ts';
import type { PitchEnd } from './pitch-projection.ts';

export type StadiumProfile = (typeof stadiumAtlases)[keyof typeof stadiumAtlases];
export type StadiumRole = keyof StadiumProfile['regions'];
/** World-coordinate phases keep ambient movement independent of match events and viewing end. */
export function stadiumMotion(role: StadiumRole, x: number, y: number) {
  const seed = Math.abs(Math.round(x * 10) * 17 + Math.round(y * 10) * 31);
  const motion = stadiumRoleLayout[role].motion;
  return { kind: motion === 'sparse-sway' && seed % 7 !== 0 ? 'static' : motion,
    delay: -(seed % 120) / 20, duration: motion === 'sparse-sway' ? 6 + seed % 3
      : motion === 'fire-flicker' ? 1.8 + (seed % 4) * .2 : 4 + (seed % 4) * .5 };
}
export const SIDELINE_MARGIN = 1.5;
export const STADIUM_ROWS = 4;
export const STADIUM_RECESSES = [
  { side: 'north', start: 4.5, end: 7.5, depth: 2, role: 'bench', team: 'home', x: 6, y: -2.5 },
  { side: 'south', start: 18.5, end: 21.5, depth: 2, role: 'bench', team: 'away', x: 20, y: 17.5 },
  { side: 'north', start: 10.5, end: 15.5, depth: 3, role: 'pavilion', x: 13, y: -3 },
] as const;
const fallback = stadiumAtlases['old-world-classic'];
/** Independent catalogs allow different supporters to share one League venue. */
export function stadiumPresentation(view: Pick<SetupState, 'homeTeamArt' | 'awayTeamArt'>) {
  const diagnostics: string[] = [];
  const team = (identity: MatchTeamArt | undefined, role: PitchEnd) => {
    const id = identity && Object.hasOwn(stadiumTeams, identity.rosterId) ? stadiumTeams[identity.rosterId] : undefined;
    if (!id) diagnostics.push('Missing ' + role + ' supporter profile for ' + (identity?.rosterId ?? 'legacy team') + '; using Human placeholder');
    return id ? stadiumAtlases[id] : fallback;
  };
  const league = view.homeTeamArt?.league, venueId = league && Object.hasOwn(stadiumVenues, league) ? stadiumVenues[league] : undefined;
  if (!venueId) diagnostics.push('Missing venue for ' + (league ?? 'legacy home League') + '; using Old World Classic');
  return { venue: venueId ? stadiumAtlases[venueId] : fallback, home: team(view.homeTeamArt, 'home'),
    away: team(view.awayTeamArt, 'away'), league: venueId ? league : 'Old World Classic', fallback: !venueId, diagnostics };
}
export type StadiumSeat = { id: string; x: number; y: number; row: number; team: PitchEnd; side: 'north' | 'south' | PitchEnd };
export function stadiumSeats(): StadiumSeat[] {
  const seats: StadiumSeat[] = [];
  for (let row = 0; row < STADIUM_ROWS; row++) {
    for (let x = .6; x < 26; x += 1.5) for (const side of ['north','south'] as const) {
      if (STADIUM_RECESSES.some(recess => recess.side === side && x > recess.start && x < recess.end && row < recess.depth)) continue;
      seats.push({ id: side + '-' + row + '-' + x, x, y: side === 'north' ? -2.05 - row : 17.05 + row,
        row, team: x < 13 ? 'home' : 'away', side });
    }
    for (let y = .6; y < 15; y += 1.5) for (const side of ['home','away'] as const) {
      if (y > 5.5 && y < 9.5 && row < 2) continue;
      seats.push({ id: side + '-' + row + '-' + y, x: side === 'home' ? -2.05 - row : 28.05 + row,
        y, row, team: side, side });
    }
  }
  return seats;
}
