import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { negativeConditionLabels, playerNegativeConditions, playerTagPlacements } from '../src/negative-condition-presentation.ts';
import { readNegativeConditionMarkers, saveNegativeConditionMarkers } from '../src/negative-condition-preferences.ts';
import { readLimitedActionTags, saveLimitedActionTags } from '../src/limited-action-preferences.ts';
import { playerCardStatus, playerCardStatuses } from '../src/player-card-details.ts';
import { decodeSetupStateValue, type SetupPlayer } from '../src/setup-protocol.ts';

const stored = new Map<string, string>();
const storage = () => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
} });
afterEach(() => { storage(); saveNegativeConditionMarkers(true); saveLimitedActionTags(true); stored.clear(); delete globalThis.localStorage; });

test('condition preference defaults on, persists independently and survives blocked storage', () => {
  storage(); assert.equal(readNegativeConditionMarkers(), true);
  saveNegativeConditionMarkers(false); assert.equal(readNegativeConditionMarkers(), false);
  assert.equal(readLimitedActionTags(), true);
  saveLimitedActionTags(false); saveNegativeConditionMarkers(true);
  assert.equal(readNegativeConditionMarkers(), true); assert.equal(readLimitedActionTags(), false);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw Error('Denied'); } });
  saveNegativeConditionMarkers(false); assert.equal(readNegativeConditionMarkers(), false);
});

test('protocol accepts all six conditions, empty and legacy metadata, including off-pitch players', () => {
  const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const player = initial.players[0];
  const view = (conditions: unknown, extra = {}) => ({ ...initial, players: [{ ...player, conditions, ...extra }] });
  const all = Object.keys(negativeConditionLabels);
  for (const conditions of [[], all, ...all.map(kind => [kind])]) assert.doesNotThrow(() => decodeSetupStateValue(view(conditions)));
  assert.doesNotThrow(() => decodeSetupStateValue(initial));
  assert.doesNotThrow(() => decodeSetupStateValue(view(all, { x: null, y: null, offPitch: 'reserve' })));
  for (const bad of [null, 'rooted', {}, ['unknown'], ['toString'], ['rooted', 'rooted'], [null], [...all, 'rooted']])
    assert.throws(() => decodeSetupStateValue(view(bad)));
});

test('Status preserves posture and authoritative conditions, in canonical order with red negative entries', () => {
  const player: SetupPlayer = { id: 'p1', name: 'Player', slot: 1, role: 'home', x: 1, y: 1,
    state: 'is prone', status: 'Distracted', conditions: ['dodgySnack', 'distracted'] };
  assert.equal(playerCardStatus(player), 'Prone, Distracted, Dodgy Snack');
  assert.ok(playerCardStatuses(player).every(entry => entry.negative));
  assert.deepEqual(playerCardStatuses({ ...player, state: 'is standing', status: 'Standing', conditions: [] }),
    [{ label: 'Standing', negative: false }]);
  assert.deepEqual(playerNegativeConditions({ ...player, conditions: [] }), []);
  assert.deepEqual(playerNegativeConditions({ ...player, conditions: undefined }), ['distracted']);
  assert.equal(playerCardStatus({ ...player, state: 'has been stunned', conditions: ['eyeGouged', 'greasyCleats'] }),
    'Stunned, Greasy Cleats, Eye Gouged');
});

test('legacy distraction is additive while explicit empty condition metadata stays authoritative', () => {
  for (const [state, posture] of [['is prone', 'Prone'], ['has been stunned', 'Stunned']]) {
    const player: SetupPlayer = { id: 'legacy', name: 'Legacy Player', slot: 1, role: 'home', x: 1, y: 1,
      state, status: 'Distracted' };
    assert.deepEqual(playerCardStatuses(player), [{ label: posture, negative: true }, { label: 'Distracted', negative: true }]);
    assert.deepEqual(playerCardStatuses({ ...player, conditions: [] }), [{ label: posture, negative: true }]);
  }
});

test('one tag preserves its head anchor; combined rows center individually, wrap at three and clear the skill strip', () => {
  assert.deepEqual(playerTagPlacements(1, 50, 10, 23, 0), [{ size: 20, left: 23, top: -15 }]);
  assert.deepEqual(playerTagPlacements(0, 50, 10, 23, 0), []);
  for (let count = 1; count <= 7; count++) {
    const tags = playerTagPlacements(count, 50, 10, 23, 14);
    const rows = new Map<number, typeof tags>();
    for (const tag of tags) rows.set(tag.top, [...(rows.get(tag.top) ?? []), tag]);
    assert.equal(rows.size, Math.ceil(count / 3));
    for (const row of rows.values()) {
      assert.ok(row.length <= 3); assert.equal(row.reduce((sum, tag) => sum + tag.left, 0) / row.length, 23);
      assert.ok(row.every(tag => tag.top + tag.size <= -6));
      for (let i = 1; i < row.length; i++) assert.ok(row[i].left - row[i - 1].left > row[i].size);
    }
  }
});
