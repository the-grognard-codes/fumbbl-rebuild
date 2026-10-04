import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canDragSetupPlayer, canDropSetupPlayer, solidDefenceDrop } from '../src/setup-drag.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const initial = frames[0].actor as SetupState;
const setup: SetupState = { ...initial, phase: 'SETUP', players: [
  initial.players[0], { ...initial.players[0], id: 'reserve', x: null, y: null, offPitch: 'reserve' },
  { ...initial.players[0], id: 'ko', x: null, y: null, offPitch: 'knockedOut' }, initial.players[1]
] };
const choice: SetupAction = { id: '7:event-pick:home1', label: 'Reposition home1', kind: 'kickoffChoice',
  actor: 'home', sourcePlayerId: null, target: { playerId: 'home1' } };
const place: SetupAction = { id: '8:solid-place:home1:8:7', label: 'Place home1 at 8, 7', kind: 'kickoffMove',
  actor: 'home', sourcePlayerId: null, target: { x: 8, y: 7 } };

test('setup dragging accepts only owned reserves or pitch players and empty own-half drops', () => {
  assert.equal(canDragSetupPlayer(setup, setup.players[0], []), true);
  assert.equal(canDragSetupPlayer(setup, setup.players[1], []), true);
  assert.equal(canDragSetupPlayer(setup, setup.players[2], []), false);
  assert.equal(canDragSetupPlayer(setup, setup.players[3], []), false);
  assert.equal(canDropSetupPlayer(setup, 'reserve', { x: 8, y: 7 }), true);
  assert.equal(canDropSetupPlayer(setup, 'home1', null), true);
  assert.equal(canDropSetupPlayer(setup, 'reserve', null), false);
  assert.equal(canDropSetupPlayer(setup, 'ko', { x: 8, y: 7 }), false);
  const exhausted: SetupState = { ...setup, players: [...setup.players,
    { ...initial.players[0], id: 'exhausted', x: null, y: null, offPitch: 'other', state: 'is exhausted' }] };
  assert.equal(canDropSetupPlayer(exhausted, 'exhausted', { x: 8, y: 7 }), false);
  assert.equal(canDropSetupPlayer(setup, 'home1', { x: 7, y: 7 }), false);
  assert.equal(canDropSetupPlayer(setup, 'home1', { x: 13, y: 7 }), false);
  assert.equal(canDropSetupPlayer({ ...setup, actor: 'away' }, 'home1', null), false);
});

test('Solid Defence drag first selects the offered player, then uses the offered placement', () => {
  const event: SetupState = { ...setup, phase: 'PLAY', turnMode: 'SOLID_DEFENCE' };
  assert.equal(canDragSetupPlayer(event, event.players[0], [choice]), true);
  assert.equal(canDragSetupPlayer(event, event.players[0], [place]), true);
  assert.equal(canDragSetupPlayer(event, event.players[1], [choice]), false);
  assert.equal(solidDefenceDrop(event, [choice], 'home1', { x: 8, y: 7 })?.action.id, choice.id);
  assert.equal(solidDefenceDrop(event, [choice], 'home1', { x: 8, y: 7 })?.selecting, true);
  assert.equal(solidDefenceDrop(event, [choice, place], 'home1', { x: 8, y: 7 })?.action.id, place.id);
  assert.equal(solidDefenceDrop(event, [choice, place], 'home1', { x: 13, y: 7 }), null);
  assert.equal(solidDefenceDrop(event, [choice, place], 'reserve', { x: 8, y: 7 }), null);
});
