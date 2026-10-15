import { diceRollGroups } from './dice-presentation.ts';
import type { DiceMoment, DiceRollGroup } from './dice-presentation.ts';

export const DICE_RETENTION_MS = 1200;
export const DICE_GROUP_INTERVAL_MS = 350;

/** Decorative time is independent of authoritative movement and required choices. */
export class DiceStream {
  private sequence: string | null = null;
  private pending: DiceRollGroup[] = [];
  private visible: { group: DiceRollGroup; expires: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextAt = 0;
  private serial = 0;
  private pinned = false;
  private readonly present: (moment: DiceMoment | null) => void;

  constructor(present: (moment: DiceMoment | null) => void) { this.present = present; }

  clear() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null; this.sequence = null; this.pending = []; this.visible = [];
    this.nextAt = 0; this.pinned = false;
    this.present(null);
  }

  enqueue(moment: DiceMoment, sequence: string, pinned = false, snapshot = false) {
    if (this.sequence !== sequence || pinned || this.pinned || snapshot) this.clear();
    this.sequence = sequence; this.pinned = pinned;
    const groups = diceRollGroups(moment).map(group => ({ ...group, key: `roll:${++this.serial}` }));
    if (pinned || snapshot) {
      this.visible = groups.map(group => ({ group, expires: pinned ? Infinity : Date.now() + DICE_RETENTION_MS }));
    } else this.pending.push(...groups);
    this.advance();
  }

  private advance = () => {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const now = Date.now();
    this.visible = this.visible.filter(item => item.expires > now);
    if (this.pending.length && now >= this.nextAt) {
      this.visible.push({ group: this.pending.shift()!, expires: now + DICE_RETENTION_MS });
      this.nextAt = now + DICE_GROUP_INTERVAL_MS;
    }
    const groups = this.visible.map(item => item.group);
    const last = groups.at(-1);
    this.present(last ? { ...last, groups, label: groups.map(group => group.label).join('; '),
      faces: groups.flatMap(group => group.faces), rolls: groups.flatMap(group => group.rolls
        ?? group.faces.map(face => ({ label: group.label, face, rollKey: group.rollKey }))) } : null);
    const next = Math.min(this.pending.length ? this.nextAt : Infinity, ...this.visible.map(item => item.expires));
    if (Number.isFinite(next)) this.timer = setTimeout(this.advance, Math.max(0, next - now));
  };
}
