import type { SetupPlayer } from './setup-protocol.ts';
import { limitedActionPlacement } from './limited-action-presentation.ts';

/** Canonical display order, shared by the pitch and Status list. */
export const negativeConditionLabels = {
  distracted: 'Distracted', chomped: 'Chomped', rooted: 'Rooted',
  dodgySnack: 'Dodgy Snack', greasyCleats: 'Greasy Cleats', eyeGouged: 'Eye Gouged',
} as const;
export type NegativeCondition = keyof typeof negativeConditionLabels;
const order = Object.keys(negativeConditionLabels) as NegativeCondition[];
export function isNegativeCondition(value: unknown): value is NegativeCondition {
  return typeof value === 'string' && Object.hasOwn(negativeConditionLabels, value);
}
export function playerNegativeConditions(player: SetupPlayer): NegativeCondition[] {
  const conditions = player.conditions;
  if (conditions !== undefined) return order.filter(kind => conditions.includes(kind));
  // Old projections expose only distraction. Never guess enhancement sources from modified stats.
  return /distract|confus|hypnotiz/i.test(`${player.status ?? ''} ${player.state}`) ? ['distracted'] : [];
}

/** Keep the bottom row at the existing single-icon anchor; extra rows grow upward. */
export function playerTagPlacements(count: number, squareSize: number, headTop: number, headCenter: number, skillHeight: number) {
  const anchor = limitedActionPlacement(squareSize, headTop, headCenter, skillHeight);
  const rows = Math.ceil(count / 3), gap = 2;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 3), columns = Math.min(3, count - row * 3);
    return { size: anchor.size,
      left: anchor.left + (index % 3 - (columns - 1) / 2) * (anchor.size + gap),
      top: anchor.top - (rows - row - 1) * (anchor.size + gap) };
  });
}
