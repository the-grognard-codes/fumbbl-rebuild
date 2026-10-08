import assert from 'node:assert/strict';
import test from 'node:test';
import {StadiumGestureScheduler,STADIUM_GESTURE_MS} from '../src/stadium-gestures.ts';

function fixture(samples:number[]=[0]) {
  const pending=new Map<number,{callback:()=>void;delay:number}>(),changes:(string|null)[]=[];
  let serial=0,eligible=['north-home','away-bank'];
  const scheduler=new StadiumGestureScheduler({
    setTimeout:(callback,delay)=>{pending.set(++serial,{callback,delay});return serial;},
    clearTimeout:id=>{pending.delete(id);}
  },()=>samples.shift()??0,()=>eligible,piece=>changes.push(piece));
  const next=()=>{assert.equal(pending.size,1);const [id,job]=[...pending][0];pending.delete(id);job.callback();return job.delay;};
  return {scheduler,pending,changes,next,setEligible:(pieces:string[])=>{eligible=pieces;}};
}
test('one random section bursts locally, then waits again without frame callbacks',()=>{
  const f=fixture([.5,.99,0]);f.scheduler.start();f.scheduler.start();
  assert.equal(f.next(),9500);assert.deepEqual(f.changes,['away-bank']);
  assert.equal(f.pending.size,1);assert.equal(f.next(),STADIUM_GESTURE_MS);
  assert.deepEqual(f.changes,['away-bank',null]);assert.equal(f.pending.size,1);
  f.scheduler.stop();assert.equal(f.pending.size,0);
});
test('camera eligibility is read at trigger time and empty sections retry without gestures',()=>{
  const f=fixture();f.scheduler.start();f.setEligible([]);f.next();assert.deepEqual(f.changes,[]);
  f.setEligible(['south-away']);f.next();assert.deepEqual(f.changes,['south-away']);f.scheduler.stop();
  assert.deepEqual(f.changes,['south-away',null]);assert.equal(f.pending.size,0);
});
test('pause cancels an active gesture; resume begins with a fresh wait',()=>{
  const f=fixture();f.scheduler.start();f.next();f.scheduler.stop();f.scheduler.stop();
  assert.deepEqual(f.changes,['north-home',null]);assert.equal(f.pending.size,0);
  f.scheduler.start();assert.equal(f.pending.size,1);assert.deepEqual(f.changes,['north-home',null]);f.scheduler.stop();
});
