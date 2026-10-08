import type { MatchDecision } from './match-decision.ts';
import { blockFace } from './dice-presentation.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

/** Keep actual block outcomes separate from the current native Pro test report. */
export function withProTest(decision: MatchDecision | null, records: TranscriptRecord[], revision: number): MatchDecision | null {
  if (!decision || !['rerollDie', 'proTestReroll', 'blockDie'].includes(decision.kind)) return decision;
  const reports = (record: TranscriptRecord) => record.native.flatMap(sync =>
    (sync.reportList as { reports?: Record<string, unknown>[] } | undefined)?.reports ?? []);
  const current = records.find(record => record.revision === revision);
  const pro = current && reports(current).filter(report => report.reportId === 'reRoll'
    && String(report.reRollSource).toLowerCase() === 'pro').at(-1);
  if (!pro || !Number.isInteger(pro.roll) || Number(pro.roll) < 1 || Number(pro.roll) > 6 || typeof pro.successful !== 'boolean') return decision;
  let originalFaces: string[] | undefined;
  let originalLabel: string | undefined;
  if (decision.kind === 'proTestReroll') {
    const block = decision.options.some(option => option.id.includes(':block-pro-test:'));
    for (let index = records.length - 1; index >= 0; index--) {
      if (records[index].revision > revision) continue;
      const original = reports(records[index]).filter(report => block ? report.reportId === 'blockRoll'
        : report.reportId !== 'reRoll' && String(report.reportId).endsWith('Roll') && Number.isInteger(report.roll)).at(-1);
      if (!original) continue;
      if (block && Array.isArray(original.blockRoll)) {
        const faces = original.blockRoll.map(value => blockFace(Number(value)));
        if (faces.every(face => face !== null)) originalFaces = faces as string[];
      } else if (!block && Number(original.roll) >= 1 && Number(original.roll) <= 6) {
        originalFaces = [String(original.roll)]; originalLabel = 'Original action roll';
      }
      break;
    }
  }
  return { ...decision, originalFaces, originalLabel, proTest: { face: String(pro.roll), successful: pro.successful } };
}
