import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { reportedDice, dieRollKey } from '../src/dice-presentation.ts';
import { DiceStream } from '../src/dice-stream.ts';
import type { DiceMoment } from '../src/dice-presentation.ts';
import { DICE_ENTRANCE_MS, DICE_RETENTION_MS, DICE_EXIT_MS, DICE_GROUP_INTERVAL_MS } from '../src/presentation-timing.ts';
import { kickoffPlacementTarget } from '../src/kickoff-ball-presentation.ts';
import { pitchPuntChoices } from '../src/push-choice.ts';
import { matchDecision } from '../src/match-decision.ts';
import type { SetupState, SetupAction } from '../src/setup-protocol.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

const base: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
test('only authoritative successful movement checks bypass dice cadence', () => {
  for (const reportId of ['dodgeRoll', 'goForItRoll', 'pickUpRoll']) {
    assert.equal(reportedDice({ reportId, roll: 4, successful: true })?.continuous, true);
    assert.equal(reportedDice({ reportId, roll: 4, successful: false })?.continuous, undefined);
    assert.equal(reportedDice({ reportId, roll: 4 })?.continuous, undefined);
  }
  assert.equal(reportedDice({ reportId: 'blockRoll', blockRoll: [6] })?.continuous, undefined);
});
test('weather uses the shared entrance, retention, and exit timing when unpinned', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = (): DiceMoment | null => shown;
  const weather = reportedDice({ reportId: 'weather', weatherRoll: [3, 4] })!;
  stream.enqueue(weather, 'kickoff');
  context.mock.timers.tick(DICE_ENTRANCE_MS + DICE_RETENTION_MS - 1);
  assert.equal(current()?.groups?.[0].exiting, undefined);
  context.mock.timers.tick(1);
  assert.equal(current()?.groups?.[0].exiting, true);
  context.mock.timers.tick(DICE_EXIT_MS);
  assert.equal(current(), null);
});
test('weather remains pinned for a pending choice and static recovery until released or replaced', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = (): DiceMoment | null => shown;
  const weather = reportedDice({ reportId: 'weather', weatherRoll: [3, 4] })!;
  stream.enqueue(weather, 'kickoff', true);
  context.mock.timers.tick(30000);
  assert.deepEqual(current()?.faces, ['3', '4']);
  stream.release();
  assert.equal(current()?.groups?.[0].exiting, true);
  context.mock.timers.tick(DICE_EXIT_MS);
  assert.equal(current(), null);
  stream.enqueue(weather, 'kickoff', true, true);
  context.mock.timers.tick(30000);
  assert.deepEqual(current()?.faces, ['3', '4']);
  assert.equal(current()?.static, true);
  assert.equal(current()?.rollKey, undefined);
  stream.enqueue(reportedDice({ reportId: 'blockRoll', blockRoll: [6] })!, 'kickoff');
  assert.deepEqual(current()?.faces, ['POW']);
  stream.clear();
});
test('weather and the following ordinary roll retain shared queue ordering', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const faces = () => shown?.faces;
  stream.enqueue(reportedDice({ reportId: 'weather', weatherRoll: [3, 4] })!, 'action');
  context.mock.timers.tick(200);
  stream.enqueue(reportedDice({ reportId: 'blockRoll', blockRoll: [6] })!, 'action');
  assert.deepEqual(faces(), ['3', '4']);
  context.mock.timers.tick(DICE_GROUP_INTERVAL_MS - 200);
  assert.deepEqual(faces(), ['3', '4', 'POW']);
  context.mock.timers.tick(DICE_ENTRANCE_MS + DICE_RETENTION_MS + DICE_EXIT_MS - DICE_GROUP_INTERVAL_MS);
  assert.deepEqual(faces(), ['POW']);
  stream.clear();
});
test('consecutive successful checks bypass the stream queue', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const faces = () => shown?.faces;
  stream.enqueue(reportedDice({ reportId: 'dodgeRoll', roll: 5, successful: true })!, 'action');
  assert.deepEqual(faces(), ['5']);
  context.mock.timers.tick(200);
  stream.enqueue(reportedDice({ reportId: 'goForItRoll', roll: 6, successful: true })!, 'action');
  assert.deepEqual(faces(), ['6']);
  context.mock.timers.tick(3000);
  assert.equal(shown, null);
});
test('partial same-face rerolls use native indexes, while full rolls animate all dice', () => {
  const partial = { ...reportedDice({ reportId: 'blockReRoll', blockRoll: [1, 3, 6], rerolledIndexes: [1] })!, rollKey: 'reroll' };
  assert.deepEqual([0, 1, 2].map(index => dieRollKey(partial, index)), [undefined, 'reroll', undefined]);
  const full = { ...reportedDice({ reportId: 'blockReRoll', blockRoll: [1, 3, 6] })!, rollKey: 'full' };
  assert.deepEqual([0, 1, 2].map(index => dieRollKey(full, index)), ['full', 'full', 'full']);
});
test('kick placement belongs only to the placing coach and phase, including pinned previews', () => {
  const action: SetupAction = { id: 'kick', kind: 'kickoff', label: 'Place kick', actor: 'home', target: { x: 18, y: 7 } };
  const view: SetupState = { ...base, actor: 'home', phase: 'READY_FOR_KICKOFF', callerRole: 'home' };
  assert.deepEqual(kickoffPlacementTarget(view, [action], undefined, { x: 18, y: 7 }), action.target);
  for (const callerRole of ['away', 'spectator'] as const)
    assert.equal(kickoffPlacementTarget({ ...view, callerRole }, [action], action, { x: 18, y: 7 }), null);
  assert.equal(kickoffPlacementTarget({ ...view, phase: 'PLAY' }, [action], action, null), null);
  assert.equal(kickoffPlacementTarget(view, [action], undefined, { x: 17, y: 7 }), null);
});
test('Punt uses cardinal arrows relative to the planned endpoint without changing native action targets', () => {
  const player = { ...base.players[0], role: 'home' as const, x: 7, y: 7 };
  const actions: SetupAction[] = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy], index) => ({
    id: String(index), kind: 'puntDirection', label: 'Punt', actor: 'home', sourcePlayerId: player.id,
    target: { x: player.x + dx, y: player.y + dy }
  }));
  const view: SetupState = { ...base, phase: 'PLAY', callerRole: 'home', actor: 'home', players: [player] };
  assert.deepEqual(pitchPuntChoices(view, actions, player.id, { x: 10, y: 7 }).map(choice => [choice.x, choice.y]),
    [[10, 6], [11, 7], [10, 8], [9, 7]]);
  assert.deepEqual(actions[0].target, { x: 7, y: 6 });
  assert.deepEqual(pitchPuntChoices({ ...view, callerRole: 'away' }, actions, player.id), []);
});
test('Pile Driver presents both native decisions to its coach', () => {
  const actions: SetupAction[] = ['Use Pile Driver', 'Decline Pile Driver'].map((label, index) => ({
    id: String(index), kind: 'pileDriver', label, actor: 'home', target: null
  }));
  const view: SetupState = { ...base, callerRole: 'home', prompt: null, actions };
  const decision = matchDecision(view, actions);
  assert.equal(decision?.title, 'Use Pile Driver?');
  assert.equal(decision?.circular, true);
  assert.equal(decision?.options.length, 2);
  assert.equal(matchDecision({ ...view, callerRole: 'away' }, actions), null);
});

test('Punt permits exactly one cardinal exterior square while other actions remain on pitch', () => {
  const player = { ...base.players[0], x: 0, y: 7 };
  const action: SetupAction = { id: 'punt', kind: 'puntDirection', actor: player.role, sourcePlayerId: player.id,
    label: 'Punt west', target: { x: -1, y: 7 } };
  const view = { ...base, projectionVersion: 4, players: base.players.map(value => value.id === player.id ? player : value),
    actions: [action] };
  assert.equal(decodeSetupStateValue(view).actions[0].kind, 'puntDirection');
  assert.throws(() => decodeSetupStateValue({ ...view, actions: [{ ...action, kind: 'move' }] }));
  assert.throws(() => decodeSetupStateValue({ ...view, actions: [{ ...action, target: { x: -1, y: 6 } }] }));
  assert.throws(() => decodeSetupStateValue({ ...view, actions: [{ ...action, target: { x: -2, y: 7 } }] }));
});
