import assert from 'node:assert/strict';
import test from 'node:test';
import { stadiumPresentation } from '../src/stadium-presentation.ts';

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
