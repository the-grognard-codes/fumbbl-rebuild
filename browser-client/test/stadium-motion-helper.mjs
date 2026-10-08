import assert from 'node:assert/strict';

/** Observe local frame changes, stable base banks and no gameplay input from scenery. */
export async function observeStadiumMotion(page,durationMs=2400) {
  await page.bringToFront();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>[...document.querySelectorAll('.stadium-gesture[data-active="true"]')]
    .some(e=>e.getAnimations().some(a=>typeof a.currentTime==='number'&&a.currentTime<200)&&e.closest('.stadium-surface').getBoundingClientRect().width>0),null,{timeout:19000});
  const result=await page.evaluate(async duration=>{
    const world=document.querySelector('.pitch-stadium-world');
    const anchors=()=>[...world.querySelectorAll('.stadium-surface')].map(e=>[
      e.dataset.jigsawRow??e.dataset.stadiumRole,e.dataset.worldX,e.dataset.worldY,e.style.transform,e.style.clipPath]);
    const sections=()=>[...world.querySelectorAll('[data-seat]')].map(e=>[e.dataset.jigsawPiece,e.dataset.crowdTeam]);
    const beforeAnchors=anchors(),beforeSections=sections();
    const commands=()=>(window.nativeOutgoing??[]).filter(e=>e.type==='setup').length;
    const commandsBefore=commands();
    const moving=[...world.querySelectorAll('.stadium-ambient,.stadium-gesture')].filter(e=>e.getAnimations().length);
    const samples=moving.map(e=>({e,opacity:new Set(),transform:new Set(),filter:new Set(),rect:e.getBoundingClientRect(),maxShift:0}));
    const changes=[];const observer=new MutationObserver(records=>changes.push(...records));
    observer.observe(world,{attributes:true,childList:true,subtree:true});
    let start,previous,maxSections=0;const times=[];
    await new Promise(resolve=>{
      const frame=now=>{
        start??=now;if(previous!==undefined)times.push(now-previous);previous=now;
        maxSections=Math.max(maxSections,new Set([...world.querySelectorAll('.stadium-gesture[data-active="true"]')]
          .map(e=>e.closest('[data-jigsaw-piece]').dataset.jigsawPiece)).size);
        for(const s of samples){
          const style=getComputedStyle(s.e),r=s.e.getBoundingClientRect();
          s.opacity.add(style.opacity);s.transform.add(style.transform);s.filter.add(style.filter);
          s.maxShift=Math.max(s.maxShift,Math.abs(r.x-s.rect.x),Math.abs(r.y-s.rect.y));
        }
        if(now-start<duration)requestAnimationFrame(frame);else resolve();
      };requestAnimationFrame(frame);
    });
    changes.push(...observer.takeRecords());observer.disconnect();
    const changed=kind=>samples.some(s=>s.e.dataset.motion===kind&&(s.opacity.size>1||s.transform.size>1||s.filter.size>1));
    const ordered=[...times].sort((a,b)=>a-b);
    return {durationMs:duration,localGestureChanged:changed('section-gesture'),maxActiveSections:maxSections,
      fireChanged:changed('fire-flicker'),pennantMoved:changed('wind'),
      maxPixelShift:Math.max(0,...samples.map(s=>s.maxShift)),
      baseCrowdAnimations:[...world.querySelectorAll('[data-seat]')].reduce((n,e)=>n+e.getAnimations().length,0),
      mutations:changes.length,unexpectedMutations:changes.filter(r=>r.type!=='attributes'||r.attributeName!=='data-active').length,
      anchorsStable:JSON.stringify(beforeAnchors)===JSON.stringify(anchors()),
      seatsStable:JSON.stringify(beforeSections)===JSON.stringify(sections()),
      commandsStable:commandsBefore===commands(),intents:window.intents??[],
      canonicalCells:document.querySelectorAll('[data-cell-x]').length,
      frameObservation:{frames:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:ordered[Math.floor(ordered.length*.95)],maxMs:ordered.at(-1)}};
  },durationMs);
  assert.equal(result.baseCrowdAnimations,0);
  assert.ok(result.localGestureChanged&&result.maxActiveSections===1,JSON.stringify(result));
  assert.ok(result.fireChanged&&result.pennantMoved,JSON.stringify(result));
  assert.ok(result.maxPixelShift<=3,JSON.stringify(result));
  assert.equal(result.unexpectedMutations,0,'only occasional section activation changes the DOM');
  assert.ok(result.mutations<=24,'gesture frames must not cause per-frame DOM writes');
  assert.ok(result.anchorsStable&&result.seatsStable&&result.commandsStable);
  assert.equal(result.canonicalCells,390);assert.deepEqual(result.intents,[]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.stadium-ambient,.stadium-gesture')]
    .every(e=>e.getAnimations().length===0)&&!document.querySelector('.stadium-gesture[data-active="true"]'));
  return {...result,reducedMotionStatic:true};
}
