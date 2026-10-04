import assert from 'node:assert/strict';
import test from 'node:test';
import { playerCardStatus, playerCardSubtypes } from '../src/player-card-details.ts';
import type { SetupPlayer } from '../src/setup-protocol.ts';

const troll: SetupPlayer = { id: 'troll', name: 'Troll 1', slot: 1, role: 'home', x: 13, y: 6,
  state: 'is standing', art: { rosterId: 'orc', positionId: 'troll' } };

test('cards show roster subtypes and a short status without pitch coordinates', () => {
  assert.equal(playerCardSubtypes(troll), 'Troll, Big Guy');
  assert.equal(playerCardStatus(troll), 'Standing');
  assert.equal(playerCardSubtypes({ ...troll, art: { rosterId: 'orc', positionId: 'orc-lineman' } }), 'Orc, Lineman');
  assert.equal(playerCardStatus({ ...troll, state: 'has been seriously injured' }), 'Seriously Injured');
});

test('authoritative subtype and distracted status take precedence over legacy labels', () => {
  const player = { ...troll, positionRace: 'Troll', positionRole: 'Big Guy', status: 'Distracted' };
  assert.equal(playerCardSubtypes(player), 'Troll, Big Guy');
  assert.equal(playerCardStatus(player), 'Distracted');
});
