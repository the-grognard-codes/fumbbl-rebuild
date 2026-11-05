import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { reportedDice, diceRollGroups } from '../src/dice-presentation.ts';

const describe = (report: Record<string, unknown>) => reportedDice({ roll: 4, ...report })?.presentation;

test('event identities use native discriminators and do not expose modifiers or guess missing results', () => {
  assert.deepEqual(describe({ reportId: 'dodgeRoll', minimumRoll: 3, successful: false, reRolled: true }),
    { name: 'Dodge (reroll)', icon: 'dodge', result: 'Failed' });
  assert.deepEqual(describe({ reportId: 'confusionRoll', confusionSkill: 'Really Stupid', successful: true }),
    { name: 'Really Stupid', icon: 'really-stupid', result: 'Success' });
  assert.equal(describe({ reportId: 'confusionRoll', confusionSkill: 'Unknown' }), undefined);
  assert.equal(describe({ reportId: 'spellEffectRoll', specialEffect: 'zap' })?.icon, 'zap');
  assert.equal(describe({ reportId: 'spellEffectRoll', specialEffect: 'unknown' }), undefined);
  assert.equal(describe({ reportId: 'tentaclesShadowingRoll', skill: 'Shadowing' })?.icon, 'shadowing');
  assert.equal(describe({ reportId: 'reRoll', reRollSource: 'Pro', logTest: { version: 1, rerolled: true } })?.name, 'Pro (reroll)');
  assert.equal(describe({ reportId: 'reRoll', reRollSource: 'Loner' })?.icon, 'loner');
  assert.equal(describe({ reportId: 'dodgeRoll', roll: 6 })?.result, undefined);
});

test('flight results preserve native classifications and pass variants', () => {
  for (const [bomb, hailMaryPass, name, icon] of [[false, false, 'Pass', 'pass'], [true, false, 'Throw Bomb', 'throw-bomb'],
    [false, true, 'Hail Mary Pass', 'hail-mary-pass'], [true, true, 'Hail Mary Bomb', 'hail-mary-bomb']] as const) {
    assert.deepEqual(describe({ reportId: 'passRoll', bomb, hailMaryPass, passResult: 'INACCURATE', successful: true }),
      { name, icon, result: 'Inaccurate' });
  }
  assert.equal(describe({ reportId: 'passRoll', passResult: 'SAVED_FUMBLE' })?.result, 'Recovered Fumble');
  assert.equal(describe({ reportId: 'passRoll', passResult: 'WILDLY_INACCURATE' })?.result, 'Wildly Inaccurate');
  assert.equal(describe({ reportId: 'passRoll', passResult: 'unknown', successful: true })?.result, undefined);
  assert.equal(describe({ reportId: 'throwTeamMateRoll', kicked: true, passResult: 'FUMBLE' })?.name, 'Kick Team-mate');
});

test('weather and directional rolls preserve native facts and simultaneous grouping', () => {
  const weather = reportedDice({ reportId: 'weather', weatherRoll: [2, 3], weather: 'Nice Weather' })!;
  assert.equal(weather.presentation?.result, 'Nice');
  assert.deepEqual(diceRollGroups(weather).map(group => group.faces), [['2', '3']]);
  const scatter = reportedDice({ reportId: 'scatterBall', rolls: [2, 2, 2], directionArray: ['East', 'North', 'invalid'] })!;
  assert.deepEqual(scatter.rolls?.map(roll => roll.direction), ['east', 'north', undefined]);
  assert.equal(diceRollGroups(scatter).length, 1);
  const missing = reportedDice({ reportId: 'scatterBall', rolls: [8] })!;
  assert.equal(missing.rolls?.[0].direction, undefined);
  assert.equal(missing.presentation?.icon, 'scatter');
});

test('injury captions and display-only casualty filtering preserve stored faces and labels', () => {
  const casualty = reportedDice({ reportId: 'injury', armorRoll: [4, 4], armorBroken: false,
    casualtyRoll: [3, 6], injury: 6 })!;
  assert.deepEqual(casualty.faces, ['4', '4', '3', '6']);
  const groups = diceRollGroups(casualty);
  assert.deepEqual(groups.map(group => group.faces), [['4', '4'], ['3']]);
  assert.deepEqual(groups.map(group => group.presentation), [{ name: 'Armor', result: 'Held' },
    { name: 'Casualty', result: 'Badly Hurt!' }]);
  const stat = reportedDice({ reportId: 'injury', casualtyRoll: [13, 4], injury: 7, seriousInjury: 'Head Injury (-AV)' })!;
  assert.deepEqual(diceRollGroups(stat).map(group => group.presentation), [
    { name: 'Casualty', result: 'Stat Reduction!' }, { name: 'Stat Reduced', result: 'Head Injury (-1 AV)' }]);
  const apo = reportedDice({ reportId: 'apothecaryRoll', casualtyRoll: [3, 4], playerState: 6 })!;
  assert.equal(diceRollGroups(apo)[0].presentation?.name, 'Apothecary Result');
});

test('unknown numeric reports retain original labels without inventing artwork or outcomes', () => {
  const moment = reportedDice({ reportId: 'unknownFutureEvent', successful: true, numericDice: { version: 1,
    dice: [{ sides: 6, value: 6, label: 'Original caption' }] } })!;
  assert.equal(moment.label, 'Original caption');
  assert.equal(moment.presentation, undefined);
  assert.equal(moment.rolls?.[0].presentation, undefined);
});

test('kickoff Deviation groups typed D8 plus D6 or D3 without guessing older distance types', () => {
  for (const sides of [3, 6]) {
    const moment = reportedDice({ reportId: 'kickoffScatter', scatterDistanceSides: sides, scatterDirection: 'West',
      numericDice: { version: 1, dice: [{ sides: 8, value: 7, label: 'Deviation' }, { sides, value: 2, label: 'Deviation' }] } })!;
    assert.deepEqual(moment.presentation, { name: 'Deviation', icon: 'deviation' });
    assert.deepEqual(moment.rolls?.map(roll => [roll.kind, roll.direction]), [['d8', 'west'], ['d6', undefined]]);
    assert.equal(diceRollGroups(moment).length, 1);
  }
  assert.equal(reportedDice({ reportId: 'kickoffScatter', rollScatterDistance: 2, numericDice: { version: 1,
    dice: [{ sides: 8, value: 7, label: 'Kick direction' }] } })?.presentation?.name, 'Kick direction');
});

test('all single-identity artwork mappings resolve to delivered canonical assets', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../assets/game/ui/dice-events-v1/manifest.json', import.meta.url), 'utf8'));
  for (const entry of manifest.events) assert.ok(existsSync(new URL(`../../assets/game/ui/dice-events-v1/${entry.file}`, import.meta.url)));
  const ids = new Set<string>(manifest.events.flatMap((entry: { reportIds: string[] }) => entry.reportIds));
  for (const reportId of ids) {
    const value = describe({ reportId });
    if (value?.icon) assert.ok(manifest.events.some((entry: { id: string }) => entry.id === value.icon), value.icon);
  }
});
