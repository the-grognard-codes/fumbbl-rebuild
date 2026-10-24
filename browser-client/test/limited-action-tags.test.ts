import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { isLimitedActionKind, limitedActionLabels, limitedActionPlacement } from '../src/limited-action-presentation.ts';
import { readLimitedActionTags, saveLimitedActionTags } from '../src/limited-action-preferences.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

const stored = new Map<string,string>();
function storage() {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value),
  }});
}
afterEach(()=>{storage();saveLimitedActionTags(true);stored.clear();delete globalThis.localStorage;});
test('tags default on, persist independently, and tolerate denied storage',()=>{
  storage();assert.equal(readLimitedActionTags(),true);
  saveLimitedActionTags(false);assert.equal(readLimitedActionTags(),false);
  saveLimitedActionTags(true);assert.equal(readLimitedActionTags(),true);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('Denied');}});
  saveLimitedActionTags(false);assert.equal(readLimitedActionTags(),false);
  saveLimitedActionTags(true);assert.equal(readLimitedActionTags(),true);
});
test('protocol accepts the nine canonical tags and rejects invalid, off-pitch and non-play tags',()=>{
  const initial=JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json',import.meta.url),'utf8'))[0].actor;
  const player=initial.players.find((item:{x:number|null})=>item.x!==null);
  const view=(tag:unknown,extra={})=>({...initial,players:[{...player,limitedAction:tag,...extra}]});
  for(const kind of Object.keys(limitedActionLabels)) {
    assert.equal(isLimitedActionKind(kind),true);assert.doesNotThrow(()=>decodeSetupStateValue(view(kind)));
  }
  for(const kind of ['move','dumpOff','toString','',null,42,{}]) assert.throws(()=>decodeSetupStateValue(view(kind)));
  assert.throws(()=>decodeSetupStateValue(view('blitz',{x:null,y:null,offPitch:'reserve'})));
  assert.throws(()=>decodeSetupStateValue({...view('blitz'),phase:'FULL_TIME'}));
});
test('glyph centers on the head with room for the skill strip and bounded size at every zoom',()=>{
  assert.deepEqual(limitedActionPlacement(50,10,23,0),{size:20,left:23,top:-15});
  assert.deepEqual(limitedActionPlacement(50,10,23,14),{size:20,left:23,top:-26});
  assert.equal(limitedActionPlacement(10,0,0,0).size,18);
  assert.equal(limitedActionPlacement(200,0,0,0).size,30);
});
