import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { failedRerollGate, playbackBeats } from '../src/pitch-playback.ts';
import { DiceStream } from '../src/dice-stream.ts';
import type { DiceMoment } from '../src/dice-presentation.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

const state = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const block = { reportId: 'blockRoll', blockRoll: [1, 6], defenderId: state.players[0].id };
const record = (reports: Record<string, unknown>[]): TranscriptRecord => ({ index: 1, revision: 1, kind: 'action', actor: 'home', at: 1, decision: null,
  native: [{ reportList: { reports } }], state });

test('failed conditional rerolls suppress only subsequent repeated block reports, never actual same-face rerolls', () => {
  for (const reRollSource of ['Pro', 'Pro (3+)', 'Loner']) {
    const gate = { reportId: 'reRoll', reRollSource, successful: false, roll: 1 };
    const failed = record([block, gate, block]);
    assert.equal(failedRerollGate(failed), true);
    assert.deepEqual(playbackBeats(failed).filter(beat => beat.kind === 'dice').map(beat => beat.dice.reportId), ['blockRoll', 'reRoll']);
    const actual = record([gate, { ...block, reportId: 'blockReRoll', reRolled: true }]);
    assert.equal(failedRerollGate(actual), false);
    assert.deepEqual(playbackBeats(actual).filter(beat => beat.kind === 'dice').map(beat => beat.dice.reportId), ['reRoll', 'blockReRoll']);
    assert.equal(failedRerollGate(record([{ ...gate, successful: true }, block])), false);
  }
});

test('a failed gate preserves original group identity through recovery and priority changes until the choice resolves', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let shown: DiceMoment | null = null;
  const current = () => shown as DiceMoment | null;
  const stream = new DiceStream(moment => { shown = moment; });
  const original: DiceMoment = { label: 'Block', faces: ['SKULL', 'POW'], selected: null, subjectId: 'target' };
  stream.enqueue(original, 'block', true, true);
  const first = current()!.groups![0];
  stream.enqueue({ label: 'Loner', faces: ['1'], selected: null, subjectId: 'actor', rollKey: 'test:1' }, 'block:opponent', true, false, 1, false, true);
  assert.equal(current()!.groups![0], first);
  assert.deepEqual(current()!.groups!.map(group => group.faces), [['SKULL', 'POW'], ['1']]);
  context.mock.timers.tick(10000);
  assert.equal(current()!.groups![0], first);
  stream.release();
  context.mock.timers.tick(1000);
  assert.equal(current(), null);
});

test('failed Pro remains in effect across a separate decline, but resets for an actual roll or new activation', () => {
  const first = record([block]);
  first.revision = 0;
  const failed = record([{ reportId: 'reRoll', reRollSource: 'Pro', successful: false, roll: 1 }]);
  const decline = record([block]);
  decline.revision = 2;
  const history = [first, failed, decline];
  assert.equal(failedRerollGate(decline, history), true);
  assert.equal(playbackBeats(decline, undefined, failedRerollGate(failed, history)).filter(beat => beat.kind === 'dice').length, 0);
  const reroll = record([{ reportId: 'block' }, block]);
  reroll.revision = 3;
  assert.equal(failedRerollGate(reroll, history), false);
  assert.equal(playbackBeats(reroll, undefined, true).filter(beat => beat.kind === 'dice').length, 1);
  const next = { ...decline, state: { ...state, activePlayerId: 'next-player' } };
  assert.equal(failedRerollGate(next, history), false);
});
