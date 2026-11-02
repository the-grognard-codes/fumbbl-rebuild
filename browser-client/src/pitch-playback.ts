import type { TranscriptRecord } from './transcript-protocol.ts';
import { reportedDice } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';
import { decodeBlockContext, currentBlockContext } from './block-context.ts';
import type { BlockContext } from './block-context.ts';
import { syncAnnouncements } from './match-announcements.ts';
import type { MatchAnnouncement } from './match-announcements.ts';
import type { SetupPlayer } from './setup-protocol.ts';

export type ConfirmedMove = { playerId: string; x: number; y: number };
type BallChanges = { coordinate?: { x: number; y: number } | null; inPlay?: boolean; moving?: boolean };
export type PlaybackBeat = { kind: 'move'; move: ConfirmedMove; ballChanges?: BallChanges }
  | { kind: 'ball'; ballChanges: BallChanges } | { kind: 'dice'; dice: DiceMoment }
  | { kind: 'block'; context: BlockContext | null }
  | { kind: 'player'; playerId: string; changes: Partial<SetupPlayer> }
  | { kind: 'announcement'; announcement: MatchAnnouncement };

/** Preserve native injury/removal resolution before a transition, without exposing the next setup snapshot. */
export function withConfirmedPlayerChanges(view: SetupState, playerId: string, changes: Partial<SetupPlayer>): SetupState {
  return { ...view, players: view.players.map(player => player.id === playerId ? { ...player, ...changes } : player) };
}

function nativePlayerState(value: unknown): Partial<SetupPlayer> | null {
  if (!Number.isSafeInteger(value)) return null;
  const base = Number(value) & 255;
  // PlayerState.getDescription is also the renderer's pose contract.
  const states: Record<number, [string, string]> = { 1: ['Standing', 'is standing'], 2: ['Moving', 'is moving'],
    3: ['Prone', 'is prone'], 4: ['Stunned', 'has been stunned'], 5: ['Knocked out', 'has been knocked out'],
    6: ['Badly hurt', 'has been badly hurt'], 7: ['Seriously injured', 'has been seriously injured'],
    8: ['Dead', 'has been killed'], 9: ['Reserve', 'is in reserve'], 11: ['Falling', 'is about to fall down'],
    12: ['Blocked', 'is being blocked'], 13: ['Sent off', 'is banned from the game'],
    14: ['Exhausted', 'is exhausted'], 16: ['Picked up', 'has been picked up'], 21: ['In the air', 'is in the air'] };
  const projected = states[base];
  return projected ? { status: projected[0], state: projected[1], offPitch: 'pitch',
    ...([5, 6, 7, 8, 9, 13].includes(base) ? { x: null, y: null,
      offPitch: base === 5 ? 'knockedOut' : base === 9 ? 'reserve' : base === 13 ? 'sentOff' : 'casualty' } as const : {}) } : null;
}

export function withBlockContext(view: SetupState, context: BlockContext | null): SetupState {
  if (JSON.stringify(view.blockContext ?? null) === JSON.stringify(context)) return view;
  const next = { ...view }; delete next.blockContext;
  if (context) next.blockContext = context;
  return next;
}

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
  if (!player || player.x === move.x && player.y === move.y && (!player.offPitch || player.offPitch === 'pitch')) return view;
  const next = { ...view,
    players: view.players.map(player => player.id === move.playerId ? { ...player, x: move.x, y: move.y, offPitch: 'pitch' as const } : player),
    ball: view.ball && view.ballState?.carrierPlayerId === move.playerId ? { x: move.x, y: move.y } : view.ball };
  return withBlockContext(withConfirmedBallChanges(next, {}), currentBlockContext(next));
}

