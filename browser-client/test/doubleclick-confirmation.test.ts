import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DoubleClickConfirmation } from '../src/doubleclick-confirmation.ts';

test('two repeat clicks on a selected target confirm once', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('player:target', 100, true), false);
  assert.equal(gesture.repeat('player:target', 250, true), true);
  assert.equal(gesture.repeat('player:target', 300, true), false);
  assert.equal(gesture.repeat('player:target', 350, true), false);
});

test('isolated clicks start a fresh pair after the 400 ms window', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('square:5,6', 100, true), false);
  assert.equal(gesture.repeat('square:5,6', 501, true), false);
  assert.equal(gesture.repeat('square:5,6', 901, true), true);
});

test('different targets cannot form a confirmation pair', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('player:first', 100, true), false);
  assert.equal(gesture.repeat('player:second', 150, true), false);
  assert.equal(gesture.repeat('player:second', 200, true), true);
});

test('unready clicks are discarded and require two new ready clicks', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('target', 100, false), false);
  assert.equal(gesture.repeat('target', 150, false), false);
  assert.equal(gesture.repeat('target', 200, true), false);
  assert.equal(gesture.repeat('target', 250, false), false);
  assert.equal(gesture.repeat('target', 300, true), false);
  assert.equal(gesture.repeat('target', 350, true), true);
});

test('plan edits, input switches and interruptions invalidate the first click', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('target', 100, true), false);
  gesture.reset();
  assert.equal(gesture.repeat('target', 150, true), false);
  assert.equal(gesture.repeat('target', 200, true), true);
  gesture.reset();
  assert.equal(gesture.repeat('target', 250, true), false);
});

test('button or keyboard confirmation consumes any partial gesture', () => {
  const gesture = new DoubleClickConfirmation();
  gesture.repeat('target', 100, true);
  gesture.consume();
  assert.equal(gesture.repeat('target', 150, true), false);
});

test('keyboard activation and invalid timestamps never count as pointer clicks', () => {
  for (const time of [undefined, NaN, Infinity]) {
    const gesture = new DoubleClickConfirmation();
    gesture.repeat('target', 100, true);
    assert.equal(gesture.repeat('target', time, true), false);
    assert.equal(gesture.repeat('target', 200, true), false);
  }
});

test('a duplicate event timestamp does not confirm', () => {
  const gesture = new DoubleClickConfirmation();
  assert.equal(gesture.repeat('target', 100, true), false);
  assert.equal(gesture.repeat('target', 100, true), false);
});
