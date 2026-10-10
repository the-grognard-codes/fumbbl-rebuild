import type { MovementRange, MovementRangeResponse } from './movement-protocol.ts';
import type { SetupState } from './setup-protocol.ts';

export function matchesMovementRange(range: MovementRange | null, view: SetupState, playerId: string): boolean {
  const player = view.players.find(player => player.id === playerId);
  return !!range && range.playerId === playerId && range.revision === view.revision
    && player?.x === range.from.x && player.y === range.from.y;
}

/** Correlates a disposable read, independently of retained movement commands. */
export class MovementRangeRead {
  private request: { id: string; matchId: string; revision: number; playerId: string } | null = null;
  private issued = new Set<string>();

  begin(id: string, view: SetupState, playerId: string) {
    this.request = { id, matchId: view.matchId, revision: view.revision, playerId };
    this.issued.add(id);
  }

  clear() { this.request = null; }
  reset() { this.clear(); this.issued.clear(); }

  isRead(id: string | null | undefined) { return typeof id === 'string' && this.issued.has(id); }

  finish(id: string) {
    this.issued.delete(id);
    if (this.expects(id)) this.clear();
  }

  invalidate(view: SetupState) {
    if (this.request?.matchId !== view.matchId || this.request.revision !== view.revision) this.clear();
  }

  expects(id: string | null | undefined) { return !!this.request && this.request.id === id; }

  accept(response: Pick<MovementRangeResponse, 'requestId' | 'matchId' | 'range'>, view: SetupState | null): MovementRange | null {
    const request = this.request;
    this.finish(response.requestId);
    if (!request || response.requestId !== request.id) return null;
    return view && response.matchId === request.matchId && view.matchId === request.matchId
      && response.range.revision === request.revision && matchesMovementRange(response.range, view, request.playerId)
      ? response.range : null;
  }
}