/** The native sync stream is ordered by command number inside each durable decision. */
export function playbackBeats(record: TranscriptRecord, initialBall?: { x: number; y: number } | null): PlaybackBeat[] {
  const beats: PlaybackBeat[] = [];
  let previousDice: DiceMoment | null = null;
  let knownBall = initialBall;
  const known = new Set(record.state.players.map(player => player.id));
  for (const sync of record.native) {
    const announcements = () => syncAnnouncements(record, sync).forEach(announcement => beats.push({ kind: 'announcement', announcement }));
    const hasBlock = Object.hasOwn(sync, 'blockContext');
    const context = hasBlock && sync.blockContext !== null ? decodeBlockContext(sync.blockContext, record.state.players) : null;
    if (hasBlock) beats.push({ kind: 'block', context });
    const reportStart = beats.length;
    const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
    if (Array.isArray(reports)) for (const value of reports) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const dice = reportedDice(value as Record<string, unknown>, record.state.players);
      if (dice) {
        // Native partial rerolls are followed by a full-pool decision report.
        // It confirms the same result, rather than rolling the untouched dice.
        const echo = dice.reportId === 'blockRoll' && previousDice?.rerolledIndexes
          && (!dice.subjectId || dice.subjectId === previousDice.defenderId)
          && dice.faces.length === previousDice.faces.length
          && dice.faces.every((face, index) => face === previousDice!.faces[index]);
        if (echo && previousDice) {
          if (dice.chooser !== undefined) previousDice.chooser = dice.chooser;
          if (dice.uphill !== undefined) previousDice.uphill = dice.uphill;
          previousDice = null;
        } else {
          previousDice = hasBlock ? { ...dice, blockContext: context } : dice;
          beats.push({ kind: 'dice', dice: previousDice });
        }
      }
    }
    const changes = (sync.modelChangeList as { modelChangeArray?: unknown[] } | undefined)?.modelChangeArray;
    if (!Array.isArray(changes)) { announcements(); continue; }
    const moves: ConfirmedMove[] = [], ballSteps: BallChanges[] = [];
    const playerChanges: PlaybackBeat[] = [];
    let ballChanges: BallChanges = {};
    for (const value of changes) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const change = value as Record<string, unknown>, id = change.modelChangeId;
      if (id === 'fieldModelSetBallCoordinate') {
        if (ballChanges.coordinate !== undefined) ballSteps.push(ballChanges);
        ballChanges = { ...ballChanges, coordinate: nativeSquare(change.modelChangeValue) };
      }
      else if (id === 'fieldModelSetBallMoving' && typeof change.modelChangeValue === 'boolean') ballChanges.moving = change.modelChangeValue;
      else if (id === 'fieldModelSetBallInPlay' && typeof change.modelChangeValue === 'boolean') ballChanges.inPlay = change.modelChangeValue;
      else if (id === 'fieldModelSetPlayerState' && typeof change.modelChangeKey === 'string' && known.has(change.modelChangeKey)) {
        const patch = nativePlayerState(change.modelChangeValue);
        if (patch) playerChanges.push({ kind: 'player', playerId: change.modelChangeKey, changes: patch });
      }
      else if (id === 'fieldModelSetPlayerCoordinate' && typeof change.modelChangeKey === 'string' && known.has(change.modelChangeKey)) {
        const square = nativeSquare(change.modelChangeValue);
        if (square) {
          const move = { playerId: change.modelChangeKey, ...square };
          moves.push(move); playerChanges.push({ kind: 'move', move });
        }
        else playerChanges.push({ kind: 'player', playerId: change.modelChangeKey, changes: { x: null, y: null } });
      }
    }
    // A native sync is one atomic board update. Retain each movement square, and
    // apply its ball changes with the last moved player before the playback wait.
    const hasBallChanges = Object.keys(ballChanges).length > 0;
    // Native three-way scatters publish directions and just the final square.
    // Expand only a fully reported, in-bounds path that reaches that endpoint.
    const scatter = Array.isArray(reports) && reports.length === 1 ? reports[0] as Record<string, unknown> : null;
    const path = !moves.length && !ballSteps.length && scatter?.reportId === 'scatterBall'
      ? reportedScatterPath(knownBall, ballChanges.coordinate, scatter) : null;
    if (ballChanges.coordinate !== undefined) knownBall = ballChanges.coordinate;
    if (path && scatter) {
      beats.splice(reportStart);
      path.forEach((coordinate, index) => {
        const dice = reportedDice({ ...scatter, rolls: [(scatter.rolls as number[])[index]] }, record.state.players);
        if (dice) beats.push({ kind: 'dice', dice });
        beats.push({ kind: 'ball', ballChanges: { ...ballChanges, coordinate,
          moving: index === path.length - 1 ? ballChanges.moving ?? true : true } });
      });
      beats.push(...playerChanges); announcements();
      continue;
    }
    // Carrier travel already advances the ball at each player square; splitting
    // its atomic ball updates ahead of those moves would briefly detach it.
    if (!moves.length) ballSteps.forEach(changes => beats.push({ kind: 'ball', ballChanges: changes }));
    // Keep native removal, injury and re-placement order, including multiple updates to one player.
    playerChanges.forEach(beat => beats.push(beat.kind === 'move' && hasBallChanges && beat.move === moves.at(-1)
      ? { ...beat, ballChanges } : beat));
    if (!moves.length && hasBallChanges) beats.push({ kind: 'ball', ballChanges });
    announcements();
  }
  return beats;
}

function reportedScatterPath(start: { x: number; y: number } | null | undefined,
  end: { x: number; y: number } | null | undefined, report: Record<string, unknown>): { x: number; y: number }[] | null {
  if (!start || !end || !Array.isArray(report.directionArray) || !Array.isArray(report.rolls)
    || report.directionArray.length !== report.rolls.length || !report.rolls.length
    || !report.rolls.every(roll => Number.isInteger(roll) && roll >= 1 && roll <= 8)) return null;
  const offsets: Record<string, [number, number]> = { North: [0, -1], Northeast: [1, -1], East: [1, 0],
    Southeast: [1, 1], South: [0, 1], Southwest: [-1, 1], West: [-1, 0], Northwest: [-1, -1] };
  const path: { x: number; y: number }[] = [];
  let previous = start;
  for (const direction of report.directionArray) {
    const offset = typeof direction === 'string' && Object.hasOwn(offsets, direction) ? offsets[direction] : null;
    if (!offset) return null;
    const square = nativeSquare({ x: previous.x + offset[0], y: previous.y + offset[1] });
    if (!square) return null;
    path.push(square); previous = square;
  }
  return previous.x === end.x && previous.y === end.y ? path : null;
}

export function confirmedMoves(record: TranscriptRecord): ConfirmedMove[] {
  return playbackBeats(record).filter(beat => beat.kind === 'move').map(beat => (beat as { kind: 'move'; move: ConfirmedMove }).move);
}
