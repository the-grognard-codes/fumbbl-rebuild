import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blockFace, diceRollGroups, numericRolls, offeredBlockDice, reportedDice } from '../src/dice-presentation.ts';

test('complete authoritative block choices expose ordered faces to any viewer without guessing partial rolls', () => {
  const view = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  view.activePlayerId = view.players.find((player: { role: string }) => player.role === 'home').id;
  const choices = [2, 1].map(index => ({ id: `choice:${index}`, kind: 'blockDie', actor: 'away',
    label: `Choose ${index === 1 ? 'BOTH DOWN' : 'POW'} (die ${index})`, sourcePlayerId: view.activePlayerId, target: null }));
  view.actions = choices;
  for (const callerRole of ['home', 'away', 'spectator']) {
    const dice = offeredBlockDice({ ...view, callerRole });
    assert.deepEqual(dice?.faces, ['BOTH DOWN', 'POW']);
    assert.equal(dice?.chooser, 'away');
    assert.equal(dice?.uphill, true);
  }
  for (const actions of [[], choices.slice(0, 1), [choices[0], choices[0]],
    choices.map(action => ({ ...action, kind: 'rerollDie' })),
    [choices[0], { ...choices[1], actor: 'home' }],
    [choices[0], { ...choices[1], label: 'Choose UNKNOWN (die 1)' }]]) {
    assert.equal(offeredBlockDice({ ...view, actions }), null);
  }
});

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

test('injury follow-up reports cannot replay skipped dice and legacy pairs stay together', () => {
  const report = { reportId: 'injury', playerId: 'victim', armorRoll: [6, 5], injuryRoll: [4, 3] };
  const armor = reportedDice({ ...report, skipInjuryParts: 'INJURY', numericDice: { version: 1,
    dice: [6, 5].map(value => ({ sides: 6, value, label: 'Armour' })) } })!;
  const injury = reportedDice({ ...report, skipInjuryParts: 'ARMOUR', numericDice: { version: 1,
    dice: [4, 3].map(value => ({ sides: 6, value, label: 'Injury' })) } })!;
  assert.deepEqual([armor, injury].flatMap(moment => diceRollGroups(moment).map(group => group.faces)), [['6', '5'], ['4', '3']]);
  assert.equal(reportedDice({ ...report, skipInjuryParts: 'ARMOUR_AND_INJURY' }), null,
    'An outcome-only report has no new dice, even when the original rolls remain in its payload');
  assert.deepEqual(diceRollGroups(reportedDice({ ...report, skipInjuryParts: 'INJURY' })!).map(group => group.faces), [['6', '5']],
    'Undecorated legacy reports obey the same skip flags and group both armor dice');
  assert.deepEqual(diceRollGroups(reportedDice({ ...report, skipInjuryParts: 'ARMOUR' })!).map(group => group.faces), [['4', '3']]);
  for (const [skipInjuryParts, expected] of [
    ['NONE', ['6', '5', '4', '3', '16', '2']], ['ARMOUR', ['4', '3', '16', '2']],
    ['ARMOUR_AND_CAS', ['4', '3']], ['ARMOUR_AND_INJURY', []], ['EVERYTHING_BUT_CAS', ['16', '2']],
    ['INJURY', ['6', '5']], ['CAS', ['6', '5', '4', '3']]
  ] as const) {
    assert.deepEqual(reportedDice({ ...report, casualtyRoll: [16, 2], skipInjuryParts })?.faces ?? [], expected, skipInjuryParts);
  }
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
  for (const report of [{ reportId: 'prayerRoll', roll: 3 },
    { reportId: 'solidDefenceRoll', roll: 3 }, { reportId: 'unknownRoll', roll: 3 }, { reportId: 'injury', injuryRoll: 8 }]) {
    assert.equal(reportedDice(report), null);
  }
  for (const [sides, value] of [[8, 9], [16, 17], [6, 0], [16, 1.5]]) {
    assert.equal(numericRolls({ version: 1, dice: [{ sides, value, label: 'Native' }] }), null);
  }
  assert.deepEqual(numericRolls({ version: 1, dice: [{ sides: 3, value: 2, label: 'D3' }] })?.map(roll => [roll.kind, roll.face]), [['d6', '2']]);
  assert.deepEqual(reportedDice({ reportId: 'injury', casualtyRoll: [3, 2] })?.rolls?.map(roll => roll.kind), ['d16', 'd6']);
  assert.equal(reportedDice({ reportId: 'goForItRoll', roll: 3, numericDice: { version: 2, dice: [] } }), null);
  assert.deepEqual(reportedDice({ reportId: 'scatterBall', rolls: [2, 8] })?.rolls?.map(roll => roll.kind), ['d8', 'd8']);
  assert.deepEqual(reportedDice({ reportId: 'tentaclesShadowingRoll', tentacleRoll: [2, 6] })?.faces, ['2', '6']);
  assert.deepEqual(reportedDice({ reportId: 'tentaclesShadowingRoll', roll: 3 })?.rolls?.map(roll => roll.kind), ['d6']);
});
