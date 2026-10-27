import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchWindowHeight, readMatchWindowSize, saveMatchWindowSize } from '../src/match-window-size.ts';

test('window heights respect default, header and available space independently', () => {
  assert.equal(matchWindowHeight('minimized', 34, 152, 500), 34);
  assert.equal(matchWindowHeight('default', 34, 152, 500), 152);
  assert.equal(matchWindowHeight('maximized', 34, 152, 500), 500);
  assert.equal(matchWindowHeight('default', 34, 152, 80), 80);
  assert.equal(matchWindowHeight('maximized', 34, 152, 80), 80);
  assert.equal(matchWindowHeight('maximized', 34, 152, -10), 34);
});

test('window preferences are independent, validated and tolerate unavailable storage', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    assert.equal(readMatchWindowSize('chat'), 'default');
    saveMatchWindowSize('chat', 'minimized');
    saveMatchWindowSize('log', 'maximized');
    assert.equal(readMatchWindowSize('chat'), 'minimized');
    assert.equal(readMatchWindowSize('log'), 'maximized');
    values.set('ffb.match.chat.window-size', 'invalid');
    assert.equal(readMatchWindowSize('chat'), 'default');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Unavailable'); } });
    assert.equal(readMatchWindowSize('chat'), 'default');
    assert.doesNotThrow(() => saveMatchWindowSize('chat', 'maximized'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
