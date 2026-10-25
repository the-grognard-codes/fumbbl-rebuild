import { blockFaceLabel } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { SetupState } from './setup-protocol.ts';

/** Presentation history for one Multiple Block activation; native reports remain untouched. */
export class MultipleBlockDiceReveals {
  private scope = '';
  private active = false;
  private firstRevision = 0;
  private lastRevision = Infinity;
  private finishingScope = '';
  private attacker: string | null = null;
  private revealed = new Map<string, Set<string>>();

  reset() { this.scope = ''; this.active = false; this.revealed.clear(); }

  update(view: SetupState) {
    const active = view.activePlayerAction === 'multipleBlock';
    const scope = this.identity(view);
    if (active && (!this.active || scope !== this.scope)) {
      this.scope = scope;
      this.revealed.clear();
      this.firstRevision = view.revision;
      this.lastRevision = Infinity;
      this.finishingScope = '';
      this.attacker = view.activePlayerId;
    } else if (!active && this.active) {
      // The finishing revision can contain deferred reports from this activation.
      this.lastRevision = view.revision;
      this.finishingScope = this.identity(view, this.attacker);
    }
    this.active = active;
  }

  allows(moment: DiceMoment, view: SetupState): boolean {
    // Choice reports are emitted again during native injury/push resolution.
    // Suppress only a selection echo of an outcome already revealed here.
    return moment.selected === null || !this.matches(moment, view)
      || !this.revealed.get(moment.subjectId!)?.has(JSON.stringify(moment.faces));
  }

  remember(moment: DiceMoment, view: SetupState) {
    if (moment.selected !== null || !this.matches(moment, view)) return;
    const faces = this.revealed.get(moment.subjectId!) ?? new Set<string>();
    faces.add(JSON.stringify(moment.faces));
    this.revealed.set(moment.subjectId!, faces);
  }

  private matches(moment: DiceMoment, view: SetupState): boolean {
    const identity = this.identity(view, moment.blockContext?.blocks[0]?.playerId ?? view.activePlayerId);
    return !!this.scope && !!moment.subjectId && moment.faces.length > 0 && moment.faces.every(face => blockFaceLabel(face))
      && view.revision >= this.firstRevision && view.revision <= this.lastRevision
      && (identity === this.scope || view.revision === this.lastRevision && identity === this.finishingScope)
      && (view.activePlayerAction === 'multipleBlock' || !view.activePlayerAction && !!moment.blockContext);
  }

  private identity(view: SetupState, attacker = view.activePlayerId): string {
    return [view.matchId, view.half, view.drive, view.homeTurn, view.awayTurn, attacker].join(':');
  }
}
