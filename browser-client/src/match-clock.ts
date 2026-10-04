import type { MatchClock } from './setup-protocol.ts';

export const TURN_MS = 120_000;
export const RESERVE_MS = 600_000;

export function clockValues(clock: MatchClock | undefined, deltaMs: number, paused: boolean) {
  const activeRole = clock?.activeRole ?? null;
  const elapsed = activeRole ? clock!.turnElapsedMs + (paused ? 0 : Math.max(0, deltaMs)) : 0;
  const additionalBankUse = activeRole ? Math.max(0, elapsed - TURN_MS) - Math.max(0, clock!.turnElapsedMs - TURN_MS) : 0;
  return {
    activeRole,
    turnMs: Math.max(0, TURN_MS - elapsed),
    homeReserveMs: Math.max(0, (clock?.homeReserveMs ?? RESERVE_MS) - (activeRole === 'home' ? additionalBankUse : 0)),
    awayReserveMs: Math.max(0, (clock?.awayReserveMs ?? RESERVE_MS) - (activeRole === 'away' ? additionalBankUse : 0))
  };
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
