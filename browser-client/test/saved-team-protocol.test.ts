import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSavedDocument, decodeSavedTeam, parseUniqueJson } from '../src/saved-team-protocol.ts';

const draft = { catalogVersion: 'retired-catalog', ruleset: 'BB2025', rosterId: 'human', presetId: 'preset', captainId: null, players: [], resources: { rerolls: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: 0, dedicatedFans: 0 } };
const document = { formatVersion: 1, teamId: '12345678-1234-1234-1234-123456789abc', documentVersion: 1, ruleset: 'BB2025', catalogVersion: 'retired-catalog', owner: { namespace: 'local', subject: 'home' }, draft, validation: { valid: true, total: 0, budget: 1150000, skillPoints: 0, messages: [] } };
const response = { version: 1, type: 'savedTeam', requestId: 'request', code: 'OK', document, versionStatus: 'MIGRATION_REQUIRED', validation: document.validation, teams: [] };
test('saved documents preserve unknown catalog identifiers structurally', () => {
  assert.deepEqual(decodeSavedDocument(document), document);
  assert.equal(decodeSavedTeam(JSON.stringify(response)).versionStatus, 'MIGRATION_REQUIRED');
});
test('account documents and owner-scoped list labels retain named draft fields', () => {
  const named = { ...draft, draftVersion: 2, teamName: 'The Moles', players: [
    { id: 'one', slot: 1, jerseyNumber: 99, playerName: 'Mole One', positionId: 'lineman', skillIds: [] },
    { id: 'two', slot: 2, jerseyNumber: 7, playerName: 'Mole Two', positionId: 'lineman', skillIds: [] },
  ] };
  const account = { ...document, formatVersion: 3, owner: { namespace: 'account', subject: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, draft: named };
  assert.deepEqual(decodeSavedDocument(account), account);
  const list = { ...response, document: account, versionStatus: 'CURRENT', teams: [{ teamId: account.teamId, documentVersion: 1, catalogVersion: account.catalogVersion, teamName: named.teamName, rosterId: 'human', eligibility: 'CURRENT' }] };
  assert.deepEqual(decodeSavedTeam(JSON.stringify(list)).teams, list.teams);
  assert.throws(() => decodeSavedDocument({ ...account, draft: { ...named, players: [{ ...named.players[0], jerseyNumber: 7 }, named.players[1]] } }));
  assert.throws(() => decodeSavedDocument({ ...account, draft: { ...named, teamName: ' Bad ' } }));
});
test('saved-team decoder fails closed for unknown fields, types and invalid metadata', () => {
  for (const invalid of [
    { ...response, unexpected: true }, { ...response, code: 'OTHER' }, { ...response, teams: [{}] },
    { ...response, document: { ...document, teamId: document.teamId.toUpperCase() } },
    { ...response, document: { ...document, draft: { ...draft, catalogVersion: 5 } } },
    { ...response, document: { ...document, validation: { ...document.validation, valid: false } } },
  ]) assert.throws(() => decodeSavedTeam(JSON.stringify(invalid)));
});
test('duplicate JSON fields are rejected before JSON.parse could discard them', () => {
  assert.throws(() => parseUniqueJson('{"teamId":"one","teamId":"two"}'));
  assert.throws(() => decodeSavedTeam(JSON.stringify(response).replace('"code":"OK"', '"code":"OK","code":"CONFLICT"')));
});
