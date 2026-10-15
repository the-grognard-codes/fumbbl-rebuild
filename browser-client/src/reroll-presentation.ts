import type { MatchDecision } from './match-decision.ts';
import { blockFace, reportedDice } from './dice-presentation.ts';
import type { PresentedRoll } from './dice-presentation.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

/** Keep actual block outcomes separate from the current native Pro test report. */
export function withProTest(decision: MatchDecision | null, records: TranscriptRecord[], revision: number): MatchDecision | null {
  if (!decision || !['rerollDie', 'proTestReroll', 'blockDie', 'reroll', 'skill'].includes(decision.kind)) return decision;
  const reports = (record: TranscriptRecord) => record.native.flatMap(sync =>
    (sync.reportList as { reports?: Record<string, unknown>[] } | undefined)?.reports ?? []);
  const current = records.find(record => record.revision === revision);
  const currentReports = current ? reports(current) : [];
  const proIndex = currentReports.map(report => report.reportId === 'reRoll'
    && String(report.reRollSource).toLowerCase() === 'pro').lastIndexOf(true);
  const pro = currentReports[proIndex];
  if (!pro || !Number.isInteger(pro.roll) || Number(pro.roll) < 1 || Number(pro.roll) > 6 || typeof pro.successful !== 'boolean') return decision;
  if (['reroll', 'skill'].includes(decision.kind)
    && currentReports.slice(proIndex + 1).some(report => report.reportId !== 'reRoll' && reportedDice(report))) return decision;
  let originalFaces: string[] | undefined;
  let originalLabel: string | undefined;
  let originalRolls: PresentedRoll[] | undefined;
  let uphill: boolean | undefined;
  {
    const block = decision.options.some(option => option.id.includes(':block-') || option.dieKind === 'block');
    for (let index = records.length - 1; index >= 0; index--) {
      if (records[index].revision > revision) continue;
      const original = reports(records[index]).filter(report => block ? report.reportId === 'blockRoll'
        : report.reportId !== 'reRoll' && reportedDice(report)?.faces.length === 1
          && reportedDice(report)?.rolls?.[0]?.kind === 'd6').at(-1);
      if (!original) continue;
      if (block && Array.isArray(original.blockRoll)) {
        const faces = original.blockRoll.map(value => blockFace(Number(value)));
        if (faces.every(face => face !== null)) originalFaces = faces as string[];
        uphill = reportedDice(original, records[index].state.players)?.uphill;
      } else if (!block) {
        const moment = reportedDice(original, records[index].state.players);
        originalFaces = moment?.faces; originalRolls = moment?.rolls; originalLabel = 'Original action roll';
      }
      break;
    }
  }
  return { ...decision, originalFaces, originalRolls, originalLabel, ...(uphill !== undefined ? { uphill } : {}),
    proTest: { face: String(pro.roll), successful: pro.successful, rollKey: `${revision}:pro` } };
}
