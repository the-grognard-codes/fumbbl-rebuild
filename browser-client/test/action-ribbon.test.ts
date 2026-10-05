import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { actionForPlayer, assistedTarget, hasUnactivatedPlayers, moreActions, passTargetForPlayer, recentActionLabel } from '../src/action-ribbon.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { SetupAction } from '../src/setup-protocol.ts';

const action = (kind: string, sourcePlayerId: string | null, target: SetupAction['target'] = null): SetupAction =>
  ({ id: `${kind}-${sourcePlayerId}`, label: kind, actor: 'home', kind, target, sourcePlayerId });

test('ribbon offers only this player’s server-issued uncommon declarations', () => {
  const offered = [action('select', 'p1'), action('selectBlock', 'p1'), action('blitz', 'p1'), action('declareFoul', 'p1'),
    action('declarePass', 'p1'), action('declareFoul', 'p2'), action('endTurn', null), action('blockDie', 'p1')];
  assert.equal(actionForPlayer(offered, 'p1', 'selectBlock')?.id, 'selectBlock-p1');
  assert.deepEqual(moreActions(offered, 'p1').map(item => item.kind), ['declareFoul', 'declarePass']);
  assert.deepEqual(moreActions(offered, 'p2').map(item => item.kind), ['declareFoul']);
  assert.deepEqual(moreActions([action('block', 'p1', { playerId: 'opponent' }), action('blockStab', 'p1', { playerId: 'opponent' })], 'p1')
    .map(item => item.kind), ['blockStab']);
  assert.deepEqual(moreActions(offered, ''), []);
  assert.equal(hasUnactivatedPlayers(offered), true);
  assert.equal(hasUnactivatedPlayers([action('endTurn', null)]), false);
  assert.equal(recentActionLabel(action('declareThrowTeamMate', 'p1')), 'Throw Team Mate');
});

test('target assist never invents an action or silently selects an adjacent Blitz', () => {
  const block = action('block', 'p1', { playerId: 'opponent' });
  const blitz = action('blitzTarget', 'p1', { playerId: 'opponent' });
  assert.equal(assistedTarget([blitz], false), undefined);
  assert.equal(assistedTarget([block, blitz], false), block);
  assert.equal(assistedTarget([blitz], true), blitz);
  assert.equal(assistedTarget([action('move', 'p1', { x: 8, y: 7 })], false)?.kind, 'move');
  assert.equal(assistedTarget([], true), undefined);
});

test('recipient clicks resolve only an offered square for the active passer and trusted actor', () => {
  const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-workflow.json', import.meta.url), 'utf8'));
  for (const role of ['home', 'away']) {
    const journey = journeys.find((item: { role: string; mode: string }) => item.role === role && item.mode === 'stationary');
    const view = decodeSetupStateValue(journey.frames[1].actor);
    const selected = passTargetForPlayer(view, view.actions, 'actor', 'mate');
    assert.ok(selected?.id.endsWith('pass-14-7'));
    assert.equal(selected?.sourcePlayerId, 'actor');
    assert.equal(passTargetForPlayer(view, [], 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer(view, view.actions, 'mate', 'actor'), undefined);
    assert.equal(passTargetForPlayer(view, view.actions, 'actor', 'actor'), undefined);
    assert.equal(passTargetForPlayer({ ...view, callerRole: 'spectator' }, view.actions, 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer({ ...view, actor: role === 'home' ? 'away' : 'home' }, view.actions, 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer({ ...view, phase: 'SETUP' }, view.actions, 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer({ ...view, activePlayerId: null }, view.actions, 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer({ ...view, players: view.players.map(player => player.id === 'mate' ? { ...player, x: 25, y: 14 } : player) }, view.actions, 'actor', 'mate'), undefined);
    assert.equal(passTargetForPlayer({ ...view, players: view.players.map(player => player.id === 'mate' ? { ...player, x: null, y: null, offPitch: 'reserve' } : player) }, view.actions, 'actor', 'mate'), undefined);
    const pickup = journeys.find((item: { role: string; mode: string }) => item.role === role && item.mode === 'pickup');
    const looseBall = decodeSetupStateValue(pickup.frames[1].actor);
    assert.equal(passTargetForPlayer(looseBall, looseBall.actions, 'actor', 'mate'), undefined);
  }
});
