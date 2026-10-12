import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { passingLegend, passingSquare } from '../src/passing-presentation.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-ranges.json', import.meta.url), 'utf8'));
test('native ranges retain categories while weather shifts colors and movement refreshes them', () => {
  for (const journey of journeys) {
    const declared = decodeSetupStateValue(journey.frames[1].actor);
    const moved = decodeSetupStateValue(journey.frames[2].actor);
    assert.equal(declared.passing?.from.x, 10);
    assert.equal(moved.passing?.from.x, 11);
    assert.equal(passingSquare(moved.passing!, 17, 7).code, 'S');
    const sunny = journey.weather === 'VERY_SUNNY', limited = journey.weather === 'BLIZZARD';
    assert.deepEqual(passingLegend(declared.passing!).map(item => item.text), [
      `Quick Pass: ${sunny ? 'yellow' : 'green'}`, `Short Pass: ${sunny ? 'orange' : 'yellow'}`,
      `Long Pass: ${limited ? 'unavailable (weather)' : sunny ? 'red' : 'orange'}`, `Long Bomb: ${limited ? 'unavailable (weather)' : sunny ? 'dark red' : 'red'}`,
    ]);
    assert.equal(passingSquare(declared.passing!, 17, 7).code, limited ? '-' : 'L');
    assert.match(passingSquare(declared.passing!, 14, 7).description, /Short Pass/);
    if (sunny) assert.match(passingSquare(declared.passing!, 14, 7).description, /weather \+1 passing penalty/);
    if (limited) assert.match(passingSquare(declared.passing!, 17, 7).description, /unavailable.*weather/);
    assert.equal(decodeSetupStateValue(journey.frames[0].actor).passing, undefined);
    assert.equal(decodeSetupStateValue(journey.frames[3].actor).passing, undefined);
    assert.deepEqual(decodeSetupStateValue({ ...journey.frames[1].actor, callerRole: 'spectator' }, true).passing, declared.passing);
  }
});
test('passing projection rejects unknown versions, private data, mismatched coordinates and forbidden issued actions', () => {
  const view = journeys.find(journey => journey.weather === 'NICE').frames[1].actor;
  const passing = view.passing;
  for (const change of [{ version: 2 }, { private: 'secret' }, { playerId: 'mate' }, { from: { x: 11, y: 7 } },
    { from: { x: 26, y: 7 } }, { weatherPenalty: -1 }, { weatherPenalty: 2 }, { rangeLimited: 'yes' },
    { ranges: passing.ranges.slice(1) }, { ranges: ['X'.repeat(15), ...passing.ranges.slice(1)] },
    { ranges: ['Q'.repeat(14), ...passing.ranges.slice(1)] }]) assert.throws(() => decodeSetupStateValue({ ...view, passing: { ...passing, ...change } }));
  assert.throws(() => decodeSetupStateValue({ ...view, phase: 'SETUP' }));
  assert.throws(() => decodeSetupStateValue({ ...view, activePlayerId: null }));
  assert.throws(() => decodeSetupStateValue({ ...view, passing: null }));
  assert.throws(() => decodeSetupStateValue({ ...view, actions: view.actions.map(action => action.kind === 'pass'
    ? { ...action, target: { x: 10, y: 7 } } : action) }));
  // Existing v4 captures without the optional extension retain their decoding contract.
  const legacy = { ...view }; delete legacy.passing;
  assert.equal(decodeSetupStateValue(legacy).passing, undefined);
});

test('teammate guidance decodes native reduced ranges and roll targets without allowing long throws', () => {
  const view = structuredClone(journeys.find(journey => journey.weather === 'NICE').frames[1].actor);
  delete view.movementForecast;
  for (const action of ['throwTeamMate', 'kickMateTo']) {
    const ranges = Array.from({ length: 26 }, () => '-'.repeat(15));
    ranges[11] = '-------Q-------'; ranges[14] = '-------S-------';
    const targets = ranges.map(row => [...row].map(code => code === '-' ? null : code === 'Q' ? 2 : 3));
    const flight = { ...view, actions: [], passing: { ...view.passing, version: 2, action, ranges, targets } };
    const guidance = decodeSetupStateValue(flight).passing!;
    assert.match(passingSquare(guidance, 14, 7).description, /Short Pass.*3\+/);
    assert.match(passingSquare(guidance, 25, 14).description, /unavailable.*teammate/);
    assert.deepEqual(passingLegend(guidance).map(item => item.text), ['Quick Pass: 2+', 'Short Pass: 3+']);
    assert.deepEqual(decodeSetupStateValue({ ...flight, callerRole: 'spectator' }, true).passing, guidance);
    for (const change of [{ action: 'pass' }, { private: true }, { targets: targets.slice(1) },
      { targets: targets.map(row => row.map(target => target === 3 ? 1 : target)) },
      { targets: targets.map(row => row.map(target => target === 3 ? null : target)) },
      { ranges: ranges.map(row => row.replace('S', 'L')) }]) {
      assert.throws(() => decodeSetupStateValue({ ...flight, passing: { ...flight.passing, ...change } }));
    }
    assert.throws(() => decodeSetupStateValue({ ...flight, actions: [{ ...view.actions[0], kind: action, sourcePlayerId: flight.passing.playerId, target: { x: 25, y: 14 } }] }));
  }
});
