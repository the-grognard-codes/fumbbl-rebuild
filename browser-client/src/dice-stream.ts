import { diceRollGroups } from './dice-presentation.ts';
import type { DiceMoment, DiceRollGroup } from './dice-presentation.ts';
import { DICE_GROUP_INTERVAL_MS, DICE_ENTRANCE_MS, DICE_EXIT_MS, DICE_RETENTION_MS, EMPHASIZED_DICE_RETENTION_MS } from './presentation-timing.ts';

export { DICE_GROUP_INTERVAL_MS } from './presentation-timing.ts';

export { DICE_RETENTION_MS } from './presentation-timing.ts';

/** Retain revealed groups independently; ordered playback owns when each roll is eligible. */
export class DiceStream {
  private sequence: string | null = null;
  private pending: DiceRollGroup[] = [];
  private visible: { group: DiceRollGroup; exits: number; removes: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextAt = 0;
  private serial = 0;
  private pinned = false;
  private snapshot = false;
  private interval = DICE_GROUP_INTERVAL_MS;
  private readonly present: (moment: DiceMoment | null) => void;

  constructor(present: (moment: DiceMoment | null) => void) { this.present = present; }

  clear() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null; this.sequence = null; this.pending = []; this.visible = [];
    this.nextAt = 0; this.pinned = false; this.snapshot = false;
    this.present(null);
  }

  /** A resolved choice or a different action evaporates old dice without retaining input. */
  release() {
    const now = Date.now();
    this.pending = []; this.nextAt = 0; this.pinned = false; this.snapshot = false;
    this.visible = this.visible.filter(item => !item.group.static).map(item => item.group.exiting ? item : {
      group: { ...item.group, exiting: true }, exits: now, removes: now + DICE_EXIT_MS / (item.group.rate ?? 1),
    });
    this.advance();
  }

  enqueue(moment: DiceMoment, sequence: string, pinned = false, snapshot = false, rate = 1, reduced = false) {
    rate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    if (snapshot || this.snapshot) this.clear();
    else if (this.sequence !== sequence || pinned || this.pinned) this.release();
    this.sequence = sequence; this.pinned = pinned;
    this.snapshot = snapshot;
    this.interval = DICE_GROUP_INTERVAL_MS / rate;
    const groups = diceRollGroups(moment).map(group => ({ ...group, key: `roll:${++this.serial}`, rate,
      static: snapshot || reduced, rollKey: snapshot || reduced ? undefined : group.rollKey }));
    if (pinned || snapshot) {
      this.visible.push(...groups.map(group => ({ group, exits: Infinity, removes: Infinity })));
    } else this.pending.push(...groups);
    this.advance();
  }

  private advance = () => {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const now = Date.now();
    this.visible = this.visible.filter(item => item.removes > now).map(item => now >= item.exits && !item.group.exiting
      ? { ...item, group: { ...item.group, exiting: true } } : item);
    if (this.pending.length && now >= this.nextAt) {
      const group = this.pending.shift()!;
      const rate = group.rate ?? 1;
      const exits = now + ((group.static ? 0 : DICE_ENTRANCE_MS)
        + (group.emphasized ? EMPHASIZED_DICE_RETENTION_MS : DICE_RETENTION_MS)) / rate;
      this.visible.push({ group, exits, removes: exits + (group.static ? 0 : DICE_EXIT_MS / rate) });
      this.nextAt = now + this.interval;
    }
    const groups = this.visible.map(item => item.group);
    const last = groups.at(-1);
    this.present(last ? { ...last, groups, label: groups.map(group => group.label).join('; '),
      faces: groups.flatMap(group => group.faces), rolls: groups.flatMap(group => group.rolls
        ?? group.faces.map(face => ({ label: group.label, face, rollKey: group.rollKey }))) } : null);
    const next = Math.min(this.pending.length ? this.nextAt : Infinity,
      ...this.visible.map(item => item.group.exiting ? item.removes : item.exits));
    if (Number.isFinite(next)) this.timer = setTimeout(this.advance, Math.max(0, next - now));
  };
}
