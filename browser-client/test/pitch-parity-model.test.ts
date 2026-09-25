import assert from 'node:assert/strict';
import test from 'node:test';

import { initialParityState, interpolatedSquare, parityPlayers, parityPreview, reduceParityState } from '../src/pitch-parity-model.ts';

test('scripted Blitz keeps one presentation state through movement and block choice', () => {
  let state = initialParityState();
  state = reduceParityState(state, { type: 'select', playerId: 'home-1' });
  state = reduceParityState(state, { type: 'square', square: { x: 10, y: 7 } });
  const preview = parityPreview(state);
  assert.equal(preview.action, 'Blitz');
  assert.equal(preview.canCommit, true);
  assert.deepEqual(preview.route?.path[preview.route.path.length - 1], { x: 9, y: 7 });

  state = reduceParityState(state, { type: 'commit' });
  assert.equal(state.phase, 'moving');
  const actor = parityPlayers(state).find(player => player.id === 'home-1')!;
  assert.deepEqual(interpolatedSquare({ ...state, progress: -.01 }, actor), { x: 5, y: 7 });
  state = reduceParityState(state, { type: 'tick', progress: 1 });
  assert.equal(state.phase, 'block-choice');
  assert.deepEqual(state.positions['home-1'], { x: 9, y: 7 });
  state = reduceParityState(state, { type: 'block-die', value: 'pow' });
  assert.equal(state.proneId, 'away-1');
  assert.match(state.message, /No server roll or rule outcome/);
});

test('selecting the active player again clears the target and selection', () => {
  let state = initialParityState();
  state = reduceParityState(state, { type: 'select', playerId: 'home-1' });
  state = reduceParityState(state, { type: 'square', square: { x: 10, y: 7 } });
  state = reduceParityState(state, { type: 'select', playerId: 'home-1' });
  assert.equal(state.selectedId, null);
  assert.equal(state.target, null);
  assert.equal(parityPreview(state).canCommit, false);
});
