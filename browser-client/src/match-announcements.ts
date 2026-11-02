import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';

export type MatchAnnouncementEvent = {
  kind: 'turnover' | 'touchdown' | 'turnStart'; team: 'home' | 'away'; turn: number; half: number; reason: string | null;
};
export type MatchAnnouncement = MatchAnnouncementEvent & { id: string; teamName: string; helmet: 'human' | 'orc' };

/** Presentation facts are emitted by the server after rules resolution, never inferred from dice. */
export function decodeMatchAnnouncements(value: unknown): MatchAnnouncementEvent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid match announcements');
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1 || Object.keys(envelope).length !== 2 || !Array.isArray(envelope.events)
    || envelope.events.length > 8) throw Error('Invalid match announcements');
  return envelope.events.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid match announcement');
    const event = value as Record<string, unknown>;
    if (Object.keys(event).length !== 5 || typeof event.kind !== 'string' || !['turnover', 'touchdown', 'turnStart'].includes(event.kind)
      || typeof event.team !== 'string' || !['home', 'away'].includes(event.team) || !Number.isSafeInteger(event.turn) || Number(event.turn) < 0
      || Number(event.turn) > 1000 || !Number.isSafeInteger(event.half) || Number(event.half) < 1 || Number(event.half) > 1000
      || !(event.reason === null || typeof event.reason === 'string' && event.reason.length > 0 && event.reason.length <= 1000))
      throw Error('Invalid match announcement');
    return event as MatchAnnouncementEvent;
  });
}

export function syncAnnouncements(record: TranscriptRecord, sync: Record<string, unknown>): MatchAnnouncement[] {
  if (sync.matchAnnouncements === undefined) return [];
  return decodeMatchAnnouncements(sync.matchAnnouncements).map((event, index) => ({ ...event,
    id: `${record.state.matchId}:${record.revision}:${sync.commandNr}:${index}`,
    teamName: matchTeamName(record.state, event.team), helmet: announcementHelmet(record.state, event.team) }));
}

function announcementHelmet(view: SetupState, team: 'home' | 'away'): 'human' | 'orc' {
  const roster = (team === 'home' ? view.homeTeamArt : view.awayTeamArt)?.rosterId
    ?? view.players.find(player => player.role === team && player.art)?.art?.rosterId;
  return roster === 'orc' ? 'orc' : 'human';
}

export function announcementHeadline(event: MatchAnnouncementEvent): string {
  return event.kind === 'turnStart' ? `START OF TURN ${event.turn}` : event.kind === 'touchdown' ? 'TOUCHDOWN' : 'TURNOVER';
}

export function announcementText(event: MatchAnnouncement): string {
  return `${event.teamName} — ${announcementHeadline(event)}${event.reason ? `. ${event.reason}` : ''}`;
}

export function announcementDuration(event: MatchAnnouncementEvent, rate: number): number {
  return (event.kind === 'turnStart' ? 1500 : 3000) / rate;
}
