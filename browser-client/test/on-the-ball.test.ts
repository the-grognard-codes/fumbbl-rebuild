import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { matchDecision } from '../src/match-decision.ts';
import { canPlanMovement } from '../src/movement-interaction.ts';
import { skillPromptOptions } from '../src/skill-prompt-options.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeMovementPreview } from '../src/movement-protocol.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const base: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const playerId = base.players.find(player => player.role === 'home')!.id;
const action = (kind: string, id: string, label: string, sourcePlayerId: string | null = playerId): SetupAction =>
  ({ kind, id, label, actor: 'home', sourcePlayerId, target: null });
const reaction = { id: 'on-ball', actor: 'home' as const, title: 'On the Ball', serverNow: 1000, expiresAt: 31000 };
const selection: SetupState = { ...base, phase: 'PLAY', actor: 'home', callerRole: 'home', turnMode: 'PASS_BLOCK',
  activePlayerId: null, activePlayerAction: undefined, reaction,
  actions: [action('onTheBall', '1:reaction-select:home1', 'Use On the Ball with Helis'),
    action('reactionEnd', '1:reaction-stop', 'Decline On the Ball', null)] };
const moving: SetupState = { ...selection, activePlayerId: playerId, activePlayerAction: 'move', actions: [
  { ...action('reactionMove', '2:reaction-move:8:7', 'Move to 8, 7'), target: { x: 8, y: 7 } },
  action('reactionEndPlayer', '2:reaction-end-player', "Finish this player's movement"),
  action('reactionEnd', '2:reaction-stop', 'Finish On the Ball movement', null)] };

test('On the Ball selection uses the shared circular Yes/No prompt with exact native IDs', () => {
  const decision = matchDecision(selection, selection.actions)!;
  assert.equal(decision.circular, true);
  const options = skillPromptOptions(decision);
  assert.equal(options.choices[0].id, selection.actions[0].id);
  assert.equal(options.choices[0].sourcePlayerId, playerId);
  assert.equal(options.decline?.id, selection.actions[1].id);
  assert.equal(matchDecision({ ...selection, callerRole: 'spectator' }, selection.actions), null);
});

test('accepted On the Ball opens only the active player for planned movement and keeps checks modal', () => {
  for (const turnMode of ['PASS_BLOCK', 'KICKOFF_RETURN']) {
    const state = { ...moving, turnMode };
    assert.equal(matchDecision(state, state.actions), null, 'Movement must not be trapped in a reaction dialog');
    assert.equal(canPlanMovement(state, state.actions, playerId, 'move'), true);
    for (const kind of ['blitz', 'foul', 'pass', 'handOff'] as const)
      assert.equal(canPlanMovement(state, state.actions, playerId, kind), false);
    assert.equal(canPlanMovement({ ...state, callerRole: 'away' }, state.actions, playerId, 'move'), false);
    assert.equal(canPlanMovement({ ...state, callerRole: 'spectator' }, state.actions, playerId, 'move'), false);
    const reroll = [action('reroll', '3:reroll:none', 'Keep the roll')];
    assert.equal(matchDecision(state, reroll)?.circular, true);
    assert.equal(canPlanMovement(state, reroll, playerId, 'move'), false);
  }
  assert.equal(canPlanMovement(selection, selection.actions, playerId, 'move'), false);
});

test('captured native kickoff and pass contracts decode into circular offers and a three-square plan', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/roundup5-onball-contracts.json', import.meta.url), 'utf8'));
  for (const fixture of Object.values(fixtures) as { selection: unknown; active: unknown; plan: unknown }[]) {
    const offered = decodeSetupStateValue(fixture.selection);
    const active = decodeSetupStateValue(fixture.active);
    const plan = decodeMovementPreview(JSON.stringify({ version: 2, type: 'movementPreview', code: 'ACCEPTED',
      requestId: 'onball-preview', matchId: active.matchId, plan: fixture.plan })).plan;
    assert.equal(matchDecision(offered, offered.actions)?.circular, true);
    assert.equal(matchDecision(active, active.actions), null);
    assert.equal(canPlanMovement(active, active.actions, plan.route.playerId, 'move'), true);
    assert.equal(plan.waypoints.length, 1);
    assert.equal(plan.route.steps.length, 3);
    assert.equal(plan.route.remaining, 3);
    if (active.movementForecast) assert.throws(() => decodeSetupStateValue({ ...active, turnMode: 'REGULAR' }),
      /Unavailable movement forecast/, 'Reaction forecasts remain limited to On the Ball');
  }
});
