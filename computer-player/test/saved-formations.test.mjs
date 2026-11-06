import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseDecision } from '../src/policy.mjs';
import { chooseBogrukDecision } from '../src/bogruk-policy.mjs';

test('both computer policies preserve a formation already deployed and completed by the server', () => {
  const state = { phase: 'SETUP', actor: 'away', callerRole: 'away', revision: 1, prompt: null, actions: [], players: [],
    savedFormations: [{ name: 'Chevron Defense', index: 0 }],
    computer: { seed: 1, policyState: null, progress: { turnKey: '1:1' } } };
  assert.deepEqual(chooseDecision(state), { operation: 'confirm' });
  assert.deepEqual(chooseBogrukDecision(state).decision, { operation: 'confirm' });
  assert.equal(chooseDecision({ ...state, actor: 'home' }), null);
});
