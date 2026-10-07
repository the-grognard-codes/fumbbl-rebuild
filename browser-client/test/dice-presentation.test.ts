import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accumulateDiceMoment, blockFace, reportedDice } from '../src/dice-presentation.ts';

test('block graphics use the native six-face mapping and selected die index', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(blockFace), ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW']);
  assert.deepEqual(reportedDice({ reportId: 'blockChoice', blockRoll: [1, 5], diceIndex: 1, defenderId: 'target' }), {
    label: 'Block die selected', faces: ['SKULL', 'POW/PUSH'], subjectId: 'target', selected: 1
  });
});

test('successful d6 rolls in one action remain individually identified in order', () => {
  const rolls = [5, 4, 6, 2].map((roll, index) => reportedDice({
    reportId: index === 3 ? 'goForItRoll' : 'dodgeRoll', roll, successful: true, playerId: 'runner'
  })!);
  const sequence = rolls.reduce((prior, roll) => accumulateDiceMoment(prior, roll), null as typeof rolls[number] | null);
  assert.deepEqual(sequence?.faces, ['5', '4', '6', '2']);
  assert.deepEqual(sequence?.rolls?.map(item => item.label), ['Dodge · success', 'Dodge · success', 'Dodge · success', 'Rush · success']);
  assert.deepEqual(accumulateDiceMoment(sequence, reportedDice({ reportId: 'dodgeRoll', roll: 3, successful: true, playerId: 'other' })!)?.faces, ['3']);
});

test('ordinary dice display the recorded raw roll and target', () => {
  assert.deepEqual(reportedDice({ reportId: 'goForItRoll', roll: 3, minimumRoll: 2, successful: true, playerId: 'runner' }), {
    label: 'Rush · 2+ needed · success', faces: ['3'], subjectId: 'runner', selected: null
  });
  assert.equal(reportedDice({ reportId: 'goForItRoll', roll: 7 }), null);
});
