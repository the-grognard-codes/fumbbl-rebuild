import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeChat } from '../src/chat-protocol.ts';

const message = { index: 0, at: 1000, revision: 4, authorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  role: 'spectator', text: '<script>shown as text</script>' };
const response = { version: 2, type: 'matchChat', requestId: null, code: 'ACCEPTED',
  matchId: '12345678-1234-1234-1234-123456789abc', duplicate: false,
  page: { formatVersion: 1, from: 0, next: 1, total: 1, messages: [message] } };

test('chat decoder accepts public text but rejects private fields, gaps and malformed messages', () => {
  assert.equal(decodeChat(JSON.stringify(response)).page.messages[0].text, message.text);
  assert.throws(() => decodeChat(JSON.stringify({ ...response, email: 'private@example.invalid' })));
  assert.throws(() => decodeChat(JSON.stringify({ ...response, page: { ...response.page, next: 2 } })));
  assert.throws(() => decodeChat(JSON.stringify({ ...response, page: { ...response.page,
    messages: [{ ...message, text: 'bad\nline' }] } })));
});
