import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PeriodDecisionCounts } from './period-decision-counts.mjs';

test('period accounting keeps reacting coaches and selection/movement in their original period', () => {
  const counts = new PeriodDecisionCounts();
  const turn = { phase: 'PLAY', half: 1, drive: 1, homeTurn: 1, awayTurn: 0 };
  counts.accept({ ...turn, actor: 'home' });
  counts.accept({ ...turn, actor: 'away' });
  counts.accept({ ...turn, homeTurn: 2 });
  counts.accept({ ...turn, phase: 'SETUP' });
  for (const stage of ['selection', 'movement']) counts.accept({ ...turn, kickoff: { event: 'SOLID_DEFENCE', stage } });
  counts.accept({ ...turn, drive: 2, kickoff: { event: 'SOLID_DEFENCE', stage: 'selection' } });
  assert.deepEqual(counts.summary(), { maximumTurn: 2, maximumKickoff: 2,
    turns: { '1:1:1:0': 2, '1:1:2:0': 1 }, kickoffs: { '1:1:SOLID_DEFENCE': 2, '1:2:SOLID_DEFENCE': 1 } });
});
