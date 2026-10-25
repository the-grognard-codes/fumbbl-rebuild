import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MultipleBlockDiceReveals } from '../src/multiple-block-dice.ts';
import { offeredBlockDice } from '../src/dice-presentation.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/block-visibility-multiple.json', import.meta.url), 'utf8'));
const view: SetupState = fixture.rolled;

test('only later selection echoes of already revealed Multiple Block rolls are suppressed', () => {
  const reveals = new MultipleBlockDiceReveals();
  reveals.update(view);
  const offered = offeredBlockDice(view)!;
  const choice = { ...offered, selected: 0 };
  assert.equal(reveals.allows(choice, view), true, 'Transcript-only replay still shows its native result');
  reveals.remember(offered, view);
  assert.equal(reveals.allows(choice, view), false, 'The deferred report cannot present the same target roll again');
  const reroll = { ...offered, faces: ['POW', 'SKULL'] };
  assert.equal(reveals.allows(reroll, view), true, 'A newly rolled result remains visible');
  assert.equal(reveals.allows(offered, view), true, 'A true reroll with identical faces remains visible');
  reveals.remember(reroll, view);
  assert.equal(reveals.allows({ ...reroll, selected: 1 }, view), false);
  assert.equal(reveals.allows({ ...choice, subjectId: view.blockContext!.blocks[1].targetPlayerId }, view), true,
    'An unseen second target is not suppressed even when its faces match');
});

test('reconnect, replay seek, later activations and unrelated blocks retain their own outcomes', () => {
  const reveals = new MultipleBlockDiceReveals();
  reveals.update(view);
  const offered = offeredBlockDice(view)!;
  const choice = { ...offered, selected: 0 };
  reveals.remember(offered, view);
  const ordinary = { ...view, activePlayerAction: 'block' };
  reveals.update(ordinary);
  assert.equal(reveals.allows(choice, ordinary), true, 'An unrelated normal block against the same defender is visible');
  assert.equal(reveals.allows(choice, { ...ordinary, revision: ordinary.revision + 1, activePlayerAction: undefined }), true,
    'A later completed normal block is outside the earlier Multiple Block lifetime');
  reveals.update(view);
  assert.equal(reveals.allows(choice, view), true, 'A later Multiple Block activation has fresh reveal history');
  reveals.remember(offered, view);
  const laterTurn = { ...view, homeTurn: view.homeTurn + 1 };
  reveals.update(laterTurn);
  assert.equal(reveals.allows(choice, laterTurn), true);
  reveals.remember(offered, laterTurn);
  reveals.reset(); reveals.update(laterTurn);
  assert.equal(reveals.allows(choice, laterTurn), true, 'Reconnect or replay seek cannot inherit stale suppression');
});

test('a finishing turnover retains echo suppression when the accepted state has already advanced turns', () => {
  const reveals = new MultipleBlockDiceReveals();
  reveals.update(view);
  const offered = offeredBlockDice(view)!;
  reveals.remember(offered, view);
  const finished = { ...view, revision: view.revision + 3, activePlayerId: null, activePlayerAction: undefined,
    awayTurn: view.awayTurn + 1, actor: 'away' as const, blockContext: undefined };
  reveals.update(finished);
  assert.equal(reveals.allows({ ...offered, selected: 0 }, finished), false,
    'Native block context identifies the previous attacker even after the turn counters advance');
  assert.equal(reveals.allows({ ...offered, selected: 0 }, { ...finished, revision: finished.revision + 1 }), true,
    'The finishing allowance cannot suppress a later unrelated result');
});
