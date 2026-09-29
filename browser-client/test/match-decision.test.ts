import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchDecision } from '../src/match-decision.ts';
import { pitchPushChoices } from '../src/push-choice.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));

test('real block dice remain a modal while push squares move to the pitch', () => {
  const block = frames[6].actor as SetupState;
  const dice = matchDecision(block, block.actions.filter(action => action.actor === block.callerRole));
  assert.equal(dice?.title, 'Choose a block die');
  assert.deepEqual(dice?.options.map(option => option.id), block.actions.map(action => action.id));
  assert.equal(dice?.options[0].face, 'PUSHBACK');
  const push = frames[7].actor as SetupState;
  assert.equal(matchDecision(push, push.actions), null);
  assert.deepEqual(pitchPushChoices(push, push.actions).map(choice => [choice.x, choice.y, choice.fromX, choice.fromY]),
    [[12, 6, 11, 7], [12, 7, 11, 7], [12, 8, 11, 7]]);
  const spectator = frames[6].spectator as SetupState;
  assert.equal(matchDecision(spectator, []), null);
});

test('a chain push follows the newly pushed player and invalid projections keep the modal', () => {
  const push = frames[7].actor as SetupState;
  const chain = { ...push, revision: 8, players: [...push.players,
    { ...push.players[1], id: 'chain', x: 12, y: 6 }], actions: [
    { ...push.actions[0], id: '8:push:chain:13:6', target: { x: 13, y: 6 } }
  ] };
  assert.deepEqual(pitchPushChoices(chain, chain.actions).map(choice => [choice.fromX, choice.fromY, choice.x, choice.y]),
    [[12, 6, 13, 6]]);
  assert.equal(matchDecision(chain, chain.actions), null);
  assert.deepEqual(pitchPushChoices({ ...chain, callerRole: 'spectator' }, chain.actions), []);
  const invalid = { ...chain, actions: [{ ...chain.actions[0], target: null }] };
  assert.deepEqual(pitchPushChoices(invalid, invalid.actions), []);
  assert.equal(matchDecision(invalid, invalid.actions)?.title, 'Choose a push square');
});

test('a passive coach sees only their own native decision', () => {
  const frame = frames[6].actor as SetupState;
  const away = { ...frame, callerRole: 'away' as const, actor: 'home' as const,
    actions: [{ id: 'passive:skill', actor: 'away' as const, kind: 'skill', label: 'Use Stand Firm', target: null, sourcePlayerId: 'away1' }] };
  assert.equal(matchDecision(away, away.actions)?.options[0].label, 'Use Stand Firm');
  assert.equal(matchDecision(away, []) , null);
  assert.equal(matchDecision(away, [{ ...away.actions[0], actor: 'home' }]), null);
});

test('coin and receive choices use the server prompt identity', () => {
  const frame = frames[0].actor as SetupState;
  const prompt = { ...frame, phase: 'PRE_MATCH' as const, actions: [], prompt: { id: 'coin-1', actor: 'home' as const, kind: 'coin' as const, options: ['heads', 'tails'] as ('heads' | 'tails')[] } };
  const decision = matchDecision(prompt, []);
  assert.equal(decision?.key, 'coin-1');
  assert.deepEqual(decision?.options.map(option => option.label), ['Heads', 'Tails']);
  assert.equal(matchDecision({ ...prompt, callerRole: 'spectator' }, []), null);
});
