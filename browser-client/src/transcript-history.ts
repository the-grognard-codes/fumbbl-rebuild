import type { TranscriptPage, TranscriptRecord } from './transcript-protocol.ts';

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/** Contiguous immutable public history shared by live delivery and recovery reads. */
export class TranscriptHistory {
  private entries: TranscriptRecord[] = [];
  private lastCommand = 0;

  get records(): TranscriptRecord[] { return this.entries; }

  /** A future page requires a catch-up read; duplicate/overlapping pages are safe. */
  accept(page: TranscriptPage): boolean {
    if (page.from > this.entries.length) return false;
    const overlap = Math.max(0, Math.min(page.next, this.entries.length) - page.from);
    for (let index = 0; index < overlap; index++) {
      if (!sameValue(this.entries[page.from + index], page.records[index])) throw Error('Conflicting public history');
    }
    const appended = page.records.slice(overlap);
    let time = this.entries.at(-1)?.at ?? 0, command = this.lastCommand;
    for (const record of appended) {
      if (record.at < time) throw Error('Public history time moved backward');
      time = record.at;
      for (const native of record.native) {
        if (!Number.isSafeInteger(native.commandNr) || Number(native.commandNr) <= command)
          throw Error('Public history commands moved backward');
        command = Number(native.commandNr);
      }
    }
    if (appended.length) this.entries = [...this.entries, ...appended];
    this.lastCommand = command;
    return true;
  }
}
