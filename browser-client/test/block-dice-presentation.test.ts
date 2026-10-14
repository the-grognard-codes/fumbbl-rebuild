import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { potentialBlockDice } from '../src/block-dice-presentation.ts';
import { reportedDice } from '../src/dice-presentation.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeMovementPreview } from '../src/movement-protocol.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const adjacent = fixture.find((frame: { actor: { actions: { kind: string }[] } }) => frame.actor.actions.some(action => action.kind === 'block')).actor;
const action = adjacent.actions.find((action: { kind: string }) => action.kind === 'block');
const playerId = action.sourcePlayerId, targetPlayerId = action.target.playerId;
const roll = { playerId, targetPlayerId, dice: -2 };
const view = decodeSetupStateValue({ ...adjacent, blockPreview: { version: 1, rolls: [roll] } });

test('current native signed counts follow proposals and disappear when cancelled or changed', () => {
  for (const dice of [1, 2, 3, -2, -3]) {
    const current = { ...view, blockPreview: { version: 1 as const, rolls: [{ ...roll, dice }] } };
    assert.deepEqual(potentialBlockDice(current, playerId, targetPlayerId, action, null), { dice, targetPlayerId });
    assert.equal(potentialBlockDice(current, playerId, '', undefined, null), null);
    assert.equal(potentialBlockDice(current, 'other-player', targetPlayerId, action, null), null);
    assert.equal(potentialBlockDice({ ...current, callerRole: 'spectator' }, playerId, targetPlayerId, action, null), null);
    const declaration = { ...action, kind: 'selectBlock', target: { playerId } };
    assert.deepEqual(potentialBlockDice(current, playerId, targetPlayerId, declaration, null), { dice, targetPlayerId });
    assert.equal(potentialBlockDice(current, playerId, 'other-target', declaration, null), null);
  }
});

test('block forecast decoding rejects impossible counts, duplicate pairs and nonadjacent targets', () => {
  for (const dice of [0, -1, 4, 1.5, '2']) assert.throws(() => decodeSetupStateValue({ ...adjacent,
    blockPreview: { version: 1, rolls: [{ ...roll, dice }] } }));
  assert.throws(() => decodeSetupStateValue({ ...adjacent, blockPreview: { version: 1, rolls: [roll, roll] } }));
  assert.throws(() => decodeSetupStateValue({ ...adjacent, blockPreview: { version: 1, rolls: [{ ...roll, targetPlayerId: 'missing' }] } }));
  assert.throws(() => decodeSetupStateValue({ ...fixture[0].actor, blockPreview: { version: 1, rolls: [roll] } }));
  assert.doesNotThrow(() => decodeSetupStateValue(adjacent));
});

test('blitz uses the current endpoint forecast and rejects stale plans', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
  const response = { ...fixture.blitzPlan, plan: { ...fixture.blitzPlan.plan, blockDice: -3 } };
  const plan = decodeMovementPreview(JSON.stringify(response)).plan;
  const current = decodeSetupStateValue(fixture.blitzReadyState);
  assert.deepEqual(potentialBlockDice(current, plan.route.playerId, plan.targetPlayerId!, undefined, plan),
    { dice: -3, targetPlayerId: plan.targetPlayerId });
  assert.equal(potentialBlockDice({ ...current, revision: current.revision + 1 }, plan.route.playerId, plan.targetPlayerId!, undefined, plan), null);
  assert.equal(potentialBlockDice(current, plan.route.playerId, 'other-target', undefined, plan), null);
  for (const dice of [0, -1, 4, '2']) assert.throws(() => decodeMovementPreview(JSON.stringify({ ...response, plan: { ...plan, blockDice: dice } })));
  assert.throws(() => decodeMovementPreview(JSON.stringify({ ...fixture.movePlan, plan: { ...fixture.movePlan.plan, blockDice: 2 } })));
});

test('native block chooser determines uphill glow for either coach and all report types', () => {
  for (const reportId of ['blockRoll', 'blockReRoll', 'blockChoice']) for (const role of ['home', 'away'] as const) {
    const players = view.players.map(player => player.id === playerId ? { ...player, role } : player);
    for (const count of [1, 2, 3]) {
      const report = { reportId, blockRoll: Array(count).fill(6), logBlock: { attackerId: playerId, chooser: role === 'home' ? 'away' : 'home' } };
      assert.equal(reportedDice(report, players)?.uphill, count > 1);
      assert.equal(reportedDice({ ...report, logBlock: { attackerId: playerId, chooser: role } }, players)?.uphill, false);
    }
  }
});
