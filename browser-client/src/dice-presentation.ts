import type { TranscriptRecord } from './transcript-protocol.ts';

export type DiceMoment = { label: string; faces: string[]; subjectId: string | null; selected: number | null;
  rollKey?: string; rolls?: { label: string; face: string; rollKey?: string }[] };

/** Combine actual d6 reports for one actor's ongoing action; block choices remain discrete. */
export function accumulateDiceMoment(previous: DiceMoment | null, next: DiceMoment): DiceMoment {
  if (next.faces.length !== 1 || !/^[1-6]$/.test(next.faces[0]) || next.selected !== null) return next;
  const roll = { label: next.label, face: next.faces[0], rollKey: next.rollKey };
  if (!previous || previous.subjectId !== next.subjectId || previous.selected !== null
    || !previous.faces.every(face => /^[1-6]$/.test(face))) return { ...next, rolls: [roll] };
  const rolls = [...(previous.rolls ?? previous.faces.map(face => ({ label: previous.label, face, rollKey: previous.rollKey }))), roll];
  return { ...next, label: rolls.map(item => item.label).join('; '), faces: rolls.map(item => item.face), rolls };
}

const blockFaces = ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'];
export function blockFace(roll: number): string | null { return Number.isInteger(roll) && roll >= 1 && roll <= 6 ? blockFaces[roll - 1] : null; }

/** Only values written by native reports become visible dice; no roll is generated in the browser. */
export function reportedDice(report: Record<string, unknown>): DiceMoment | null {
  const id = report.reportId;
  if (typeof id !== 'string') return null;
  const subjectId = typeof report.playerId === 'string' ? report.playerId
    : typeof report.defenderId === 'string' ? report.defenderId : null;
  if ((id === 'blockRoll' || id === 'blockChoice') && Array.isArray(report.blockRoll)) {
    const faces = report.blockRoll.map(value => blockFace(value as number));
    if (!faces.length || faces.some(face => face === null)) return null;
    const selected = id === 'blockChoice' && Number.isInteger(report.diceIndex)
      && (report.diceIndex as number) >= 0 && (report.diceIndex as number) < faces.length ? report.diceIndex as number : null;
    return { label: id === 'blockChoice' ? 'Block die selected' : 'Block dice rolled', faces: faces as string[], subjectId, selected };
  }
  if (typeof report.roll === 'number' && Number.isInteger(report.roll) && report.roll >= 1 && report.roll <= 6) {
    const name = id === 'goForItRoll' ? 'Rush' : id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ Roll$/, '').replace(/^./, letter => letter.toUpperCase());
    const target = typeof report.minimumRoll === 'number' ? ` · ${report.minimumRoll}+ needed` : '';
    const result = typeof report.successful === 'boolean' ? ` · ${report.successful ? 'success' : 'failure'}` : '';
    return { label: `${name}${target}${result}`, faces: [String(report.roll)], subjectId, selected: null };
  }
  return null;
}

export function recordDice(record: TranscriptRecord): DiceMoment[] {
  const moments: DiceMoment[] = [];
  for (const sync of record.native) {
    const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
    if (!Array.isArray(reports)) continue;
    for (const value of reports) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const moment = reportedDice(value as Record<string, unknown>);
      if (moment) moments.push(moment);
    }
  }
  return moments;
}
