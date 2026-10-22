import type { RoutePreview } from './route-protocol.ts';
import type { SetupState } from './setup-protocol.ts';
import type { ConfirmedMove, PlaybackBeat } from './pitch-playback.ts';

/** A forecast permits presentation only; native commands and outcomes remain authoritative. */
export function provisionalMoves(view: SetupState, route: RoutePreview): ConfirmedMove[] {
  const player = view.players.find(player => player.id === route.playerId);
  // Route forecasts describe square entry, not activation rolls (for example
  // Bone Head). Wait for authoritative activation before predicting any travel.
  if (view.phase !== 'PLAY' || view.prompt || view.reaction || view.callerRole === 'spectator'
    || view.activePlayerId !== route.playerId
    || view.callerRole !== view.actor || route.actor !== view.callerRole || route.revision !== view.revision
    || route.routeVersion < 3 || !player || player.role !== view.callerRole
    || player.x !== route.from.x || player.y !== route.from.y
    || /prone|stunned|knocked|rooted/i.test(player.state)) return [];
  const moves: ConfirmedMove[] = [];
  let previous = route.from;
  for (const step of route.steps) {
    if (step.dodge || step.rush || step.reactions.length || !step.checks || step.checks.length
      || Math.max(Math.abs(step.x - previous.x), Math.abs(step.y - previous.y)) !== 1
      || view.players.some(other => other.id !== player.id && other.x === step.x && other.y === step.y)) break;
    moves.push({ playerId: player.id, x: step.x, y: step.y });
    previous = step;
  }
  return moves;
}

/** Match the actually displayed prefix, retaining every non-movement event. Never guess across divergence. */
export function remainingConfirmedBeats(beats: PlaybackBeat[], shown: ConfirmedMove[]): PlaybackBeat[] | null {
  if (!shown.length) return beats;
  const remaining: PlaybackBeat[] = [];
  let consumed = 0;
  let prefixBall: Extract<PlaybackBeat, { kind: 'ball' }>['ballChanges'] = {};
  for (const beat of beats) {
    if (beat.kind === 'move' && beat.move.playerId === shown[0].playerId && consumed < shown.length) {
      const expected = shown[consumed];
      if (beat.move.x !== expected.x || beat.move.y !== expected.y) return null;
      consumed += 1;
      if (beat.ballChanges) prefixBall = { ...prefixBall, ...beat.ballChanges };
      // The displayed carrier already traversed this prefix. Reconcile its final
      // ball state once, rather than replaying earlier squares beneath it.
      if (consumed === shown.length && Object.keys(prefixBall).length) remaining.push({ kind: 'ball', ballChanges: prefixBall });
    } else if (beat.kind === 'ball' && consumed < shown.length) {
      prefixBall = { ...prefixBall, ...beat.ballChanges };
    } else remaining.push(beat);
  }
  return consumed === shown.length ? remaining : null;
}

/** Keep ordinary steps readable, but bound a queued route's presentation lag. Replay keeps its selected speed. */
export function movementBeatMillis(remainingMoves: number, speed: number, mode: 'live' | 'replay', reduced: boolean): number {
  if (reduced) return 16;
  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return mode === 'replay' ? 140 / rate : Math.max(40, Math.min(140, 600 / Math.max(1, remainingMoves))) / rate;
}
