import assert from 'node:assert/strict';
import test from 'node:test';
import { parseV2Response } from '../src/v2-response.ts';

for (const [type, limit] of [['setupState', 2 * 1024 * 1024], ['matchTranscript', 768 * 1024], ['browse', 256 * 1024]] as const) {
  test(`${type} accepts its UTF-8 byte budget and rejects one byte more`, () => {
    const raw = JSON.stringify({ version: 2, type, text: 'é'.repeat(100) });
    const padded = raw + ' '.repeat(limit - Buffer.byteLength(raw));
    assert.equal(parseV2Response(padded).type, type);
    assert.throws(() => parseV2Response(padded + ' '), /Oversized response/);
  });
}

test('large family budgets do not permit duplicate envelope keys or non-object messages', () => {
  assert.throws(() => parseV2Response('{"type":"browse","type":"setupState"}'), /Duplicate key/);
  for (const value of ['null', '[]', '"setupState"']) assert.throws(() => parseV2Response(value), /Invalid envelope/);
  assert.throws(() => parseV2Response(JSON.stringify({ type: 'unknown', text: 'x'.repeat(256 * 1024) })), /Oversized response/);
});
