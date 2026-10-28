import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportedDice, diceRollGroups } from '../src/dice-presentation.ts';
import { casualtyOutcome } from '../src/dice-outcomes.ts';

const dice = (label: string, values: number[], sides = [6, 6]) => values.map((value, index) => ({ label, value, sides: sides[index] }));
const groups = (report: Record<string, unknown>) => diceRollGroups(reportedDice(report)!).map(group => ({
  label: group.label, outcome: group.outcome, emphasized: group.emphasized, faces: group.faces,
}));

test('armor and injury use native outcomes, never the raw totals or a future casualty result', () => {
  const report = { reportId: 'injury', armorBroken: true, injury: 7, seriousInjury: 'Head Injury (-AV)',
    numericDice: { version: 1, dice: [...dice('Armour', [1, 1]), ...dice('Injury', [1, 1]), ...dice('Casualty', [13, 4], [16, 6])] } };
  assert.deepEqual(groups(report), [
    { label: 'Armour', outcome: 'armor', emphasized: true, faces: ['1', '1'] },
    { label: 'Injury', outcome: 'casualty', emphasized: true, faces: ['1', '1'] },
    { label: 'Casualty', outcome: undefined, emphasized: true, faces: ['13'] },
    { label: 'Serious injury', outcome: 'stat', emphasized: true, faces: ['4'] },
  ]);
  const unbroken = groups({ ...report, armorBroken: false })[0];
  assert.equal(unbroken.outcome, undefined); assert.equal(unbroken.emphasized, false);
  for (const [injury, outcome] of [[4, 'stun'], [5, 'ko'], [6, 'casualty'], [8, 'casualty']] as const) {
    assert.equal(groups({ ...report, injury })[1].outcome, outcome);
  }
});

test('legacy casualty pairs stay simultaneous and Decay uses its own result', () => {
  const result = groups({ reportId: 'injury', injury: 7, seriousInjury: 'Damaged Back (NI)',
    injuryDecay: 8, seriousInjuryDecay: 'Dead (RIP)', numericDice: { version: 1,
      dice: [...dice('Casualty', [5, 2], [6, 8]), ...dice('Decay casualty', [6, 8], [6, 8])] } });
  assert.deepEqual(result.map(group => [group.faces, group.outcome]), [[['5', '2'], 'ni'], [['6', '8'], 'dead']]);
});

test('apothecary replacements do not inherit the old injury and capped stat details appear only at SI', () => {
  const report = { reportId: 'apothecaryRoll', playerState: 9, seriousInjury: null, seriousInjuryOld: 'Dead (RIP)',
    numericDice: { version: 1, dice: dice('Casualty', [3, 2], [16, 6]) } };
  assert.equal(groups(report)[0].outcome, 'bh');
  const capped = groups({ ...report, playerState: 7, seriousInjury: 'Seriously Hurt (MNG)', seriousInjuryOld: 'Broken Arm (-PA)' });
  assert.deepEqual(capped.map(group => group.outcome), [undefined, 'mng']);
  assert.deepEqual(capped.map(group => group.label), ['Apothecary casualty', 'Apothecary serious injury']);
});

test('named casualty categories cover all rulesets without deriving rules from dice', () => {
  for (const [name, expected] of [['Broken Ribs (MNG)', 'mng'], ['Serious Injury (NI)', 'ni'],
    ['Smashed Hip (-MA)', 'stat'], ['Dislocated Shoulder (-ST)', 'stat'], ['Head Injury (-AV)', 'stat'],
    ['Neck Injury (-AG)', 'stat'], ['Broken Arm (-PA)', 'stat'], ['Dead (RIP)', 'dead']] as const) {
    assert.equal(casualtyOutcome(7, name), expected);
  }
  assert.equal(casualtyOutcome(6, null), 'bh');
  assert.equal(casualtyOutcome(7, 'Unknown native result'), undefined);
  assert.equal(casualtyOutcome(null, null), undefined);
});

test('skipped parts and outcome-only injury/apothecary reports cannot fabricate effects or rolls', () => {
  assert.equal(reportedDice({ reportId: 'injury', skipInjuryParts: 'ARMOUR_AND_INJURY', armorBroken: true,
    armorRoll: [6, 6], injuryRoll: [6, 6], injury: 8 }), null);
  assert.equal(reportedDice({ reportId: 'apothecaryRoll', playerState: 8, seriousInjury: 'Dead (RIP)' }), null);
});
