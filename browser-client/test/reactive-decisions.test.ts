import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { Reaction, SetupAction, SetupState } from '../src/setup-protocol.ts';
import { matchDecision } from '../src/match-decision.ts';
import { reactionAnchor, reactionSeconds } from '../src/reaction-clock.ts';

const base: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const reaction: Reaction = { id: 'react-1', actor: 'away', title: 'Use Diving Tackle?', detail: 'Choose a player or decline.',
  serverNow: 1_800_000_000_000, expiresAt: 1_800_000_030_000 };
const action = (kind: string, target: SetupAction['target'] = null, sourcePlayerId: string | null = null): SetupAction =>
  ({ id: `offer:${kind}`, label: `Choose ${kind}`, kind, target, actor: 'away', sourcePlayerId });
const live: SetupState = { ...base, callerRole: 'away', actor: 'home', reaction,
  actions: [action('reactiveSkill', { playerId: base.players[1].id })] };

test('v4 reaction data is strict while allowing absent detail and an elapsed deadline', () => {
  assert.deepEqual(decodeSetupStateValue(live).reaction, reaction);
  const { detail, ...withoutDetail } = reaction;
  assert.doesNotThrow(() => decodeSetupStateValue({ ...live, reaction: withoutDetail }));
  assert.doesNotThrow(() => decodeSetupStateValue({ ...live, reaction: { ...reaction, serverNow: reaction.expiresAt + 1 } }));
  for (const change of [{ actor: 'spectator' }, { id: '' }, { title: '' }, { detail: null }, { expiresAt: -1 },
    { serverNow: 1.5 }, { privateSkill: 'hidden' }])
    assert.throws(() => decodeSetupStateValue({ ...live, reaction: { ...reaction, ...change } }));
  assert.throws(() => decodeSetupStateValue({ ...live, projectionVersion: 3 }));
  assert.throws(() => decodeSetupStateValue({ ...live, phase: 'SETUP' }));
});

test('new reactive action kinds require their public reaction context and native targets', () => {
  const away = base.players.find(player => player.role === 'away')!;
  for (const offered of [action('reactiveSkill'), action('reactiveSquare', { x: 13, y: 7 }),
    action('reactionMove', { x: 13, y: 7 }, away.id), action('reactionEnd')])
    assert.doesNotThrow(() => decodeSetupStateValue({ ...live, actions: [offered] }));
  for (const offered of [action('reactiveSquare'), action('reactiveSquare', { playerId: away.id }),
    action('reactionMove', { x: 13, y: 7 }), action('reactionEnd', { x: 13, y: 7 }),
    { ...action('reactiveSkill'), actor: 'home' }])
    assert.throws(() => decodeSetupStateValue({ ...live, actions: [offered] }));
  const { reaction: omitted, ...noReaction } = live;
  assert.throws(() => decodeSetupStateValue(noReaction));
});

test('the reaction coach receives native choices outside their own turn; observers do not', () => {
  const decision = matchDecision(live, live.actions)!;
  assert.equal(decision.title, reaction.title);
  assert.equal(decision.detail, reaction.detail);
  assert.deepEqual(decision.options.map(option => option.id), ['offer:reactiveSkill']);
  assert.equal(matchDecision({ ...live, revision: 20 }, live.actions)?.key, decision.key);
  assert.equal(matchDecision({ ...live, callerRole: 'home' }, live.actions), null);
  assert.equal(matchDecision({ ...live, callerRole: 'spectator' }, live.actions), null);
  for (const kind of ['skill', 'reroll', 'rerollDie', 'blockDie']) {
    const choices = [action(kind)];
    const roll = matchDecision({ ...live, actions: choices }, choices)!;
    assert.equal(roll.kind, kind); assert.equal(roll.reaction?.expiresAt, reaction.expiresAt);
    assert.equal(roll.options[0].id, choices[0].id);
  }
});

test('reactive square and optional movement prompts retain pitch instructions and finish command', () => {
  const square = action('reactiveSquare', { x: 13, y: 7 });
  assert.match(matchDecision({ ...live, actions: [square] }, [square])!.instruction!, /highlighted square/);
  const choices = [action('reactionMove', { x: 13, y: 7 }, base.players[1].id), action('reactionEnd')];
  const move = matchDecision({ ...live, actions: choices }, choices)!;
  assert.match(move.instruction!, /Select a player/);
  assert.deepEqual(move.options.map(option => option.id), ['offer:reactionEnd']);
});

test('server offset and monotonic elapsed preserve remaining time across refreshes and remounts', () => {
  const initial = reactionAnchor(reaction, 100);
  assert.equal(reactionSeconds(initial, 100), 30);
  assert.equal(reactionSeconds(initial, 1150), 29);
  const refreshed = reactionAnchor({ ...reaction, serverNow: reaction.serverNow + 8000 }, 8100, initial);
  assert.equal(reactionSeconds(refreshed, 8100), 22);
  const stale = reactionAnchor(reaction, 10100, refreshed);
  assert.equal(reactionSeconds(stale, 10100), 20, 'A stale server snapshot cannot restart the same deadline');
  assert.equal(reactionSeconds(stale, 50_000), 0);
  assert.equal(reactionSeconds(reactionAnchor({ ...reaction, serverNow: reaction.expiresAt }, 0), 0), 0);
});


test('reaction allowance supports future durations and remains bounded on reconnect', () => {
  for (const allowanceMs of [15_000, 60_000]) {
    const timed = { ...reaction, allowanceMs, expiresAt: reaction.serverNow + allowanceMs };
    assert.deepEqual(decodeSetupStateValue({ ...live, reaction: timed }).reaction, timed);
    const anchor = reactionAnchor(timed, 0);
    assert.equal(reactionSeconds(anchor, 0), allowanceMs / 1000);
    const refreshed = reactionAnchor(timed, allowanceMs * .8, anchor);
    assert.equal(reactionSeconds(refreshed, allowanceMs * .8), allowanceMs / 5000);
  }
  for (const allowanceMs of [0, -1, 1.5, null, '30000'])
    assert.throws(() => decodeSetupStateValue({ ...live, reaction: { ...reaction, allowanceMs } }));
});

test('committed legacy Side Step destinations keep their native push commands and reaction timing', () => {
  const push = { ...action('push', { x: 12, y: 7 }), id: '9:push:away1:12:7', label: 'Push to 12, 7' };
  const decision = matchDecision({ ...live, reaction: { ...reaction, title: 'Choose a Sidestep destination' }, actions: [push] }, [push])!;
  assert.equal(decision.kind, 'reaction');
  assert.equal(decision.circular, true);
  assert.equal(decision.pitchSelection?.committed, true);
  assert.equal(decision.pitchSelection?.choices[0].action.id, push.id);
  assert.equal(decision.reaction?.expiresAt, reaction.expiresAt);
  assert.deepEqual(decision.options, [], 'Valid native arrows provide the mandatory square choice');
  const fallback = { ...push, id: 'older-push-format' };
  const fallbackDecision = matchDecision({ ...live, actions: [fallback] }, [fallback])!;
  assert.equal(fallbackDecision.kind, 'reaction');
  assert.equal(fallbackDecision.options[0].id, fallback.id, 'An older projection still offers its exact server command');
});
