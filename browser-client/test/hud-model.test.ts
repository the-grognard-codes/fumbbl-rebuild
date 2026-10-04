import assert from 'node:assert/strict';
import test from 'node:test';

import { hudResources, turnSlots } from '../src/hud-model.ts';
import type { SetupState } from '../src/setup-protocol.ts';

test('resource inventory contains only positive authoritative values', () => {
  const view = { homeRerolls: 2, awayRerolls: 0,
    homeResources: { apothecaries: 1, assistantCoaches: 0, cheerleaders: 3 },
    awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 } } as SetupState;
  assert.deepEqual(hudResources(view, 'home').map(item => [item.kind, item.count]), [['reroll', 2], ['apothecary', 1], ['cheerleader', 3]]);
  assert.deepEqual(hudResources(view, 'away'), []);
  assert.deepEqual(hudResources({ ...view, homeResources: undefined }, 'home').map(item => item.kind), ['reroll']);
});

test('turn zero has no current slot and each half uses its own eight labels', () => {
  assert.deepEqual(turnSlots(1, 0, 'SETUP').map(slot => slot.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(turnSlots(1, 0, 'SETUP').some(slot => slot.current || slot.past), false);
  const secondHalf = turnSlots(2, 3, 'PLAY');
  assert.deepEqual(secondHalf.map(slot => slot.number), [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(secondHalf.map(slot => [slot.past, slot.current]).slice(0, 4), [[true, false], [true, false], [false, true], [false, false]]);
  assert.equal(turnSlots(2, 8, 'FULL_TIME').some(slot => slot.current), false);
  assert.equal(turnSlots(2, 8, 'FULL_TIME').every(slot => slot.past), true);
  assert.deepEqual(turnSlots(3, 0, 'PLAY').map(slot => slot.number), [17, 18, 19, 20, 21, 22, 23, 24]);
});
