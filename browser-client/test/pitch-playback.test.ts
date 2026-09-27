import { test } from 'node:test';
import assert from 'node:assert/strict';

import { confirmedMoves, playbackBeats } from '../src/pitch-playback.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

test('native coordinate changes retain every confirmed square in command order', () => {
  const change = (playerId: string, x: number, y: number) => ({ modelChangeId: 'fieldModelSetPlayerCoordinate',
    modelChangeKey: playerId, modelChangeValue: { x, y } });
  const record = { state: { players: [{ id: 'runner' }] }, native: [
    { commandNr: 2, reportList: { reports: [{ reportId: 'dodgeRoll', roll: 5, minimumRoll: 3, successful: true, playerId: 'runner' }] },
      modelChangeList: { modelChangeArray: [change('runner', 7, 5), change('runner', 8, 5)] } },
    { commandNr: 4, modelChangeList: { modelChangeArray: [change('other', 9, 5), change('runner', 9, 6), change('runner', -1, 0)] } }
  ] } as unknown as TranscriptRecord;
  assert.deepEqual(confirmedMoves(record), [
    { playerId: 'runner', x: 7, y: 5 }, { playerId: 'runner', x: 8, y: 5 }, { playerId: 'runner', x: 9, y: 6 }
  ]);
  assert.deepEqual(playbackBeats(record).map(beat => beat.kind), ['dice', 'move', 'move', 'move']);
});
