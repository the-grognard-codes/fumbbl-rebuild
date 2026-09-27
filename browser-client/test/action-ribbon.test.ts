import assert from 'node:assert/strict';
import test from 'node:test';
import { actionForPlayer, assistedTarget, hasUnactivatedPlayers, moreActions, recentActionLabel } from '../src/action-ribbon.ts';
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
