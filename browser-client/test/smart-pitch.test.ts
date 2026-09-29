import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { attackApproaches, smartAttack } from '../src/action-ribbon.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const ready = frames[0].actor as SetupState;

function offered(kind: string, sourcePlayerId: string, target: SetupAction['target'] = null): SetupAction {
  return { id: kind, kind, actor: 'home', label: kind, sourcePlayerId, target };
}

test('a clicked standing opponent prepares Block when adjacent and Blitz when distant', () => {
  assert.equal(smartAttack(ready, ready.actions, 'home1', 'away1')?.action.kind, 'blitz');
  const adjacent = { ...ready, players: ready.players.map(player => player.id === 'away1' ? { ...player, x: 8 } : player),
    actions: [offered('selectBlock', 'home1'), offered('blitz', 'home1')] };
  assert.equal(smartAttack(adjacent, adjacent.actions, 'home1', 'away1')?.action.kind, 'selectBlock');
  assert.equal(smartAttack(adjacent, adjacent.actions, 'home1', 'away1', true)?.action.kind, 'blitz');
  assert.equal(smartAttack({ ...adjacent, callerRole: 'spectator' }, adjacent.actions, 'home1', 'away1'), null);
  assert.equal(smartAttack(adjacent, [offered('selectBlock', 'other')], 'home1', 'away1'), null);
});

test('a clicked prone opponent prepares the offered Foul from adjacent or distant squares', () => {
  const prone = { ...ready, players: ready.players.map(player => player.id === 'away1' ? { ...player, state: 'is prone' } : player) };
  const actions = [offered('declareFoul', 'home1')];
  assert.equal(smartAttack(prone, actions, 'home1', 'away1')?.action.kind, 'declareFoul');
  const active = { ...prone, activePlayerId: 'home1', players: prone.players.map(player => player.id === 'away1' ? { ...player, x: 8 } : player) };
  assert.equal(smartAttack(active, [offered('foul', 'home1', { playerId: 'away1' })], 'home1', 'away1')?.action.kind, 'foul');
  assert.equal(smartAttack(active, [offered('foul', 'home1', { playerId: 'someone-else' })], 'home1', 'away1'), null);
});

test('a selected Blitz target remains tied to the server-offered target, then approaches an empty square', () => {
  const declared = frames[1].actor as SetupState;
  assert.equal(smartAttack(declared, declared.actions, 'home1', 'away1')?.action.kind, 'blitzTarget');
  const blocked = { ...declared, players: [...declared.players, { ...declared.players[0], id: 'mate', x: 10, y: 7 }] };
  assert.deepEqual(attackApproaches(blocked, 'home1', 'away1')[0], { x: 10, y: 6 });
  assert.deepEqual(attackApproaches(declared, 'home1', 'missing'), []);
});
