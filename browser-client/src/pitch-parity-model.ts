/** Local, scripted presentation data. No legal action or outcome comes from the server. */
export type ParitySquare = Readonly<{ x: number; y: number }>;
export type ParityTeam = 'home' | 'away';
export type ParityPlayer = Readonly<{
  id: string;
  number: number;
  name: string;
  position: string;
  team: ParityTeam;
  sprite: string;
  large: boolean;
  x: number;
  y: number;
}>;
export type ParityRisk = 'clear' | 'dodge' | 'rush' | 'both';
export type ParityRoute = Readonly<{ path: readonly ParitySquare[]; risk: ParityRisk }>;
export type ParityPhase = 'planning' | 'moving' | 'block-choice' | 'done';
export type ParityState = Readonly<{
  crowded: boolean;
  selectedId: string | null;
  target: ParitySquare | null;
  hover: ParitySquare | null;
  phase: ParityPhase;
  progress: number;
  motionPath: readonly ParitySquare[];
  blockTargetId: string | null;
  positions: Readonly<Record<string, ParitySquare>>;
  proneId: string | null;
  message: string;
}>;
export type ParityIntent =
  | { type: 'square'; square: ParitySquare }
  | { type: 'hover'; square: ParitySquare | null }
  | { type: 'select'; playerId: string }
  | { type: 'crowded'; value: boolean }
  | { type: 'commit' }
  | { type: 'tick'; progress: number }
  | { type: 'block-die'; value: 'push' | 'pow' }
  | { type: 'cancel' }
  | { type: 'reset' };

const define = (team: ParityTeam, number: number, name: string, position: string, sprite: string, x: number, y: number, large = false): ParityPlayer =>
  Object.freeze({ id: `${team}-${number}`, team, number, name, position, sprite, x, y, large });

// The first six players are the sparse view; the remaining sixteen make an
// intentionally crowded 11-v-11 inspection scene. The Blitz lane stays open.
export const PARITY_PLAYERS: readonly ParityPlayer[] = Object.freeze([
  define('home', 1, 'Alden', 'Blitzer', '02-blitzer-man.png', 5, 7),
  define('home', 2, 'Mira', 'Catcher', '04-catcher-woman.png', 8, 4),
  define('home', 3, 'Borr', 'Ogre', '01-ogre-man.png', 11, 10, true),
  define('away', 1, 'Rhea', 'Blitzer', '03-blitzer-woman.png', 10, 7),
  define('away', 2, 'Silas', 'Thrower', '06-thrower-man.png', 15, 4),
  define('away', 3, 'Ada', 'Line Orc', '09-line-orc-woman.png', 14, 10),
  define('home', 4, 'Hal', 'Lineman', '08-lineman-man.png', 10, 5),
  define('home', 5, 'Ivo', 'Lineman', '09-lineman-woman.png', 11, 5),
  define('home', 6, 'Lea', 'Lineman', '10-lineman-man.png', 12, 5),
  define('home', 7, 'Nia', 'Lineman', '11-lineman-woman.png', 10, 6),
  define('home', 8, 'Oren', 'Lineman', '12-lineman-man.png', 12, 6),
  define('home', 9, 'Pip', 'Catcher', '05-catcher-man.png', 11, 8),
  define('home', 10, 'Sia', 'Thrower', '07-thrower-woman.png', 12, 8),
  define('home', 11, 'Tams', 'Lineman', '13-lineman-woman.png', 10, 9),
  define('away', 4, 'Brak', 'Big Un', '04-big-un-man.png', 13, 5),
  define('away', 5, 'Cora', 'Big Un', '05-big-un-woman.png', 14, 5),
  define('away', 6, 'Dorn', 'Line Orc', '08-line-orc-man.png', 13, 6),
  define('away', 7, 'Enna', 'Line Orc', '10-line-orc-man.png', 14, 6),
  define('away', 8, 'Frik', 'Line Orc', '11-line-orc-woman.png', 11, 9),
  define('away', 9, 'Gora', 'Blitzer', '02-blitzer-man.png', 13, 8),
  define('away', 10, 'Hruk', 'Line Orc', '12-line-orc-man.png', 14, 8),
  define('away', 11, 'Troll', 'Troll', '01-troll-man.png', 15, 9, true)
]);

export const PARITY_GEOMETRY = Object.freeze({ width: 960, height: 564, originX: 12, originY: 12, cell: 36, columns: 26, rows: 15 });
export const paritySpriteUrl = (player: ParityPlayer) => `${import.meta.env.BASE_URL}preview/${player.team === 'home' ? 'humans' : 'orcs'}-64px-chibi-v1/${player.sprite}`;
export const squareKey = (square: ParitySquare) => `${square.x},${square.y}`;
export const squareAt = (x: number, y: number): ParitySquare | null => x >= 0 && x < 26 && y >= 0 && y < 15 ? { x, y } : null;
export const equalSquare = (a: ParitySquare | null, b: ParitySquare | null) => !!a && !!b && a.x === b.x && a.y === b.y;

export const initialParityState = (): ParityState => ({
  crowded: true, selectedId: null, target: null, hover: null, phase: 'planning', progress: 0,
  motionPath: [], blockTargetId: null, positions: {}, proneId: null,
  message: 'Local scripted fixture. Select Alden, then Rhea to preview a movement + block Blitz.'
});

export function parityPlayers(state: ParityState): ParityPlayer[] {
  return (state.crowded ? PARITY_PLAYERS : PARITY_PLAYERS.slice(0, 6)).map(player => ({ ...player, ...state.positions[player.id] }));
}

