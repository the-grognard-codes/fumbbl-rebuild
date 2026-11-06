import assert from 'node:assert/strict';
import test from 'node:test';

import { starterFormations } from '../../browser-client/src/team-formations.ts';
import { formationInstallSql, installFormationRevision } from '../dev-local-install-formations.mjs';

function document() {
  return { teamId: '12345678-1234-1234-1234-123456789abc', documentVersion: 4,
    owner: { subject: 'preserved' }, validation: { valid: true },
    draft: { teamName: 'Preserved', players: Array.from({ length: 11 }, (_, index) => ({ jerseyNumber: index + 20 })) } };
}

test('installation persists all four starters with actual numbers and changes only formations and revision', () => {
  const before = document();
  const after = installFormationRevision(before);
  assert.equal(after.documentVersion, 5);
  assert.deepEqual(after.draft.formations, starterFormations(before.draft.players));
  const stripped = structuredClone(after); delete stripped.draft.formations; stripped.documentVersion--;
  assert.deepEqual(stripped, before);
  assert.equal(installFormationRevision(after), null, 'Repeat installation does not revise an already current team');
});

test('correction retains custom formations and order; explicit empty groups receive only the new additions', () => {
  const before = document();
  const starters = starterFormations(before.draft.players);
  const custom = { ...structuredClone(starters.offense[0]), name: 'Custom default' };
  const chevron = structuredClone(starters.defense[0]);
  chevron.players = chevron.players.map(player => player.depth ? { ...player, depth: player.depth - 1 } : player);
  before.draft.formations = { offense: [custom], defense: [chevron] };
  const after = installFormationRevision(before);
  assert.deepEqual(after.draft.formations.offense[0], custom);
  assert.deepEqual(after.draft.formations.defense[0], starters.defense[0]);
  assert.equal(after.draft.formations.offense[1].name, '7-2-2 Offense');
  before.draft.formations = { offense: [], defense: [] };
  const empty = installFormationRevision(before).draft.formations;
  assert.deepEqual(empty.offense.map(formation => formation.name), ['7-2-2 Offense']);
  assert.deepEqual(empty.defense.map(formation => formation.name), ['Anchor Defense']);
});

test('full groups and invalid rosters abort instead of dropping saved choices', () => {
  const before = document();
  const template = starterFormations(before.draft.players).offense[0];
  before.draft.formations = { offense: [template, { ...template, name: 'Second' }, { ...template, name: 'Third' }], defense: [] };
  assert.throws(() => installFormationRevision(before), /FORMATION_SLOTS_FULL/);
  delete before.draft.formations; before.draft.players.pop();
  assert.throws(() => installFormationRevision(before), /ELEVEN_ROSTER_NUMBERS_REQUIRED/);
});

test('batch uses one transaction, version/hash guards and a fatal row-count assertion before commit', () => {
  const before = document();
  const change = { table: 'ffb_v2_saved_teams', original: JSON.stringify(before), before, after: installFormationRevision(before) };
  const sql = formationInstallSql([change]);
  assert.match(sql, /START TRANSACTION;/);
  assert.match(sql, /FOR UPDATE;/);
  assert.match(sql, /document_version=4 AND SHA2\(document_json,256\)='[a-f0-9]{64}'/);
  assert.match(sql, /CHECK \(changed = 1\)/);
  assert.match(sql, /INSERT INTO formation_install_assertion VALUES \(ROW_COUNT\(\)\);\nCOMMIT;$/);
  assert.throws(() => formationInstallSql([{ ...change, table: 'ffb_prepared_matches' }]), /INVALID_FORMATION_CHANGE/);
});
