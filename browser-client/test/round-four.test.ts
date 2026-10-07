import assert from 'node:assert/strict';
import test from 'node:test';
import { storedHudOpacity } from '../src/hud-opacity.ts';
import { assertV2Projection } from '../src/v2-projection.ts';
import { canDropSetupPlayer } from '../src/setup-drag.ts';
import { readFileSync } from 'node:fs';
import type { SetupState } from '../src/setup-protocol.ts';

test('HUD opacity validates stored endpoints and rejects malformed preferences', () => {
  for (const percent of [0,30,100]) assert.equal(storedHudOpacity(String(percent)),percent);
  for (const invalid of [null,'','NaN','-1','101','0.5','30%','Infinity']) assert.equal(storedHudOpacity(invalid),30);
});
test('setup errors are explicit bounded native diagnostics only on illegal setup', () => {
  const message = { version:2,type:'setupState',requestId:'confirm',code:'ILLEGAL_SETUP',duplicate:false,state:null };
  assert.doesNotThrow(() => assertV2Projection({ ...message,setupErrors:['Too many players in a wide zone.'] }));
  assert.doesNotThrow(() => assertV2Projection(message)); // Retained responses from older runtimes remain readable.
  for (const setupErrors of ['wrong',[null],[''],Array(33).fill('reason'),['x'.repeat(1001)]]) assert.throws(() => assertV2Projection({ ...message,setupErrors }));
  assert.throws(() => assertV2Projection({ ...message,code:'ACCEPTED',setupErrors:['unexpected'] }));
});
test('setup permits only eligible friendly pitch-to-pitch swaps', () => {
  const base: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json',import.meta.url),'utf8'))[0].actor;
  for (const role of ['home','away'] as const) {
    const x = role === 'home' ? 8 : 18;
    const own = { ...base.players[0],id:'own',role,x,y:7,offPitch:'pitch' as const };
    const other = { ...own,id:'other',x:x+1 };
    const view = { ...base,phase:'SETUP' as const,actor:role,callerRole:role,players:[own,other] };
    assert.equal(canDropSetupPlayer(view,'own',{x:other.x,y:7}),true);
    assert.equal(canDropSetupPlayer({...view,players:[{...own,x:null,y:null,offPitch:'reserve'},other]},'own',{x:other.x,y:7}),false);
    assert.equal(canDropSetupPlayer({...view,players:[own,{...other,role:role==='home'?'away':'home'}]},'own',{x:other.x,y:7}),false);
    assert.equal(canDropSetupPlayer({...view,actor:role==='home'?'away':'home'},'own',{x:other.x,y:7}),false);
    assert.equal(canDropSetupPlayer(view,'own',{x:role==='home'?20:2,y:7}),false);
  }
});
