import type { TranscriptRecord } from './transcript-protocol.ts';
import { reportedDice } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';

export type ConfirmedMove = { playerId: string; x: number; y: number };
export type PlaybackBeat = { kind: 'move'; move: ConfirmedMove } | { kind: 'dice'; dice: DiceMoment };

/** The native sync stream is ordered by command number inside each durable decision. */
export function playbackBeats(record: TranscriptRecord): PlaybackBeat[] {
  const beats: PlaybackBeat[] = [];
  const known = new Set(record.state.players.map(player => player.id));
  for (const sync of record.native) {
    const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
    if (Array.isArray(reports)) for (const value of reports) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const dice = reportedDice(value as Record<string, unknown>);
      if (dice) beats.push({ kind: 'dice', dice });
    }
    const changes = (sync.modelChangeList as { modelChangeArray?: unknown[] } | undefined)?.modelChangeArray;
    if (!Array.isArray(changes)) continue;
    for (const value of changes) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const change = value as Record<string, unknown>;
      if (change.modelChangeId !== 'fieldModelSetPlayerCoordinate' || typeof change.modelChangeKey !== 'string'
        || !known.has(change.modelChangeKey)) continue;
      const square = change.modelChangeValue;
      if (!square || typeof square !== 'object' || Array.isArray(square)) continue;
      const { x, y } = square as Record<string, unknown>;
      if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (x as number) > 25
        || (y as number) < 0 || (y as number) > 14) continue;
      beats.push({ kind: 'move', move: { playerId: change.modelChangeKey, x: x as number, y: y as number } });
    }
  }
  return beats;
}

export function confirmedMoves(record: TranscriptRecord): ConfirmedMove[] {
  return playbackBeats(record).filter(beat => beat.kind === 'move').map(beat => (beat as { kind: 'move'; move: ConfirmedMove }).move);
}
