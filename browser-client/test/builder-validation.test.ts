import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { builderValidationTarget } from '../src/builder-validation.ts';
import { decodeTeam, emptyDraft } from '../src/team-protocol.ts';

const catalog = decodeTeam(JSON.stringify(JSON.parse(readFileSync(new URL('./fixtures/catalog-v1.json', import.meta.url), 'utf8'))));
if (catalog.type !== 'catalog') throw Error('Expected catalog fixture');
const draft = emptyDraft(catalog);
draft.players = [{ id: 'third-slot', slot: 3, positionId: 'lineman', playerName: 'Coach Choice', jerseyNumber: 8, skillIds: [] }];

test('validation paths follow draft array indexes to the current player slot', () => {
  assert.equal(builderValidationTarget('players[0].playerName', draft), 'builder-player-3-name');
  assert.equal(builderValidationTarget('players[0].jerseyNumber', draft), 'builder-player-3-jersey');
  assert.equal(builderValidationTarget('players[0].captainId', draft), 'builder-player-3-captain');
  assert.equal(builderValidationTarget('players[0].skillIds[0]', draft), 'builder-player-3-skill');
  assert.equal(builderValidationTarget('players[0]', draft), 'builder-player-3');
  assert.equal(builderValidationTarget('captainId', draft), 'builder-player-3-captain');
  assert.equal(builderValidationTarget('players[0]', draft, 'SKILL_INELIGIBLE'), 'builder-player-3-skill');
  assert.equal(builderValidationTarget('players[0]', draft, 'CAPTAIN_INELIGIBLE'), 'builder-player-3-captain');
});

test('known form paths navigate safely and unexpected paths use the roster fallback', () => {
  assert.equal(builderValidationTarget('teamName', draft), 'builder-team-name');
  assert.equal(builderValidationTarget('rosterId', draft), 'builder-team-roster');
  assert.equal(builderValidationTarget('resources.rerolls', draft), 'builder-resource-rerolls');
  assert.equal(builderValidationTarget('resources', draft), 'builder-resources');
  assert.equal(builderValidationTarget('formations.offense[0]', draft), 'builder-formations');
  assert.equal(builderValidationTarget('colors.primary', draft), 'builder-kit-toggle');
  for (const path of ['players[99].playerName', 'resources.constructor', 'colorsUnexpected', 'formationsUnexpected', 'unknown', '#field, input', '<script>']) {
    assert.equal(builderValidationTarget(path, draft), 'builder-roster');
  }
  assert.equal(builderValidationTarget('captainId', { ...draft, players: [] }), 'builder-roster');
});
