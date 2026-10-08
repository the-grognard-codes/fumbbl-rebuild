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

test('unrecognized identities cannot select inherited catalog properties', () => {
  for (const name of ['constructor','toString','__proto__']) {
    const value=stadiumPresentation({homeTeamArt:{rosterId:name,league:name},awayTeamArt:{rosterId:name,league:name}});
    assert.equal(value.venue.id,'old-world-classic');
    assert.equal(value.home.id,'old-world-classic');
    assert.equal(value.away.id,'old-world-classic');
    assert.equal(value.fallback,true);
  }
});

test('both hosting assignments compose each team into the frozen home League venue', () => {
  const human = {rosterId:'human',league:'Old World Classic'}, orc = {rosterId:'orc',league:'Badlands Brawl'};
  for (const [homeTeamArt,awayTeamArt,venue,home,away] of [
    [human,orc,'old-world-classic','old-world-classic','badlands-brawl'],
    [orc,human,'badlands-brawl','badlands-brawl','old-world-classic'],
    [{...orc,league:'Old World Classic'},human,'old-world-classic','badlands-brawl','old-world-classic'],
  ] as const) {
    const result=stadiumPresentation({homeTeamArt,awayTeamArt});
    assert.equal(result.venue.id,venue);
    assert.equal(result.home.id,home);
    assert.equal(result.away.id,away);
    assert.deepEqual(result.diagnostics,[]);
    assert.equal(result.fallback,false);
  }
});

test('large furniture footprints fit entirely in their recesses outside the normal margin', () => {
  for(const recess of STADIUM_RECESSES){
    const footprint=recess;
    assert.ok(recess.x-footprint.along/2>=recess.start && recess.x+footprint.along/2<=recess.end);
    const distance=recess.side==='north'?-2-recess.y:recess.y-17;
    assert.ok(distance-footprint.across/2>=0,'the whole footprint keeps the normal sideline clear');
    assert.ok(distance+footprint.across/2<=recess.depth,'the footprint fits the reserved stand depth');
  }
});
test('side crowd modules stop at midfield and retain both team sections on both sidelines',()=>{
  const seats=stadiumSeats();
  for(const side of ['north','south']){
    for(const team of ['home','away'])assert.ok(seats.some(s=>s.side===side&&s.team===team));
    for(const seat of seats.filter(s=>s.side===side)){
      assert.ok(seat.team==='home'?seat.x+seat.span/2<=13:seat.x-seat.span/2>=13);
    }
  }
});
