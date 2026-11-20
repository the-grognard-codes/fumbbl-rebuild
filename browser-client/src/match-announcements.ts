import type { SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';

export type MatchAnnouncementEvent = {
  kind: 'turnover' | 'touchdown' | 'turnStart' | 'kickoff' | 'weather' | 'halfTime' | 'fullTime'; team: 'home' | 'away'; turn: number; half: number; reason: string | null;
  headline?: string; code?: string;
  scorer?: { name: string; number: number };
  teamSpecific?: boolean;
  weather?: { code: string; headline: string; reason: string };
};
export const kickoffCodes = ['GET_THE_REF', 'TIME_OUT', 'SOLID_DEFENCE', 'HIGH_KICK', 'CHEERING_FANS', 'WEATHER_CHANGE', 'BRILLIANT_COACHING', 'QUICK_SNAP', 'CHARGE', 'DODGY_SNACK', 'PITCH_INVASION'];
export const weatherCodes = ['SWELTERING_HEAT', 'VERY_SUNNY', 'NICE', 'POURING_RAIN', 'BLIZZARD'];
export type MatchAnnouncement = MatchAnnouncementEvent & {
  id: string; teamName: string; helmet: 'human' | 'orc';
  score?: Record<'home' | 'away', { name: string; points: number }>;
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
    if (Object.keys(event).some(key => !['kind', 'team', 'turn', 'half', 'reason', 'headline', 'code', 'scorer', 'teamSpecific', 'weather'].includes(key)) || typeof event.kind !== 'string' || !['turnover', 'touchdown', 'turnStart', 'kickoff', 'weather', 'halfTime', 'fullTime'].includes(event.kind)
      || typeof event.team !== 'string' || !['home', 'away'].includes(event.team) || !Number.isSafeInteger(event.turn) || Number(event.turn) < 0
      || Number(event.turn) > 1000 || !Number.isSafeInteger(event.half) || Number(event.half) < 1 || Number(event.half) > 1000
      || !(event.reason === null || typeof event.reason === 'string' && event.reason.length > 0 && event.reason.length <= 1000))
      throw Error('Invalid match announcement');
    if (event.headline !== undefined && (typeof event.headline !== 'string' || !event.headline.trim() || event.headline.length > 100)) throw Error('Invalid announcement headline');
    const codes = event.kind === 'kickoff' ? kickoffCodes : event.kind === 'weather' ? weatherCodes : event.kind === 'fullTime' ? ['CONCEDED', 'DRAW', 'WIN'] : null;
    if (codes ? typeof event.code !== 'string' || !codes.includes(event.code) || typeof event.headline !== 'string' : event.code !== undefined || event.headline !== undefined)
      throw Error('Invalid announcement details');
    if (event.kind === 'kickoff' ? typeof event.teamSpecific !== 'boolean' : event.teamSpecific !== undefined)
      throw Error('Invalid kickoff attribution');
    if (event.scorer !== undefined) {
      const scorer = announcementObject(event.scorer);
      if (event.kind !== 'touchdown' || Object.keys(scorer).length !== 2 || typeof scorer.name !== 'string'
        || scorer.name.length === 0 || scorer.name.length > 100 || !Number.isSafeInteger(scorer.number)
        || Number(scorer.number) < 0 || Number(scorer.number) > 1000) throw Error('Invalid announcement scorer');
    }
    if (event.weather !== undefined) {
      const weather = announcementObject(event.weather);
      if (event.kind !== 'kickoff' || event.code !== 'WEATHER_CHANGE' || Object.keys(weather).length !== 3
        || typeof weather.code !== 'string' || !weatherCodes.includes(weather.code)
        || typeof weather.headline !== 'string' || !weather.headline.trim() || weather.headline.length > 100
        || typeof weather.reason !== 'string' || !weather.reason.trim() || weather.reason.length > 1000)
        throw Error('Invalid kickoff weather');
    }
    return event as MatchAnnouncementEvent;
  });
}

function announcementObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid announcement details');
  return value as Record<string, unknown>;
}

export function syncAnnouncements(record: TranscriptRecord, sync: Record<string, unknown>): MatchAnnouncement[] {
  if (sync.matchAnnouncements === undefined) return [];
  const { state } = record;
  const events = decodeMatchAnnouncements(sync.matchAnnouncements);
  const id = (index: number) => `${state.matchId}:${record.revision}:${sync.commandNr}:${index}`;
  return events.map((event, index) => {
    const announcement: MatchAnnouncement = { ...event, id: id(index),
      teamName: matchTeamName(state, event.team), helmet: announcementHelmet(state, event.team) };
    if (event.kind === 'touchdown' || event.kind === 'halfTime' || event.kind === 'fullTime') {
      announcement.score = {
        home: { name: matchTeamName(state, 'home'), points: state.homeScore },
        away: { name: matchTeamName(state, 'away'), points: state.awayScore },
      };
    }
    if (event.weather) {
      const weather = events[index + 1];
      announcement.kickoffWeather = {
        code: event.weather.code, label: event.weather.headline, detail: event.weather.reason,
        pairedEventId: weather?.kind === 'weather' && weather.code === event.weather.code ? id(index + 1) : undefined,
      };
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
  if (event.headline) return event.headline.toUpperCase();
  return event.kind === 'turnStart' ? `START OF TURN ${event.turn}` : event.kind === 'touchdown' ? 'TOUCHDOWN!' : event.kind === 'halfTime' ? 'HALF-TIME' : 'TURNOVER';
}

export function announcementOutcome(event: MatchAnnouncement): string | null {
  if (event.kind !== 'fullTime') return null;
  return event.code === 'DRAW' ? 'Draw' : `${event.teamName} wins`;
}

export function announcementScorer(event: MatchAnnouncementEvent): string | null {
  return event.scorer ? `${event.scorer.name} #${event.scorer.number}` : null;
}

export function announcementText(event: MatchAnnouncement, surface: 'log' | 'splash' = 'log'): string {
  const shared = ['weather', 'halfTime', 'fullTime'].includes(event.kind) || event.kind === 'kickoff' && !event.teamSpecific;
  const team = shared ? '' : `${event.teamName} — `;
  const headline = surface === 'log' && event.headline ? event.headline.toUpperCase() : announcementHeadline(event);
  const scorer = announcementScorer(event);
  let detail = [scorer, event.reason].filter(Boolean).join(' — ');
  if (surface === 'splash') {
    if (event.score) {
      const { home, away } = event.score;
      detail = [scorer, `${home.name}: ${home.points}. ${away.name}: ${away.points}`, announcementOutcome(event)]
        .filter(Boolean).join('. ');
    } else if (event.kickoffWeather) detail = event.kickoffWeather.label;
  }
  return `${team}${headline}${detail ? `. ${detail}` : ''}`;
}

export function announcementReadingDuration(event: MatchAnnouncementEvent, rate: number): number {
  // Core splashes get their full reading time before exit. Other cards retain their animated timing.
  const milliseconds: Record<MatchAnnouncementEvent['kind'], number> = {
    turnStart: 1500, turnover: 3000, kickoff: 2300, weather: 2300, touchdown: 3000, halfTime: 2800, fullTime: 3800,
  };
  return milliseconds[event.kind] / rate;
}
