import type { TranscriptRecord } from './transcript-protocol.ts';
import { reportedDice } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';

export type ConfirmedMove = { playerId: string; x: number; y: number };
type BallChanges = { coordinate?: { x: number; y: number } | null; inPlay?: boolean; moving?: boolean };
export type PlaybackBeat = { kind: 'move'; move: ConfirmedMove; ballChanges?: BallChanges }
  | { kind: 'ball'; ballChanges: BallChanges } | { kind: 'dice'; dice: DiceMoment };

function nativeSquare(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = Array.isArray(value) ? { x: value[0], y: value[1] } : value as Record<string, unknown>;
  return Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (x as number) <= 25
    && (y as number) >= 0 && (y as number) <= 14 ? { x: x as number, y: y as number } : null;
}

/** Native moving/in-play flags establish possession; occupancy alone never does. */
export function withConfirmedBallChanges(view: SetupState, changes: BallChanges): SetupState {
  const ball = changes.coordinate === undefined ? view.ball : changes.coordinate;
  if (!view.ballState) return { ...view, ball };
  const inPlay = changes.inPlay ?? view.ballState.inPlay, moving = changes.moving ?? view.ballState.moving;
  const carrier = inPlay && !moving && ball ? view.players.find(player => player.x === ball.x && player.y === ball.y) : null;
  if (ball?.x === view.ball?.x && ball?.y === view.ball?.y && inPlay === view.ballState.inPlay
    && moving === view.ballState.moving && (carrier?.id ?? null) === view.ballState.carrierPlayerId) return view;
  return { ...view, ball, ballState: { version: 1, inPlay, moving, carrierPlayerId: carrier?.id ?? null } };
}

/** A confirmed carrier move advances its ball without inferring possession from occupancy. */
export function withConfirmedMove(view: SetupState, move: ConfirmedMove): SetupState {
  const player = view.players.find(player => player.id === move.playerId);
  if (!player || player.x === move.x && player.y === move.y) return view;
  const next = { ...view,
    players: view.players.map(player => player.id === move.playerId ? { ...player, x: move.x, y: move.y } : player),
    ball: view.ball && view.ballState?.carrierPlayerId === move.playerId ? { x: move.x, y: move.y } : view.ball };
  return withConfirmedBallChanges(next, {});
}

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
    const moves: ConfirmedMove[] = [], ballChanges: BallChanges = {};
    for (const value of changes) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const change = value as Record<string, unknown>, id = change.modelChangeId;
      if (id === 'fieldModelSetBallCoordinate') ballChanges.coordinate = nativeSquare(change.modelChangeValue);
      else if (id === 'fieldModelSetBallMoving' && typeof change.modelChangeValue === 'boolean') ballChanges.moving = change.modelChangeValue;
      else if (id === 'fieldModelSetBallInPlay' && typeof change.modelChangeValue === 'boolean') ballChanges.inPlay = change.modelChangeValue;
      else if (id === 'fieldModelSetPlayerCoordinate' && typeof change.modelChangeKey === 'string' && known.has(change.modelChangeKey)) {
        const square = nativeSquare(change.modelChangeValue);
        if (square) moves.push({ playerId: change.modelChangeKey, ...square });
      }
    }
    // A native sync is one atomic board update. Retain each movement square, and
    // apply its ball changes with the last moved player before the playback wait.
    const hasBallChanges = Object.keys(ballChanges).length > 0;
    moves.forEach((move, index) => beats.push({ kind: 'move', move,
      ...(hasBallChanges && index === moves.length - 1 ? { ballChanges } : {}) }));
    if (!moves.length && hasBallChanges) beats.push({ kind: 'ball', ballChanges });
  }
  return beats;
}

export function confirmedMoves(record: TranscriptRecord): ConfirmedMove[] {
  return playbackBeats(record).filter(beat => beat.kind === 'move').map(beat => (beat as { kind: 'move'; move: ConfirmedMove }).move);
}
