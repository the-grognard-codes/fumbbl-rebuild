import assert from 'node:assert/strict';
import test from 'node:test';
import { playerCardStatus } from '../src/player-card-details.ts';
import type { SetupPlayer } from '../src/setup-protocol.ts';

const player: SetupPlayer = { id: 'legacy-player', name: 'Legacy Player', slot: 1, role: 'home',
  x: 1, y: 1, state: 'is standing', status: 'Distracted' };

test('legacy player cards preserve posture alongside distraction without condition metadata', () => {
  for (const [state, posture] of [['is standing', 'Standing'], ['is prone', 'Prone'], ['has been stunned', 'Stunned']]) {
    assert.equal(playerCardStatus({ ...player, state }), `${posture}, Distracted`);
  }
});

test('legacy player cards deduplicate distraction and retain ordinary status fallbacks', () => {
  assert.equal(playerCardStatus({ ...player, state: 'is distracted' }), 'Distracted');
  assert.equal(playerCardStatus({ ...player, state: 'hypnotized', status: undefined }), 'Distracted');
  assert.equal(playerCardStatus({ ...player, state: 'is prone', status: undefined }), 'Prone');
  assert.equal(playerCardStatus({ ...player, state: 'is standing', status: 'Standing' }), 'Standing');
  assert.equal(playerCardStatus({ ...player, state: 'unrecognized', status: 'Custom Status' }), 'Custom Status');
});
