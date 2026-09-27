import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchDecision } from '../src/match-decision.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));

test('real block dice and push options become actor-only decisions', () => {
  const block = frames[6].actor as SetupState;
  const dice = matchDecision(block, block.actions.filter(action => action.actor === block.callerRole));
  assert.equal(dice?.title, 'Choose a block die');
  assert.deepEqual(dice?.options.map(option => option.id), block.actions.map(action => action.id));
  assert.equal(dice?.options[0].face, 'PUSHBACK');
  const push = frames[7].actor as SetupState;
  assert.equal(matchDecision(push, push.actions.filter(action => action.actor === push.callerRole))?.options.length, 3);
  const spectator = frames[6].spectator as SetupState;
  assert.equal(matchDecision(spectator, []), null);
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
