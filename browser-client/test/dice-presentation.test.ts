import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockFace, numericRolls, reportedDice } from '../src/dice-presentation.ts';

test('block graphics use the native six-face mapping and selected die index', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(blockFace), ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW']);
  assert.deepEqual(reportedDice({ reportId: 'blockChoice', blockRoll: [1, 5], diceIndex: 1, defenderId: 'target' }), {
    label: 'Block die selected', faces: ['SKULL', 'POW/PUSH'], subjectId: 'target', selected: 1
  });
});

test('ordinary dice display the recorded raw roll and target', () => {
  assert.deepEqual(reportedDice({ reportId: 'goForItRoll', roll: 3, minimumRoll: 2, successful: true, playerId: 'runner' }), {
    label: 'Rush · 2+ needed · success', faces: ['3'], subjectId: 'runner', selected: null,
    rolls: [{ kind: 'd6', face: '3', label: 'Rush · 2+ needed · success' }]
  });
  assert.equal(reportedDice({ reportId: 'goForItRoll', roll: 7 }), null);
});

test('low D8 and D16 values retain native types and group order instead of becoming D6', () => {
  const report = { reportId: 'injury', defenderId: 'target', numericDice: { version: 1, dice: [
    { sides: 8, value: 2, label: 'Legacy casualty' }, { sides: 16, value: 3, label: 'Casualty' },
    { sides: 6, value: 5, label: 'Casualty' }] } };
  const moment = reportedDice(report)!;
  assert.deepEqual(moment.faces, ['2', '3', '5']);
  assert.deepEqual(moment.rolls?.map(roll => roll.kind), ['d8', 'd16', 'd6']);
});

test('untyped totals, unsupported dice and invalid native metadata never become guessed faces', () => {
  for (const report of [{ reportId: 'injury', casualtyRoll: [3, 2] }, { reportId: 'prayerRoll', roll: 3 },
    { reportId: 'solidDefenceRoll', roll: 3 }, { reportId: 'unknownRoll', roll: 3 }, { reportId: 'injury', injuryRoll: 8 }]) {
    assert.equal(reportedDice(report), null);
  }
  for (const [sides, value] of [[3, 2], [8, 9], [16, 17], [6, 0], [16, 1.5]]) {
    assert.equal(numericRolls({ version: 1, dice: [{ sides, value, label: 'Native' }] }), null);
  }
  assert.equal(reportedDice({ reportId: 'goForItRoll', roll: 3, numericDice: { version: 2, dice: [] } }), null);
  assert.deepEqual(reportedDice({ reportId: 'scatterBall', rolls: [2, 8] })?.rolls?.map(roll => roll.kind), ['d8', 'd8']);
  assert.deepEqual(reportedDice({ reportId: 'tentaclesShadowingRoll', tentacleRoll: [2, 6] })?.faces, ['2', '6']);
  assert.deepEqual(reportedDice({ reportId: 'tentaclesShadowingRoll', roll: 3 })?.rolls?.map(roll => roll.kind), ['d6']);
});
