import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import { playbackBeats } from '../src/pitch-playback.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/block-visibility.json', import.meta.url), 'utf8'));
fixtures.push(JSON.parse(readFileSync(new URL('./fixtures/block-visibility-multiple.json', import.meta.url), 'utf8')));

test('native block fixtures cross the live/recovery/replay decoder boundary without proposal leakage', () => {
  for (const fixture of fixtures) {
    for (const frame of ['ready', 'rolled', 'resolved']) decodeSetupStateValue(fixture[frame]);
    assert.ok(fixture.rolled.blockContext);
    assert.equal(fixture.resolved.blockContext, undefined);
    let captured = false;
    for (let from = 0; from < fixture.records.length; from += 8) {
      const records = fixture.records.slice(from, from + 8);
      const response = decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'visibility', code: 'ACCEPTED',
        matchId: fixture.ready.matchId, page: { formatVersion: 2, from, next: from + records.length, total: fixture.records.length, records } }));
      for (const record of response.page.records) {
        assert.equal(record.state.blockPreview, undefined, 'Private forecasts never become replay snapshots');
        const beats = playbackBeats(record);
        if (beats.some(beat => beat.kind === 'block' && beat.context)) captured = true;
      }
    }
    assert.ok(captured, 'Committed metadata is present in the native replay stream');
  }
});
