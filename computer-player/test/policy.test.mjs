import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseDecision } from '../src/policy.mjs';

const base = {
  callerRole: 'away', actor: 'away', phase: 'PLAY', half: 1, drive: 1,
  players: [], actions: [], prompt: null
};
const action = (id, kind, actor = 'away') => ({ id, kind, actor, label: kind });

test('chooses either server-offered pre-match option', () => {
  const state = { ...base, phase: 'PRE_MATCH', prompt: { id: 'coin-1', actor: 'away', options: ['heads', 'tails'] } };
  assert.deepEqual(chooseDecision(state, () => 0), { operation: 'choice', promptId: 'coin-1', optionId: 'heads' });
  assert.deepEqual(chooseDecision(state, () => 0.9), { operation: 'choice', promptId: 'coin-1', optionId: 'tails' });
  state.prompt = { id: 'receive-1', actor: 'away', options: ['receive', 'kick'] };
  assert.equal(chooseDecision(state, () => 0.9).optionId, 'kick');
});

test('sets up eleven players with three on the line for either role', () => {
  for (const role of ['home', 'away']) {
    const players = Array.from({ length: 11 }, (_, index) => ({ id: `p${index}`, role, x: null, y: null, state: 'is in reserve' }));
    const state = { ...base, callerRole: role, actor: role, phase: 'SETUP', players };
    const first = chooseDecision(state);
    assert.deepEqual(first, { operation: 'place', playerId: 'p0', to: { x: role === 'home' ? 12 : 13, y: 6 } });
    players.forEach((player, index) => { player.x = role === 'home' ? (index < 3 ? 12 : 10) : (index < 3 ? 13 : 15); player.y = index < 3 ? 6 + index : 1 + index; });
    assert.deepEqual(chooseDecision(state), { operation: 'confirm' });
    players[0].x = 9;
    assert.deepEqual(chooseDecision(state), { operation: 'place', playerId: 'p0', to: null });
  }
});

test('tries a reserve player after a rejected setup without repeating the same formation', () => {
  const players = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, role: 'away', x: null, y: null, state: 'is in reserve' }));
  players.slice(0, 11).forEach((player, index) => { player.x = index < 3 ? 13 : 15; player.y = index < 3 ? 6 + index : 1 + index; });
  const state = { ...base, phase: 'SETUP', players };
  assert.deepEqual(chooseDecision(state, Math.random, 0, 1), { operation: 'place', playerId: 'p10', to: null });
  players[10].x = null; players[10].y = null;
  assert.deepEqual(chooseDecision(state, Math.random, 0, 1), { operation: 'place', playerId: 'p11', to: { x: 15, y: 11 } });
  assert.equal(chooseDecision(state, Math.random, 0, 12), null);
});

test('selects kickoff, skill and regular actions only from own offers', () => {
  const state = { ...base, actions: [action('foreign', 'skill', 'home'), action('kick', 'kickoff'), action('end', 'endTurn')] };
  assert.deepEqual(chooseDecision(state, () => 0), { operation: 'action', actionId: 'kick' });
  state.actions = [action('skill-yes', 'skill'), action('skill-no', 'skill')];
  assert.equal(chooseDecision(state, () => 0.99).actionId, 'skill-no');
  state.actions = [action('move', 'move'), action('end', 'endTurn')];
  assert.equal(chooseDecision(state, () => 0.99).actionId, 'move');
  assert.equal(chooseDecision(state, () => 0.99, 30).actionId, 'end');
  state.actor = 'home';
  assert.equal(chooseDecision(state), null);
});

test('declines a save request and accepts a resume request from the opponent', () => {
  const pendingSave = { ...base, saveResume: { status: 'SAVE_PENDING', proposalId: 'save-1', proposer: 'home' } };
  assert.deepEqual(chooseDecision(pendingSave), { operation: 'saveReject', proposalId: 'save-1' });
  assert.deepEqual(chooseDecision({ ...base, saveResume: { status: 'RESUME_PENDING', proposalId: 'resume-1', proposer: 'home' } }),
    { operation: 'resumeAccept', proposalId: 'resume-1' });
});
