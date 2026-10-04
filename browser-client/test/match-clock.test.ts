import assert from 'node:assert/strict';
import test from 'node:test';
import { clockValues, formatClock } from '../src/match-clock.ts';

test('the turn allowance drains before the reserve bank and resets for the other coach', () => {
  const home = { activeRole: 'home' as const, turnElapsedMs: 110_000, homeReserveMs: 600_000, awayReserveMs: 600_000 };
  assert.deepEqual(clockValues(home, 0, false), { activeRole: 'home', turnMs: 10_000, homeReserveMs: 600_000, awayReserveMs: 600_000 });
  assert.deepEqual(clockValues(home, 20_000, false), { activeRole: 'home', turnMs: 0, homeReserveMs: 590_000, awayReserveMs: 600_000 });
  const away = { activeRole: 'away' as const, turnElapsedMs: 0, homeReserveMs: 590_000, awayReserveMs: 600_000 };
  assert.deepEqual(clockValues(away, 15_000, false), { activeRole: 'away', turnMs: 105_000, homeReserveMs: 590_000, awayReserveMs: 600_000 });
});

test('a saved match pauses both clocks and times remain readable at zero', () => {
  const clock = { activeRole: 'away' as const, turnElapsedMs: 130_000, homeReserveMs: 250_000, awayReserveMs: 10_000 };
  assert.equal(clockValues(clock, 60_000, true).awayReserveMs, 10_000);
  assert.equal(clockValues(clock, 60_000, false).awayReserveMs, 0);
  assert.equal(formatClock(15_000), '0:15');
  assert.equal(formatClock(0), '0:00');
});
