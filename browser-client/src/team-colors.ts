/** Stable palette identities; version 1 must retain its recorded interpretation. */
export const teamColorIds = ['navy', 'gold', 'sky', 'teal', 'forest', 'lime', 'lemon', 'orange', 'red', 'slate', 'violet', 'magenta', 'brown', 'black', 'ivory', 'white'] as const;
export type TeamColors = { version: 1; primary: string; secondary: string };
export function decodeTeamColors(value: unknown): TeamColors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid team colors');
  const colors = value as Record<string, unknown>;
  if (Object.keys(colors).length !== 3 || colors.version !== 1 || !teamColorIds.includes(colors.primary as typeof teamColorIds[number])
    || !teamColorIds.includes(colors.secondary as typeof teamColorIds[number])) throw Error('Invalid team colors');
  return { version: 1, primary: colors.primary as string, secondary: colors.secondary as string };
}
export function defaultTeamColors(rosterId: string): TeamColors {
  if (rosterId === 'human') return { version: 1, primary: 'navy', secondary: 'ivory' };
  if (rosterId === 'orc') return { version: 1, primary: 'black', secondary: 'orange' };
  throw Error('Unsupported team-color roster');
}
