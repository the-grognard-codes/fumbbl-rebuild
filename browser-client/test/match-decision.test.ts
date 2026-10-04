import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchDecision } from '../src/match-decision.ts';
import { pitchPushChoices } from '../src/push-choice.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));

test('real block dice become pitch choices while push squares stay on the pitch', () => {
  const block = frames[6].actor as SetupState;
  const dice = matchDecision(block, block.actions.filter(action => action.actor === block.callerRole));
  assert.equal(dice?.title, 'Choose a block die');
  assert.equal(dice?.kind, 'blockDie');
  assert.deepEqual(dice?.options.map(option => option.id), block.actions.map(action => action.id));
  assert.equal(dice?.options[0].face, 'PUSHBACK');
  const push = frames[7].actor as SetupState;
  assert.equal(matchDecision(push, push.actions), null);
  assert.deepEqual(pitchPushChoices(push, push.actions).map(choice => [choice.x, choice.y, choice.fromX, choice.fromY]),
    [[12, 6, 11, 7], [12, 7, 11, 7], [12, 8, 11, 7]]);
  const spectator = frames[6].spectator as SetupState;
  assert.equal(matchDecision(spectator, []), null);
});

test('reroll choices retain skill and team options and follow-up uses Yes and No', () => {
  const frame = frames[6].actor as SetupState;
  const reroll = { ...frame, revision: 24, actions: [
    { id: '24:reroll:none', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Do not re-roll Dodge' },
    { id: '24:reroll:skill', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Dodge re-roll' },
    { id: '24:reroll:team', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use team re-roll for Dodge' }
  ] };
  assert.equal(matchDecision(reroll, reroll.actions)?.kind, 'reroll');
  assert.deepEqual(matchDecision(reroll, reroll.actions)?.options.map(option => option.label),
    ['Do not re-roll Dodge', 'Use Dodge re-roll', 'Use team re-roll for Dodge']);
  const followUp = { ...reroll, actions: [
    { id: '24:follow:no', actor: frame.callerRole as 'home', kind: 'followUp', label: 'Do not follow up' },
    { id: '24:follow:yes', actor: frame.callerRole as 'home', kind: 'followUp', label: 'Follow up' }
  ] };
  assert.deepEqual(matchDecision(followUp, followUp.actions)?.options.map(option => option.label), ['No', 'Yes']);
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
