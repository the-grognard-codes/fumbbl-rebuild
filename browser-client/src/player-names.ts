import { playerNamePools } from './player-name-pools.ts';

/** Positional specialists use their own pool; the remaining positions share the roster's pool. */
export function randomPlayerName(rosterId: string, positionId: string, usedNames: string[]): string {
  const pool = rosterId === 'orc'
    ? positionId === 'troll' ? playerNamePools.troll : positionId === 'goblin-lineman' ? playerNamePools.goblin : playerNamePools.orc
    : positionId === 'ogre' ? playerNamePools.ogre : positionId === 'halfling' ? playerNamePools.halfling : playerNamePools.human;
  const used = new Set(usedNames.map(name => name.toLowerCase()));
  const available = pool.filter(name => !used.has(name.toLowerCase()));
  // Every pool exceeds the 16-player roster limit, so a roster cannot exhaust it.
  return available[Math.floor(Math.random() * available.length)];
}
