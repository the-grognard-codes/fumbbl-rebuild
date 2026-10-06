import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hudResources } from '../src/hud-model.ts';
import { matchLogLines } from '../src/match-log.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-reroll-accounting.json', import.meta.url), 'utf8'));

test('all native recipients show the guaranteed total, including conditional Mascot success and failure', () => {
  for (const journey of journeys) {
    const offered = decodeSetupStateValue(journey.offered);
    assert.equal(hudResources(offered, journey.role).find(resource => resource.kind === 'reroll')?.count ?? 0, journey.before);
    for (const [key, spectator] of [['accepted', false], ['otherCoach', false], ['spectator', true]] as const) {
      const view = decodeSetupStateValue(journey[key], spectator);
      assert.equal(hudResources(view, journey.role).find(resource => resource.kind === 'reroll')?.count ?? 0, journey.after);
    }
    if (journey.mode === 'mascot-success') assert.equal(journey.before, journey.after, 'Conditional success does not spend a guaranteed source');
    if (journey.mode === 'mascot-failure-only') assert.equal(journey.after, 0, 'Conditional availability never becomes a guaranteed HUD count');
  }
});

test('the durable log identifies native consumed sources and conditional Mascot fallback', () => {
  for (const journey of journeys) {
    const state = decodeSetupStateValue(journey.accepted);
    const record: TranscriptRecord = { index: state.revision, revision: state.revision, kind: 'ACTION', actor: journey.role,
      at: state.revision, decision: { operation: 'action', actionId: journey.selectedId }, native: [{ commandNr: 1, reportList: { reports: journey.reports } }], state };
    const text = matchLogLines([record]).map(line => line.text).join('\n');
    for (const report of journey.reports) {
      if (report.reportId === 'reRoll') assert.ok(text.toLowerCase().includes(report.reRollSource.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()));
      if (report.reportId === 'mascotUsed') assert.ok(text.includes(`conditional Mascot attempt ${report.roll} vs ${report.minimumRoll}+`));
    }
    if (journey.mode === 'mascot-fallback') assert.ok(text.includes('continued with a guaranteed team source'));
  }
});
