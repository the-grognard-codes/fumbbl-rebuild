import type { MovementRange, MovementRangeResponse } from './movement-protocol.ts';
import type { SetupState } from './setup-protocol.ts';

export function matchesMovementRange(range: MovementRange | null, view: SetupState, playerId: string): boolean {
  const player = view.players.find(player => player.id === playerId);
  return !!range && range.playerId === playerId && range.revision === view.revision
    && player?.x === range.from.x && player.y === range.from.y;
}

type RangeSelection = { matchId: string; revision: number; playerId: string };

/** Keep one wire read and replace unsent selections while the ordered server is busy. */
export class MovementRangeQueue {
  private active: { id: string; selection: RangeSelection } | null = null;
  private next: RangeSelection | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: () => SetupState | null;
  private send: (view: SetupState, playerId: string) => string | null;

  constructor(current: () => SetupState | null, send: (view: SetupState, playerId: string) => string | null) {
    this.current = current;
    this.send = send;
  }

  select(view: SetupState | null, playerId: string | null) {
    const selection = view && playerId ? { matchId: view.matchId, revision: view.revision, playerId } : null;
    this.next = selection && !this.same(selection, this.active?.selection) ? selection : null;
    this.schedule();
  }

  finish(id: string) {
    if (this.active?.id !== id) return;
    this.active = null;
    this.schedule();
  }

  invalidate(view: SetupState) {
    if (this.next && (this.next.matchId !== view.matchId || this.next.revision !== view.revision)) this.next = null;
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.active = null; this.next = null;
  }

  private same(left: RangeSelection, right: RangeSelection | undefined) {
    return !!right && left.matchId === right.matchId && left.revision === right.revision && left.playerId === right.playerId;
  }

  private schedule() {
    if (this.active || this.timer || !this.next) return;
    // Let the current React commit and any automatic action invalidate guidance
    // before putting another disposable read on the wire.
    this.timer = setTimeout(() => {
      this.timer = null;
      const selection = this.next;
      this.next = null;
      const view = this.current();
      if (!selection || !view || view.matchId !== selection.matchId || view.revision !== selection.revision) return;
      const id = this.send(view, selection.playerId);
      if (id) this.active = { id, selection };
    }, 0);
  }
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
