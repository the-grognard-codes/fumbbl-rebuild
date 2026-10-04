import type { SetupState } from './setup-protocol.ts';

export type HudResource = { kind: 'reroll' | 'apothecary' | 'assistantCoach' | 'cheerleader'; label: string; count: number };
export type TurnSlot = { number: number; past: boolean; current: boolean };

/** Only resources projected by the server may appear in the live HUD. */
export function hudResources(view: SetupState, role: 'home' | 'away'): HudResource[] {
  const resources = role === 'home' ? view.homeResources : view.awayResources;
  const counts: HudResource[] = [
    { kind: 'reroll', label: 'Rerolls', count: role === 'home' ? view.homeRerolls : view.awayRerolls },
    { kind: 'apothecary', label: 'Apothecaries', count: resources?.apothecaries ?? 0 },
    { kind: 'assistantCoach', label: 'Assistant coaches', count: resources?.assistantCoaches ?? 0 },
    { kind: 'cheerleader', label: 'Cheerleaders', count: resources?.cheerleaders ?? 0 },
  ];
  return counts.filter(resource => resource.count > 0);
}

export function turnSlots(half: number, teamTurn: number, phase: SetupState['phase']): TurnSlot[] {
  const first = (Math.max(1, Math.min(3, half)) - 1) * 8 + 1;
  const reached = Math.max(0, Math.min(teamTurn, 8));
  return Array.from({ length: 8 }, (_, index) => ({ number: first + index,
    past: reached > index + 1 || (phase === 'FULL_TIME' && reached >= index + 1),
    current: phase !== 'FULL_TIME' && reached === index + 1 }));
}