export function parityRoutes(player: ParityPlayer, players: readonly ParityPlayer[]): Map<string, ParityRoute> {
  const routes = new Map<string, ParityRoute>();
  const occupied = new Set(players.filter(p => p.id !== player.id).map(squareKey));
  const queue: ParitySquare[][] = [[{ x: player.x, y: player.y }]];
  const seen = new Set([squareKey(player)]);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], last = path[path.length - 1];
    if (path.length > 8) continue;
    for (const [dx, dy] of [[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const next = squareAt(last.x + dx, last.y + dy);
      if (!next || seen.has(squareKey(next)) || occupied.has(squareKey(next))) continue;
      const result = [...path, next];
      const dodge = result.slice(0, -1).some(square => players.some(other => other.team !== player.team && Math.max(Math.abs(square.x - other.x), Math.abs(square.y - other.y)) === 1));
      const rush = result.length - 1 > 6;
      routes.set(squareKey(next), { path: result, risk: dodge && rush ? 'both' : dodge ? 'dodge' : rush ? 'rush' : 'clear' });
      seen.add(squareKey(next));
      queue.push(result);
    }
  }
  return routes;
}

export function parityPreview(state: ParityState) {
  const players = parityPlayers(state);
  const selected = players.find(player => player.id === state.selectedId) ?? null;
  const pointed = state.target ?? state.hover;
  const opponent = pointed ? players.find(player => player.team === 'away' && equalSquare(player, pointed)) ?? null : null;
  const routes = selected && state.phase === 'planning' ? parityRoutes(selected, players) : new Map<string, ParityRoute>();
  const route = pointed && selected ? opponent
    ? [...routes.values()].filter(candidate => { const last = candidate.path[candidate.path.length - 1]; return Math.max(Math.abs(last.x - opponent.x), Math.abs(last.y - opponent.y)) === 1; }).sort((a, b) => a.path.length - b.path.length)[0]
    : routes.get(squareKey(pointed)) : undefined;
  return { players, selected, pointed, opponent, routes, route, canCommit: !!state.target && !!route && state.phase === 'planning', action: opponent ? 'Blitz' : 'Move' } as const;
}

export function reduceParityState(state: ParityState, intent: ParityIntent): ParityState {
  if (intent.type === 'reset') return initialParityState();
  if (intent.type === 'crowded') return { ...initialParityState(), crowded: intent.value };
  if (intent.type === 'hover') return state.phase === 'planning' && !equalSquare(state.hover, intent.square) && !(state.hover === null && intent.square === null)
    ? { ...state, hover: intent.square } : state;
  if (intent.type === 'cancel') return state.phase === 'planning' ? { ...state, target: null, hover: null, message: 'Preview cancelled.' } : state;
  if (intent.type === 'select' || intent.type === 'square') {
    if (state.phase !== 'planning') return state;
    const square = intent.type === 'square' ? intent.square : null;
    const player = intent.type === 'select'
      ? parityPlayers(state).find(candidate => candidate.id === intent.playerId)
      : parityPlayers(state).find(candidate => equalSquare(candidate, square));
    if (player?.team === 'home') return player.id === state.selectedId
      ? { ...state, selectedId: null, target: null, hover: null, message: 'Player deselected.' }
      : { ...state, selectedId: player.id, target: null, hover: null, message: `Selected ${player.name}. Choose a square or opposing player.` };
    if (!state.selectedId) return state;
    return { ...state, target: square ?? (player ? { x: player.x, y: player.y } : null), hover: null };
  }
  if (intent.type === 'commit') {
    const preview = parityPreview(state);
    if (!preview.canCommit || !preview.selected || !preview.route) return state;
    const path = preview.route.path;
    return { ...state, phase: path.length > 1 ? 'moving' : preview.opponent ? 'block-choice' : 'done', progress: 0,
      motionPath: path, blockTargetId: preview.opponent?.id ?? null, hover: null,
      message: `${preview.opponent ? 'Blitz' : 'Move'} preview committed. Scripted animation; no dice or rules executed.` };
  }
  if (intent.type === 'tick' && state.phase === 'moving') {
    if (intent.progress < 1) return { ...state, progress: intent.progress };
    const last = state.motionPath[state.motionPath.length - 1];
    return { ...state, progress: 1, positions: { ...state.positions, [state.selectedId!]: last }, phase: state.blockTargetId ? 'block-choice' : 'done',
      message: state.blockTargetId ? 'Blitz movement complete. Choose a mock block result.' : 'Mock move complete.' };
  }
  if (intent.type === 'block-die' && state.phase === 'block-choice') return { ...state, phase: 'done', proneId: intent.value === 'pow' ? state.blockTargetId : null,
    message: `Mock block result: ${intent.value === 'pow' ? 'defender down' : 'push'}. No server roll or rule outcome.` };
  return state;
}

export function interpolatedSquare(state: ParityState, player: ParityPlayer): ParitySquare {
  if (state.phase !== 'moving' || player.id !== state.selectedId || state.motionPath.length < 2) return player;
  if (state.progress >= 1) return state.motionPath[state.motionPath.length - 1];
  const distance = Math.max(0, state.progress) * (state.motionPath.length - 1);
  const before = state.motionPath[Math.min(Math.floor(distance), state.motionPath.length - 2)];
  const after = state.motionPath[Math.min(Math.floor(distance) + 1, state.motionPath.length - 1)];
  const fraction = distance - Math.floor(distance);
  return { x: before.x + (after.x - before.x) * fraction, y: before.y + (after.y - before.y) * fraction };
}
