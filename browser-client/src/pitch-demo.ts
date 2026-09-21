export type Square = { x: number; y: number };
export type DemoPlayer = Square & { number: number; name: string; team: string; position: string; sprite: string; zone: string; stats: string[]; skills: string; injury: string; spp: number; earned: string; career: number; used: number };
export const initialPlayers: DemoPlayer[] = [
  ['Alden', 'Blitzer', '02-blitzer-man.png', 5, 7, 'home'],
  ['Mira', 'Catcher', '04-catcher-woman.png', 8, 4, 'home'],
  ['Borr', 'Ogre', '01-ogre-man.png', 11, 10, 'home'],
  ['Rhea', 'Blitzer', '03-blitzer-woman.png', 10, 7, 'away'],
  ['Silas', 'Thrower', '06-thrower-man.png', 15, 4, 'away'],
  ['Ada', 'Line Orc', '09-line-orc-woman.png', 14, 10, 'away']
].map(([name, position, sprite, x, y, team], index) => ({ name: String(name), position: String(position), sprite: String(sprite), x: Number(x), y: Number(y), team: String(team), number: index + 1, zone: index === 5 ? 'Prone' : 'Standing', stats: position === 'Ogre' ? ['5', '5', '4+', '5+', '10+'] : position === 'Catcher' ? ['8', '2', '3+', '5+', '8+'] : ['6', '3', '3+', '3+', '9+'], skills: position === 'Blitzer' ? 'Block' : position === 'Catcher' ? 'Catch, Dodge' : position === 'Ogre' ? 'Bone Head, Mighty Blow' : position === 'Thrower' ? 'Pass, Sure Hands' : 'None', injury: index === 5 ? 'Prone · no lasting injury' : 'None', spp: index === 0 ? 2 : 0, earned: index === 0 ? '1 casualty' : 'None this game', career: 6, used: 0 }));
export const spriteUrl = (file: string, team = 'home') => {
  const filename = team === 'away' ? file.replace('ogre', 'troll').replace('catcher', 'big-un').replace('lineman', 'line-orc') : file;
  return `${import.meta.env.BASE_URL}preview/${team === 'away' ? 'orcs' : 'humans'}-64px-chibi-v1/${filename}`;
};
export const adjacent = (a: Square, b: Square) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
export type Route = { path: Square[]; dodge: boolean; rush: boolean };
/** Illustrative shortest routes, not authoritative rules or success probabilities. */
export function routesFor(player: DemoPlayer, players: DemoPlayer[]): Map<string, Route> {
  const routes = new Map<string, Route>();
  const queue: Square[][] = [[{ x: player.x, y: player.y }]];
  const seen = new Set([`${player.x},${player.y}`]);
  const remaining = Math.max(0, Number(player.stats[0]) - player.used);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], last = path[path.length - 1];
    if (path.length - 1 >= Math.max(0, Number(player.stats[0]) + 2 - player.used)) continue;
    for (const [dx, dy] of [[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const next = { x: last.x + dx, y: last.y + dy }, key = `${next.x},${next.y}`;
      if (next.x < 0 || next.x >= 26 || next.y < 0 || next.y >= 15 || seen.has(key) || players.some(p => p.x === next.x && p.y === next.y)) continue;
      seen.add(key);
      const result = [...path, next];
      routes.set(key, { path: result, rush: result.length - 1 > remaining, dodge: result.slice(0, -1).some(square => players.some(p => p.team !== player.team && p.zone !== 'Prone' && adjacent(square, p))) });
      queue.push(result);
    }
  }
  return routes;
}
