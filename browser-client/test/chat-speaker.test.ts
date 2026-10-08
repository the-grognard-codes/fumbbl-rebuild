import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chatSpeaker } from '../src/chat-speaker.ts';
import { decodeChat } from '../src/chat-protocol.ts';

const envelope = page => ({ version: 2, type: 'matchChat', requestId: 'chat-load', code: 'ACCEPTED',
  matchId: '00000000-0000-0000-0000-000000000194', duplicate: false, page });

test('coach labels use only the match team, collision qualifiers and distinct spectator identity', () => {
  assert.equal(chatSpeaker({ role: 'home' }, 'Rovers', 'Crew'), 'Rovers');
  assert.equal(chatSpeaker({ role: 'away' }, 'Rovers', 'Crew'), 'Crew');
  assert.equal(chatSpeaker({ role: 'home' }, 'Rovers', 'rovers'), 'Rovers (Home)');
  assert.equal(chatSpeaker({ role: 'away' }, 'Rovers', 'rovers'), 'rovers (Away)');
  assert.equal(chatSpeaker({ role: 'spectator', spectatorNumber: 3 }), 'Spectator3');
  assert.equal(chatSpeaker({ role: 'spectator' }), 'Spectator');
  assert.equal(chatSpeaker({ role: 'system' }), 'Match');
});

test('native paged chat retains first-post ordinals and rejects inconsistent public numbering', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/chat-speakers.json', import.meta.url), 'utf8'));
  const messages = fixture.pages.flatMap(page => decodeChat(JSON.stringify(envelope(page))).page.messages);
  assert.deepEqual(messages.filter(message => message.role === 'spectator').map(message => chatSpeaker(message)),
    ['Spectator1', 'Spectator2', 'Spectator1', 'Spectator3', 'Spectator1']);
  const late = decodeChat(JSON.stringify(envelope(fixture.late))).page.messages;
  assert.deepEqual(late.filter(message => message.role === 'spectator').map(message => chatSpeaker(message)), ['Spectator3', 'Spectator1']);
  for (const mutate of [
    page => { page.messages[0].spectatorNumber = 1; },
    page => { page.messages[1].spectatorNumber = 0; },
    page => { page.messages[1].spectatorNumber = null; },
    page => { page.messages[1].spectatorNumber = 2; },
    page => { page.messages[4].spectatorNumber = 2; },
    page => { page.messages[1].privateAccount = 'private'; }
  ]) { const page = structuredClone(fixture.pages[0]); mutate(page); assert.throws(() => decodeChat(JSON.stringify(envelope(page)))); }
  const legacy = structuredClone(fixture.pages[0]); legacy.formatVersion = 1;
  for (const message of legacy.messages) delete message.spectatorNumber;
  assert.equal(decodeChat(JSON.stringify(envelope(legacy))).page.formatVersion, 1);
});
