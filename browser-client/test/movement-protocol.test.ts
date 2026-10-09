import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeMovementPreview, decodeMovementRange } from '../src/movement-protocol.ts';

const step = { x: 8, y: 7, dodge: 3, rush: 2, dodgeModifier: -1, reactions: [], checks: [] };
const envelope = { version: 2, requestId: 'movement-1', code: 'ACCEPTED', matchId: '12345678-1234-1234-1234-123456789abc' };
const range = { rangeVersion: 1, playerId: 'home1', from: { x: 7, y: 7 }, remaining: 8, steps: [step], revision: 4 };
const route = { routeVersion: 3, playerId: 'home1', from: range.from, remaining: 8, steps: [step], revision: 4, actor: 'home' };
const plan = { planVersion: 1, kind: 'move', targetPlayerId: null, waypoints: [{ x: 8, y: 7 }], route };

test('all exported native movement ranges and plans satisfy the reviewed wire contract', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
  for (const value of Object.values(fixture)) {
    if (!value || typeof value !== 'object') continue;
    if ('type' in value && value.type === 'movementRange') decodeMovementRange(JSON.stringify(value));
    if ('type' in value && value.type === 'movementPreview') decodeMovementPreview(JSON.stringify(value));
  }
  for (const [readyKey, planKey] of [['readyState', 'movePlan'], ['blitzReadyState', 'blitzPlan'],
    ['distantMoveReadyState', 'distantMovePlan'], ['distantBlitzReadyState', 'distantBlitzPlan']]) {
    const ready = fixture[readyKey], plan = fixture[planKey].plan;
    assert.equal(ready.callerRole, plan.route.actor, 'Each native journey is projected for its acting coach');
    assert.equal(ready.actor, plan.route.actor);
    assert.equal(ready.revision, plan.route.revision);
    const player = ready.players.find(player => player.id === plan.route.playerId);
    assert.equal(player.role, ready.callerRole);
    assert.deepEqual({ x: player.x, y: player.y }, plan.route.from);
  }
});

test('full range accepts zero allowance but rejects duplicate, unreachable and private squares', () => {
  const response = { ...envelope, type: 'movementRange', range };
  assert.equal(decodeMovementRange(JSON.stringify(response)).range.steps[0].rush, 2);
  assert.deepEqual(decodeMovementRange(JSON.stringify({ ...response, range: { ...range, remaining: 0, steps: [] } })).range.steps, []);
  for (const invalid of [
    { ...range, steps: [step, step] }, { ...range, remaining: 0 },
    { ...range, steps: [{ ...step, x: 7 }] }, { ...range, steps: [{ ...step, x: 25 }] },
    { ...range, steps: [{ ...step, hiddenRoll: 6 }] }, { ...range, hiddenSkillState: [] },
  ]) assert.throws(() => decodeMovementRange(JSON.stringify({ ...response, range: invalid })));
  assert.throws(() => decodeMovementRange(JSON.stringify({ ...response, privateAccount: 'secret' })));
});

test('a reviewed Move requires a legal contiguous path containing each waypoint in order', () => {
  const response = { ...envelope, type: 'movementPreview', plan };
  assert.equal(decodeMovementPreview(JSON.stringify(response)).plan.route.steps[0].dodge, 3);
  for (const invalid of [
    { ...plan, targetPlayerId: 'away1' }, { ...plan, waypoints: [] },
    { ...plan, waypoints: [{ x: 7, y: 6 }, { x: 8, y: 7 }] },
    { ...plan, route: { ...route, steps: [{ ...step, x: 9 }] } },
    { ...plan, route: { ...route, remaining: 0 } },
  ]) assert.throws(() => decodeMovementPreview(JSON.stringify({ ...response, plan: invalid })));
});

test('an adjacent Blitz can review a zero-step path without permitting an empty ordinary Move', () => {
  const zero = { ...plan, kind: 'blitz', targetPlayerId: 'away1', waypoints: [], route: { ...route, steps: [] } };
  assert.equal(decodeMovementPreview(JSON.stringify({ ...envelope, type: 'movementPreview', plan: zero })).plan.route.steps.length, 0);
  assert.throws(() => decodeMovementPreview(JSON.stringify({ ...envelope, type: 'movementPreview', plan: { ...zero, kind: 'move', targetPlayerId: null } })));
  assert.throws(() => decodeMovementPreview(JSON.stringify({ ...envelope, type: 'movementPreview', plan: { ...zero, targetPlayerId: 'home1' } })));
});
