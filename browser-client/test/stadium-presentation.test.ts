import assert from 'node:assert/strict';
import test from 'node:test';
import { stadiumPresentation, stadiumSeats, STADIUM_RECESSES } from '../src/stadium-presentation.ts';

test('frozen home League owns the venue independently of participant identity', () => {
  const homeTeamArt = {rosterId:'human',league:'Old World Classic'}, awayTeamArt = {rosterId:'unknown',league:'Other'};
  const value = stadiumPresentation({homeTeamArt,awayTeamArt});
  assert.equal(value.venue.id,'old-world-classic');
  assert.equal(value.home.id,'old-world-classic');
  assert.equal(value.fallback,false);
  assert.ok(value.diagnostics.some(message => message.includes('unknown')));
  const legacy = stadiumPresentation({});
  assert.equal(legacy.fallback,true);
  assert.equal(legacy.venue.id,'old-world-classic');
});
test('canonical seats never overlap corners or large-furniture recesses', () => {
  const seats = stadiumSeats();
  assert.equal(new Set(seats.map(seat => seat.x+','+seat.y)).size,seats.length);
  for (const seat of seats) {
    assert.equal(seat.team,seat.side==='home'||seat.side==='away'?seat.side:seat.x<13?'home':'away');
    assert.ok(!STADIUM_RECESSES.some(recess => recess.side===seat.side&&seat.row<recess.depth&&seat.x>recess.start&&seat.x<recess.end));
  }
  for (const recess of STADIUM_RECESSES) assert.ok(recess.y<-1.5||recess.y>16.5);
});
