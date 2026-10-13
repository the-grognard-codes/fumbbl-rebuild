import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canPlanMovement, matchesMovementPlan } from '../src/movement-interaction.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { MovementPlan, MovementRequest } from '../src/movement-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const movementFrames = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
const view = decodeSetupStateValue(frames[0].actor);
const intent: MovementRequest = { playerId: 'home1', kind: 'move', targetPlayerId: null, waypoints: [{ x: 8, y: 7 }] };
const plan: MovementPlan = { planVersion: 1, kind: 'move', targetPlayerId: null, waypoints: intent.waypoints,
  route: { routeVersion: 3, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8, revision: view.revision, actor: 'home',
    steps: [{ x: 8, y: 7, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] }] } };

test('fresh movement and direct Blitz proposals use only native offers for the selected own player', () => {
  assert.equal(canPlanMovement(view, view.actions, 'home1', 'move'), true);
  assert.equal(canPlanMovement(view, view.actions, 'home1', 'blitz'), true);
  assert.equal(canPlanMovement(view, view.actions, 'away1', 'move'), false);
  assert.equal(canPlanMovement({ ...view, callerRole: 'spectator' }, view.actions, 'home1', 'move'), false);
  assert.equal(canPlanMovement({ ...view, turnMode: 'QUICK_SNAP' }, view.actions, 'home1', 'move'), false);
  assert.equal(canPlanMovement(view, [], 'home1', 'blitz'), false);
});

test('a committed ordinary mover cannot acquire Blitz through an opponent click', () => {
  const active = decodeSetupStateValue(frames[3].actor);
  const moves = active.actions.filter(action => action.kind === 'move');
  assert.equal(canPlanMovement(active, moves, 'home1', 'move'), true);
  assert.equal(canPlanMovement(active, moves, 'home1', 'blitz'), false);
});

test('a selected teammate can plan an offered Foul while another player is active', () => {
  const active = decodeSetupStateValue(movementFrames.moveAcceptedState);
  const teammate = movementFrames.readyState.actions.find((action: { kind: string; sourcePlayerId: string }) =>
    action.kind === 'select' && action.sourcePlayerId !== active.activePlayerId)!;
  const foul = { ...teammate, id: `${teammate.id}-foul`, kind: 'declareFoul' };
  assert.equal(canPlanMovement(active, [foul], teammate.sourcePlayerId!, 'foul'), true);
  assert.equal(canPlanMovement(active, [foul], active.activePlayerId!, 'foul'), false);
  assert.equal(canPlanMovement({ ...active, actor: 'away' }, [foul], teammate.sourcePlayerId!, 'foul'), false);
});

test('an adjacent Foul accepts a reviewed empty approach only for its intended target', () => {
  const foulIntent: MovementRequest = { playerId: 'home1', kind: 'foul', targetPlayerId: 'away1', waypoints: [] };
  const foulPlan: MovementPlan = { ...plan, kind: 'foul', targetPlayerId: 'away1', waypoints: [],
    route: { ...plan.route, steps: [] } };
  assert.equal(matchesMovementPlan(foulPlan, foulIntent, view), true);
  assert.equal(matchesMovementPlan(foulPlan, { ...foulIntent, targetPlayerId: 'away2' }, view), false);
});

test('confirmation rejects stale, foreign, changed-target and changed-waypoint previews', () => {
  assert.equal(matchesMovementPlan(plan, intent, view), true);
  assert.equal(matchesMovementPlan(plan, intent, { ...view, revision: view.revision + 1 }), false);
  assert.equal(matchesMovementPlan(plan, { ...intent, playerId: 'away1' }, view), false);
  assert.equal(matchesMovementPlan(plan, { ...intent, waypoints: [{ x: 9, y: 7 }] }, view), false);
  assert.equal(matchesMovementPlan(plan, { ...intent, kind: 'blitz', targetPlayerId: 'away1' }, view), false);
  assert.equal(matchesMovementPlan({ ...plan, route: { ...plan.route, from: { x: 6, y: 7 } } }, intent, view), false);
});
