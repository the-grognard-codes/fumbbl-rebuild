import type { TranscriptRecord } from './transcript-protocol.ts';

export type ConfirmedMove = { playerId: string; x: number; y: number };

/** The native sync stream is ordered by command number inside each durable decision. */
export function confirmedMoves(record: TranscriptRecord): ConfirmedMove[] {
  const moves: ConfirmedMove[] = [];
  const known = new Set(record.state.players.map(player => player.id));
  for (const sync of record.native) {
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
      moves.push({ playerId: change.modelChangeKey, x: x as number, y: y as number });
    }
  }
  return moves;
}
