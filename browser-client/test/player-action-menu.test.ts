import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { activeMenuAction, endTurnNeedsConfirmation, isEndTurnShortcut, playerActionMenu } from '../src/player-action-menu.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor as SetupState;
const playerId = base.players.find(player => player.role === base.callerRole)!.id;
const action = (kind: string, sourcePlayerId: string | null = playerId): SetupAction =>
  ({ id: kind, kind, label: kind, actor: base.actor, sourcePlayerId, target: null });

test('theoretical actions survive consumption without granting executable actions', () => {
  const view: SetupState = { ...base, actions: [action('select'), action('declarePass')],
    playerActionMenu: [
      { playerId, kind: 'select', spent: false }, { playerId, kind: 'selectBlock', spent: false },
      { playerId, kind: 'blitz', spent: true }, { playerId, kind: 'declarePass', spent: false },
      { playerId, kind: 'declareHandOff', spent: true },
    ] };
  const menu = playerActionMenu(view, playerId);
  assert.deepEqual(menu.map(item => item.key), ['move', 'block', 'blitz', 'handOff', 'pass']);
  assert.equal(menu.find(item => item.key === 'blitz')?.spent, true);
  assert.deepEqual(menu.find(item => item.key === 'blitz')?.actions, []);
  assert.equal(menu.find(item => item.key === 'pass')?.actions[0].id, 'declarePass');
  assert.ok(!menu.some(item => item.key === 'chainsaw'));
  assert.deepEqual(playerActionMenu({ ...view, callerRole: 'spectator' }, playerId), []);
  assert.deepEqual(playerActionMenu({ ...view, phase: 'SETUP' }, playerId), []);
});

test('special declaration and targeting commands share icons while star abilities share the star glyph', () => {
  const view = { ...base, actions: [action('declareChainsaw'), action('blockChainsaw'), action('declareBomb'),
    action('declareThrowTeamMate'), action('declareKickTeamMate'), action('declareTreacherous'), action('endAction')] };
  const menu = playerActionMenu(view, playerId);
  assert.equal(menu.find(item => item.key === 'chainsaw')?.actions.length, 2);
  assert.deepEqual(menu.map(item => item.icon), ['chainsaw', 'bomb', 'throwMate', 'kickMate', 'star', 'end']);
});

test('confirmation considers declarations and forgo, but not the active player ending an activation', () => {
  assert.equal(endTurnNeedsConfirmation([action('endTurn', null), action('endAction')]), false);
  for (const kind of ['select', 'stand', 'selectBlock', 'blitz', 'declarePass', 'forgo']) {
    assert.equal(endTurnNeedsConfirmation([action(kind)]), true, kind);
  }
});

test('only an unmodified, initial Backspace triggers end turn', () => {
  const event = { key: 'Backspace', repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  assert.equal(isEndTurnShortcut(event), true);
  for (const key of ['repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) assert.equal(isEndTurnShortcut({ ...event, [key]: true }), false);
  assert.equal(isEndTurnShortcut({ ...event, key: 'Delete' }), false);
});

test('selection follows the native declaration across revisions and stays with its player', () => {
  const view = { ...base, activePlayerId: playerId, activePlayerAction: 'passMove' };
  assert.equal(activeMenuAction(view, playerId), 'pass');
  assert.equal(activeMenuAction({ ...view, activePlayerAction: 'handOverMove' }, playerId), 'handOff');
  assert.equal(activeMenuAction(view, 'someone-else'), null);
  assert.equal(activeMenuAction({ ...view, activePlayerAction: 'treacherous' }, playerId), 'declareTreacherous');
  assert.throws(() => decodeSetupStateValue({ ...view, activePlayerId: null }));
});

test('native contextual controls retain access without the Other action disclosure', () => {
  const menu = playerActionMenu({ ...base, actions: ['jumpMode', 'puntNow', 'foulChainsaw', 'multiBlock'].map(kind => action(kind)) }, playerId);
  assert.deepEqual(menu.map(item => item.key), ['chainsaw', 'multipleBlock', 'punt', 'jump']);
  assert.equal(menu.flatMap(item => item.actions).length, 4);
});

test('v4 menu metadata rejects unknown players, duplicate entries and malformed flags', () => {
  const view = { ...base, playerActionMenu: [{ playerId, kind: 'blitz', spent: true }] };
  assert.equal(decodeSetupStateValue(view).playerActionMenu?.[0].spent, true);
  for (const entry of [{ playerId: 'unknown', kind: 'blitz', spent: true }, { playerId, kind: 'blitz', spent: 'yes' }]) {
    assert.throws(() => decodeSetupStateValue({ ...base, playerActionMenu: [entry] }));
  }
  assert.throws(() => decodeSetupStateValue({ ...view, playerActionMenu: [...view.playerActionMenu, ...view.playerActionMenu] }));
});
