/** Canonical allowances, independent of free or reactive actions. */
export const limitedActionLabels = {
  blitz: 'Blitz', pass: 'Pass', handOff: 'Hand Off', foul: 'Foul', bomb: 'Throw Bomb',
  throwMate: 'Throw Team-mate', kickMate: 'Kick Team-mate', punt: 'Punt', secure: 'Secure the Ball',
} as const;
export type LimitedActionKind = keyof typeof limitedActionLabels;
export function isLimitedActionKind(value: unknown): value is LimitedActionKind {
  return typeof value === 'string' && Object.hasOwn(limitedActionLabels, value);
}
export function limitedActionPlacement(squareSize: number, headTop: number, headCenter: number, skillHeight: number) {
  const size = Math.min(30, Math.max(18, squareSize * .4));
  return { size, left: headCenter, top: headTop - (skillHeight ? skillHeight + 2 : 5) - size };
}
