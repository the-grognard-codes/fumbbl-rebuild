import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DiceStream } from '../src/dice-stream.ts';
import { diceRollGroups } from '../src/dice-presentation.ts';
import type { DiceMoment } from '../src/dice-presentation.ts';

const roll = (face: string, label = 'Dodge'): DiceMoment => ({ label, faces: [face], subjectId: 'runner',
  selected: null, rollKey: `native:${face}`, rolls: [{ kind: 'd6', face, label }] });

test('only contiguous native groups are simultaneous, including mixed casualty dice', () => {
  const moment: DiceMoment = { label: 'Armour; Injury; Casualty', faces: ['6', '5', '4', '3', '2', '1'],
    subjectId: 'victim', selected: null, rolls: [
      { label: 'Armour', kind: 'd6', face: '6' }, { label: 'Armour', kind: 'd6', face: '5' },
      { label: 'Injury', kind: 'd6', face: '4' }, { label: 'Injury', kind: 'd6', face: '3' },
      { label: 'Casualty', kind: 'd16', face: '2' }, { label: 'Casualty', kind: 'd6', face: '1' }
    ] };
  assert.deepEqual(diceRollGroups(moment).map(group => [group.label, group.faces]), [
    ['Armour', ['6', '5']], ['Injury', ['4', '3']], ['Casualty', ['2', '1']]
  ]);
  assert.equal(moment.faces.length, 6, 'Grouping does not mutate the native report');
  const block = { ...roll('POW'), rolls: undefined };
  assert.deepEqual(diceRollGroups(block), [block]);
});

test('adjacent native reports stream and expire independently with stable identity', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = () => shown as DiceMoment | null;
  stream.enqueue(roll('5'), 'action');
  const firstKey = current()!.groups![0].key;
  context.mock.timers.tick(100);
  stream.enqueue(roll('4'), 'action');
  stream.enqueue(roll('3', 'Rush'), 'action');
  assert.deepEqual(current()?.faces, ['5']);
  context.mock.timers.tick(400);
  assert.deepEqual(current()?.faces, ['5', '4']);
  assert.equal(current()?.groups?.[0].key, firstKey);
  const second = current()!.groups![1];
  context.mock.timers.tick(500);
  assert.deepEqual(current()?.faces, ['5', '4', '3']);
  assert.deepEqual(current()?.groups?.map(group => group.rollKey), ['native:5', 'native:4', 'native:3']);
  context.mock.timers.tick(200);
  assert.deepEqual(current()?.faces, ['4', '3']);
  assert.equal(current()?.groups?.[0], second);
  context.mock.timers.tick(500);
  assert.deepEqual(current()?.faces, ['3']);
  context.mock.timers.tick(500);
  assert.equal(current(), null);
});

test('a pinned mandatory roll replaces the backlog and survives until cleared', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = () => shown as DiceMoment | null;
  stream.enqueue(roll('5'), 'action'); stream.enqueue(roll('4'), 'action');
  stream.enqueue(roll('1'), 'action', true);
  context.mock.timers.tick(10000);
  assert.deepEqual(current()?.faces, ['1']);
  stream.clear();
  context.mock.timers.tick(10000);
  assert.equal(current(), null);
});

test('a different sequence and a reconnect snapshot cancel pending and expiry timers', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = () => shown as DiceMoment | null;
  stream.enqueue(roll('5'), 'old'); stream.enqueue(roll('4'), 'old');
  context.mock.timers.tick(200);
  stream.enqueue(roll('3'), 'new');
  context.mock.timers.tick(1000);
  assert.deepEqual(current()?.faces, ['3']);
  stream.enqueue(roll('2'), 'new', false, true);
  context.mock.timers.tick(200);
  assert.deepEqual(current()?.faces, ['2']);
  stream.clear();
  context.mock.timers.tick(3000);
  assert.equal(current(), null);
});

test('replay scales group eligibility without shortening retained result lifetimes', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  let shown: DiceMoment | null = null;
  const stream = new DiceStream(moment => { shown = moment; });
  const current = () => shown as DiceMoment | null;
  stream.enqueue(roll('5'), 'replay', false, false, 4);
  stream.enqueue(roll('4'), 'replay', false, false, 4);
  context.mock.timers.tick(124);
  assert.deepEqual(current()?.faces, ['5']);
  context.mock.timers.tick(1);
  assert.deepEqual(current()?.faces, ['5', '4']);
  context.mock.timers.tick(1075);
  assert.deepEqual(current()?.faces, ['4']);
  context.mock.timers.tick(125);
  assert.equal(current(), null);
});
