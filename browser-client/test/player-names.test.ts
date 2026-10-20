import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerNamePools } from '../src/player-name-pools.ts';
import { randomPlayerName } from '../src/player-names.ts';

test('six complete name pools contain distinct fantasy names of at most twelve letters', () => {
  for (const [type, pool] of Object.entries(playerNamePools)) {
    assert.equal(pool.length, type === 'human' || type === 'orc' ? 1000 : 100, type);
    assert.equal(new Set(pool).size, pool.length, type);
    for (const name of pool) assert.match(name, /^[A-Z][a-z]{1,11}$/, type);
  }
});

test('positions draw from the correct shared or specialist pool and avoid existing names', () => {
  for (const [roster, position, type] of [
    ['human', 'ogre', 'ogre'], ['human', 'halfling', 'halfling'],
    ...['blitzer', 'catcher', 'thrower', 'lineman'].map(position => ['human', position, 'human']),
    ['orc', 'troll', 'troll'], ['orc', 'goblin-lineman', 'goblin'],
    ...['orc-blitzer', 'big-un-blocker', 'orc-thrower', 'orc-lineman'].map(position => ['orc', position, 'orc']),
  ]) {
    const pool: readonly string[] = playerNamePools[type as keyof typeof playerNamePools];
    const used: string[] = [];
    for (let count = 0; count < 16; count++) {
      const name = randomPlayerName(roster, position, used.map(name => name.toUpperCase()));
      assert.ok(pool.includes(name), `${roster}/${position}: ${name}`);
      assert.ok(!used.includes(name));
      used.push(name);
    }
  }
});
