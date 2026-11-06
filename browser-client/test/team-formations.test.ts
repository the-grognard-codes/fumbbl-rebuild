import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeTeamFormations, formationErrors, placeFormationPlayer, starterFormations } from '../src/team-formations.ts';

const roster = Array.from({ length: 16 }, (_, index) => ({ jerseyNumber: 35 - index }));
test('starters use actual jerseys and match the supplied layouts', () => {
  const approved = JSON.parse(readFileSync(new URL('./fixtures/starter-formations.json', import.meta.url), 'utf8'));
  assert.deepEqual(starterFormations(Array.from({ length: 11 }, (_, index) => ({ jerseyNumber: index + 1 }))), approved);
  const result = starterFormations(roster);
  assert.deepEqual(decodeTeamFormations(result), result);
  assert.deepEqual(result.offense[0].players.find(player => player.jerseyNumber === 20), { jerseyNumber: 20, column: 7, depth: 0 });
  assert.equal(result.offense[0].players.filter(player => player.depth === 0).length, 5);
  assert.equal(result.defense[0].players.filter(player => player.depth === 0).length, 3);
  assert.deepEqual(result.offense.map(formation => formation.name), ['5-4-2 Offense', '7-2-2 Offense']);
  assert.deepEqual(result.defense.map(formation => formation.name), ['Chevron Defense', 'Anchor Defense']);
  assert.equal(result.offense[1].players.filter(player => player.depth === 0).length, 7);
  assert.deepEqual(result.defense[0].players.find(player => player.jerseyNumber === 29), { jerseyNumber: 29, column: 2, depth: 2 });
  for (const formation of [...result.offense, ...result.defense]) assert.deepEqual(formationErrors(formation), []);
  assert.deepEqual(decodeTeamFormations({ offense: [], defense: [] }), { offense: [], defense: [] });
});
test('server-facing decoder rejects invalid names, counts, zones, coordinates and duplicate assignments', () => {
  for (const mutate of [
    (data: ReturnType<typeof starterFormations>) => { data.offense[0].name = '<script>'; },
    (data: ReturnType<typeof starterFormations>) => { data.offense[0].players.pop(); },
    (data: ReturnType<typeof starterFormations>) => { data.offense[0].players[0].column = 0; },
    (data: ReturnType<typeof starterFormations>) => { data.offense[0].players[0].depth = 13; },
    (data: ReturnType<typeof starterFormations>) => { data.offense[0].players[0].jerseyNumber = data.offense[0].players[1].jerseyNumber; }
  ]) { const data = starterFormations(roster); mutate(data); assert.throws(() => decodeTeamFormations(data)); }
});
test('placement moves, swaps, and returns chits to reserves without duplication', () => {
  const players = [{ jerseyNumber: 1, column: 7, depth: 0 }, { jerseyNumber: 2, column: 8, depth: 0 }];
  assert.deepEqual(placeFormationPlayer(players, 1, { column: 7, depth: 0 }), players, 'A tap or drop on the same square cannot duplicate a chit');
  const swapped = placeFormationPlayer(players, 1, { column: 8, depth: 0 });
  assert.deepEqual(swapped.find(player => player.jerseyNumber === 2), { jerseyNumber: 2, column: 7, depth: 0 });
  assert.equal(placeFormationPlayer(swapped, 1, null).length, 1);
  assert.equal(players[0].column, 7);
  assert.deepEqual(formationErrors(starterFormations(roster).offense[0]), []);
});
