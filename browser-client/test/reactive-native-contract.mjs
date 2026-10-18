import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

// Input is synthetic public state exported by ReactiveSkillDecisionTest, never a private checkpoint.
const path = process.argv[2];
assert.ok(path, 'Provide the native reactive fixture JSONL path');
const frames = (await readFile(path, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
let reactions = 0;
for (const frame of frames) {
  const decoded = decodeSetupStateValue(frame);
  assert.equal(decoded.revision, frame.revision);
  if (decoded.reaction) {
    reactions++;
    assert.ok(decoded.actions.some(action => action.actor === decoded.reaction.actor));
    assert.ok(Number.isSafeInteger(decoded.reaction.expiresAt));
  }
}
assert.ok(reactions >= 10, 'Expected live, multi-step and recovered native reaction frames');
console.log(`Decoded ${frames.length} native frames, including ${reactions} reactive decisions.`);
