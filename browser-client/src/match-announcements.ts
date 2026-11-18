import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import { weatherPresentation } from './weather-presentation.ts';

export type MatchAnnouncementEvent = {
  kind: 'turnover' | 'touchdown' | 'turnStart' | 'kickoff' | 'weather' | 'halfTime' | 'fullTime'; team: 'home' | 'away'; turn: number; half: number; reason: string | null;
  headline?: string; code?: string;
};
export const kickoffCodes = ['GET_THE_REF', 'TIME_OUT', 'SOLID_DEFENCE', 'HIGH_KICK', 'CHEERING_FANS', 'WEATHER_CHANGE', 'BRILLIANT_COACHING', 'QUICK_SNAP', 'CHARGE', 'DODGY_SNACK', 'PITCH_INVASION'];
export const weatherCodes = ['SWELTERING_HEAT', 'VERY_SUNNY', 'NICE', 'POURING_RAIN', 'BLIZZARD'];
type TouchdownDetails = {
  scorer: string | null;
  score: Record<'home' | 'away', { name: string; points: number }>;
};
export type MatchAnnouncement = MatchAnnouncementEvent & {
  id: string; teamName: string; helmet: 'human' | 'orc'; touchdown?: TouchdownDetails;
  kickoffWeather?: { code: string; label: string; detail: string | null; pairedEventId?: string };
};

/** Presentation facts are emitted by the server after rules resolution, never inferred from dice. */
export function decodeMatchAnnouncements(value: unknown): MatchAnnouncementEvent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid match announcements');
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1 || Object.keys(envelope).length !== 2 || !Array.isArray(envelope.events)
    || envelope.events.length > 8) throw Error('Invalid match announcements');
  return envelope.events.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid match announcement');
    const event = value as Record<string, unknown>;
    if (Object.keys(event).some(key => !['kind', 'team', 'turn', 'half', 'reason', 'headline', 'code'].includes(key)) || typeof event.kind !== 'string' || !['turnover', 'touchdown', 'turnStart', 'kickoff', 'weather', 'halfTime', 'fullTime'].includes(event.kind)
      || typeof event.team !== 'string' || !['home', 'away'].includes(event.team) || !Number.isSafeInteger(event.turn) || Number(event.turn) < 0
      || Number(event.turn) > 1000 || !Number.isSafeInteger(event.half) || Number(event.half) < 1 || Number(event.half) > 1000
      || !(event.reason === null || typeof event.reason === 'string' && event.reason.length > 0 && event.reason.length <= 1000))
      throw Error('Invalid match announcement');
    if (event.headline !== undefined && (typeof event.headline !== 'string' || !event.headline.trim() || event.headline.length > 100)) throw Error('Invalid announcement headline');
    const codes = event.kind === 'kickoff' ? kickoffCodes : event.kind === 'weather' ? weatherCodes : event.kind === 'fullTime' ? ['CONCEDED', 'DRAW', 'WIN'] : null;
    if (codes ? typeof event.code !== 'string' || !codes.includes(event.code) || typeof event.headline !== 'string' : event.code !== undefined || event.headline !== undefined)
      throw Error('Invalid announcement details');
    return event as MatchAnnouncementEvent;
  });
}

export function syncAnnouncements(record: TranscriptRecord, sync: Record<string, unknown>): MatchAnnouncement[] {
  if (sync.matchAnnouncements === undefined) return [];
  const { state } = record;
  const events = decodeMatchAnnouncements(sync.matchAnnouncements);
  const id = (index: number) => `${state.matchId}:${record.revision}:${sync.commandNr}:${index}`;
  return events.map((event, index) => {
    const announcement: MatchAnnouncement = { ...event, id: id(index),
      teamName: matchTeamName(state, event.team), helmet: announcementHelmet(state, event.team) };
    if (event.kind === 'touchdown') {
      announcement.touchdown = {
        scorer: event.reason?.match(/^(.* #\d+) — (.+)$/s)?.[1] ?? event.reason,
        score: {
          home: { name: matchTeamName(state, 'home'), points: state.homeScore },
          away: { name: matchTeamName(state, 'away'), points: state.awayScore },
        },
      };
    }
    if (event.kind === 'kickoff' && event.code === 'WEATHER_CHANGE') {
      const weather = events[index + 1];
      if (weather?.kind === 'weather' && weather.code && weather.headline) {
        announcement.kickoffWeather = {
          code: weather.code, label: weather.headline, detail: weather.reason, pairedEventId: id(index + 1),
        };
      } else if (weatherCodes.includes(state.weather)) {
        announcement.kickoffWeather = {
          code: state.weather, label: weatherPresentation(state.weather).label, detail: null,
        };
      }
    }
    return announcement;
  });
}

function announcementHelmet(view: SetupState, team: 'home' | 'away'): 'human' | 'orc' {
  const roster = (team === 'home' ? view.homeTeamArt : view.awayTeamArt)?.rosterId
    ?? view.players.find(player => player.role === team && player.art)?.art?.rosterId;
  return roster === 'orc' ? 'orc' : 'human';
}

export function announcementHeadline(event: MatchAnnouncementEvent): string {
  if (event.kind === 'kickoff' && event.code === 'WEATHER_CHANGE') return 'CHANGING WEATHER';
  if (event.kind === 'fullTime' && event.headline?.toUpperCase() === 'FULL TIME') return 'END OF REGULATION';
  if (event.headline) return event.headline.toUpperCase();
  return event.kind === 'turnStart' ? `START OF TURN ${event.turn}` : event.kind === 'touchdown' ? 'TOUCHDOWN!' : event.kind === 'halfTime' ? 'HALF-TIME' : 'TURNOVER';
}

export function announcementText(event: MatchAnnouncement, surface: 'log' | 'splash' = 'log'): string {
  const shared = ['weather', 'halfTime', 'fullTime'].includes(event.kind) || event.kind === 'kickoff' && !['SOLID_DEFENCE', 'QUICK_SNAP', 'CHARGE', 'HIGH_KICK'].includes(event.code ?? '');
  const team = shared ? '' : `${event.teamName} — `;
  const headline = surface === 'log' && event.headline ? event.headline.toUpperCase() : announcementHeadline(event);
  const detail = surface === 'splash' ? event.kickoffWeather?.label ?? event.reason : event.reason;
  return `${team}${headline}${detail ? `. ${detail}` : ''}`;
}

export function announcementDuration(event: MatchAnnouncementEvent, rate: number): number {
  return (event.kind === 'turnStart' ? 1500 : event.kind === 'kickoff' || event.kind === 'weather' ? 2500 : event.kind === 'fullTime' ? 4000 : 3000) / rate;
}
