import type { DraftPlayer } from './team-protocol.ts';

export type FormationRole = 'offense' | 'defense';
export type FormationAssignment = { jerseyNumber: number; column: number; depth: number };
export type Formation = { name: string; players: FormationAssignment[] };
export type TeamFormations = Record<FormationRole, Formation[]>;

export function formationErrors(formation: Formation): string[] {
  const errors: string[] = [];
  if (formation.name !== formation.name.trim() || !/^[A-Za-z0-9 .,!?()'&+_:/-]{1,16}$/.test(formation.name))
    errors.push('Use a name of 1–16 letters, numbers, spaces or common punctuation.');
  if (formation.players.length !== 11) errors.push('Place exactly eleven numbered players.');
  const numbers = new Set<number>(), squares = new Set<string>();
  for (const player of formation.players) {
    if (!Number.isSafeInteger(player.jerseyNumber) || player.jerseyNumber < 1 || player.jerseyNumber > 99
      || !Number.isSafeInteger(player.column) || player.column < 0 || player.column > 14
      || !Number.isSafeInteger(player.depth) || player.depth < 0 || player.depth > 12
      || numbers.has(player.jerseyNumber) || squares.has(`${player.column},${player.depth}`)) {
      errors.push('Every assignment needs a unique number and a unique square on your half.'); break;
    }
    numbers.add(player.jerseyNumber); squares.add(`${player.column},${player.depth}`);
  }
  if (formation.players.filter(player => player.depth === 0).length < 3) errors.push('Place at least three players on the line of scrimmage.');
  if (formation.players.filter(player => player.column < 4).length > 2 || formation.players.filter(player => player.column > 10).length > 2)
    errors.push('Place no more than two players in each wide zone.');
  return errors;
}

export function decodeTeamFormations(value: unknown): TeamFormations {
  const object = (value: unknown, fields: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
      || fields.some(field => !Object.hasOwn(value, field))) throw Error('Invalid formation fields');
    return value as Record<string, unknown>;
  };
  const collection = object(value, ['offense', 'defense']);
  for (const role of ['offense', 'defense']) {
    const group = collection[role];
    if (!Array.isArray(group) || group.length > 3) throw Error('At most three formations per role');
    for (const value of group) {
      const formation = object(value, ['name', 'players']);
      if (typeof formation.name !== 'string' || !Array.isArray(formation.players) || formation.players.length !== 11) throw Error('Invalid formation');
      for (const player of formation.players) object(player, ['jerseyNumber', 'column', 'depth']);
      if (formationErrors(formation as Formation).length) throw Error('Invalid formation');
    }
  }
  return collection as TeamFormations;
}

export function starterFormations(players: Pick<DraftPlayer, 'jerseyNumber'>[]): TeamFormations {
  const numbers = [...new Set(players.map(player => player.jerseyNumber))].sort((a, b) => a - b).slice(0, 11);
  if (numbers.length < 11 || numbers.some(number => !Number.isSafeInteger(number) || number < 1 || number > 99)) return { offense: [], defense: [] };
  const diagram = (name: string, rows: string[]): Formation => ({ name, players: rows.flatMap((row, depth) =>
    [...row].flatMap((value, column) => value === 'X' ? [] : [{ jerseyNumber: numbers[Number.parseInt(value, 16) - 1], column, depth }])) });
  return {
    offense: [
      diagram('5-4-2 Offense', ['XXXXXA819BXXXXX', 'XX24XXXXXXX53XX', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', 'XXXX6XXXXX7XXXX']),
      diagram('7-2-2 Offense', ['XXXX2891AB3XXXX', 'XXX4XXXXXXX5XXX', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXX', 'XXXX6XXXXX7XXXX'])
    ],
    defense: [
      diagram('Chevron Defense', ['XXXXXX819XXXXXX', 'XXXXXXXXXXXXXXX', 'XXAXX6XXX7XXBXX', 'XXX2XX4X5XX3XXX']),
      diagram('Anchor Defense', ['XXXXXX8A9XXXXXX', 'XXXXXXXXXXXXXXX', 'XXXX1XX7XXBXXXX', 'XXXXX43625XXXXX'])
    ]
  };
}

/** Move rather than duplicate a chit; dropping onto an occupied square exchanges its occupants. */
export function placeFormationPlayer(players: FormationAssignment[], jerseyNumber: number, square: { column: number; depth: number } | null): FormationAssignment[] {
  const origin = players.find(player => player.jerseyNumber === jerseyNumber);
  if (origin && square && origin.column === square.column && origin.depth === square.depth) return players;
  const occupant = square && players.find(player => player.column === square.column && player.depth === square.depth);
  const next = players.filter(player => player.jerseyNumber !== jerseyNumber && player !== occupant);
  if (occupant && origin) next.push({ ...occupant, column: origin.column, depth: origin.depth });
  if (square) next.push({ jerseyNumber, ...square });
  return next;
}
