import type { PlayerFacing } from './player-art.ts';
import type { SetupState } from './setup-protocol.ts';

const directions: PlayerFacing[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export type PlayerFacings = Record<string, PlayerFacing>;

/** Canonical directions; the art resolver applies the viewing coach's rotation. */
export function updatePlayerFacings(current: PlayerFacings, previous: SetupState | null, view: SetupState): PlayerFacings {
  if (!previous || previous.matchId !== view.matchId || view.revision < previous.revision
    || view.drive !== previous.drive || view.half !== previous.half
    || view.phase === 'SETUP' || view.phase === 'READY_FOR_KICKOFF'
    || view.phase === 'PLAY' && previous.phase !== 'PLAY'
    || view.turnMode === 'REGULAR' && (['KICKOFF', 'SOLID_DEFENCE', 'HIGH_KICK', 'QUICK_SNAP', 'TOUCHBACK'].includes(previous.turnMode)
      || previous.kickoff || previous.driveTracker?.phase === 'KICKOFF')) return {};
  const old = new Map(previous.players.map(player => [player.id, player]));
  const changes: PlayerFacings = {};
  for (const player of view.players) {
    const before = old.get(player.id);
    if (before?.x == null || before.y == null || player.x == null || player.y == null) continue;
    const dx = player.x - before.x, dy = player.y - before.y;
    if (dx || dy) changes[player.id] = directions[(Math.round(Math.atan2(dy, dx) * 4 / Math.PI) + 8) % 8];
  }
  return Object.keys(changes).length ? { ...current, ...changes } : current;
}
