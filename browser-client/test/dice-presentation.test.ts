import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockFace, reportedDice } from '../src/dice-presentation.ts';

test('block graphics use the native six-face mapping and selected die index', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(blockFace), ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW']);
  assert.deepEqual(reportedDice({ reportId: 'blockChoice', blockRoll: [1, 5], diceIndex: 1, defenderId: 'target' }), {
    label: 'Block die selected', faces: ['SKULL', 'POW/PUSH'], subjectId: 'target', selected: 1
  });
});

test('ordinary dice display the recorded raw roll and target', () => {
  assert.deepEqual(reportedDice({ reportId: 'goForItRoll', roll: 3, minimumRoll: 2, successful: true, playerId: 'runner' }), {
    label: 'Rush · 2+ needed · success', faces: ['3'], subjectId: 'runner', selected: null
  });
  assert.equal(reportedDice({ reportId: 'goForItRoll', roll: 7 }), null);
});
