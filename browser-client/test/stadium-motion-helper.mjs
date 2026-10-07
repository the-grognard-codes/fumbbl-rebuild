import assert from 'node:assert/strict';

/** Observe actual rendered pixels and stable anchors; shared by scene and native acceptance. */
export async function observeStadiumMotion(page, durationMs = 2400) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async duration => {
    const world = document.querySelector('.pitch-stadium-world');
    const anchors = () => [...world.querySelectorAll('.stadium-sprite')].map(sprite => [sprite.dataset.worldX, sprite.dataset.worldY, sprite.getAttribute('transform')]);
    const seats = () => [...world.querySelectorAll('[data-seat]')].map(seat => [seat.dataset.seat, seat.dataset.crowdTeam]);
    const beforeAnchors = anchors(), beforeSeats = seats();
    const elements = [...world.querySelectorAll('.stadium-ambient')].filter(element => getComputedStyle(element).visibility !== 'hidden');
    const moving = elements.filter(element => element.getAnimations().length);
    const crowd = elements.filter(element => element.closest('[data-seat]'));
    const animatedCrowd = moving.filter(element => element.closest('[data-seat]'));
    const setupCommands = () => (window.nativeOutgoing ?? []).filter(item => item.type === 'setup').length;
    const commandsBefore = setupCommands();
    let mutations = 0;
    const observer = new MutationObserver(changes => mutations += changes.length);
    observer.observe(world, { attributes: true, childList: true, subtree: true });
    const samples = moving.map(element => { const rect = element.getBoundingClientRect(); return { element, x: rect.x, y: rect.y, maxShift: 0, transforms: new Set(), filters: new Set() }; });
    const frameTimes = []; let start, previous;
    await new Promise(resolve => {
      const tick = now => {
        start ??= now; if (previous !== undefined) frameTimes.push(now - previous); previous = now;
        for (const sample of samples) {
          const rect = sample.element.getBoundingClientRect(), style = getComputedStyle(sample.element);
          sample.maxShift = Math.max(sample.maxShift, Math.abs(rect.x - sample.x), Math.abs(rect.y - sample.y));
          sample.transforms.add(style.transform); sample.filters.add(style.filter);
        }
        if (now - start < duration) requestAnimationFrame(tick); else resolve();
      }; requestAnimationFrame(tick);
    });
    mutations += observer.takeRecords().length; observer.disconnect();
    const ordered = [...frameTimes].sort((a,b) => a-b);
    const changes = kind => samples.filter(sample => sample.element.dataset.motion === kind).some(sample => sample.transforms.size > 1 || sample.filters.size > 1);
    return { durationMs: duration, crowdGroups: crowd.length, animatedCrowdGroups: animatedCrowd.length,
      torchCount: moving.filter(element => element.dataset.motion === 'fire-flicker').length,
      pennantCount: moving.filter(element => element.dataset.motion === 'wind').length,
      crowdMoved: changes('sparse-sway'), fireChanged: changes('fire-flicker'), pennantMoved: changes('wind'),
      maxPixelShift: Math.max(...samples.map(sample => sample.maxShift)), mutations,
      anchorsStable: JSON.stringify(beforeAnchors) === JSON.stringify(anchors()),
      seatsStable: JSON.stringify(beforeSeats) === JSON.stringify(seats()),
      canonicalCells: document.querySelectorAll('[data-cell-x]').length,
      commandsStable: commandsBefore === setupCommands(), intents: window.intents ?? [],
      frameObservation: { frames: frameTimes.length, meanMs: frameTimes.reduce((a,b) => a+b,0)/frameTimes.length, p95Ms: ordered[Math.floor(ordered.length*.95)], maxMs: ordered.at(-1) } };
  }, durationMs);
  assert.ok(result.animatedCrowdGroups > 0 && result.animatedCrowdGroups < result.crowdGroups / 5);
  assert.equal(result.torchCount, 8); assert.equal(result.pennantCount, 4);
  assert.ok(result.crowdMoved && result.fireChanged && result.pennantMoved, JSON.stringify(result));
  assert.ok(result.maxPixelShift <= 3, JSON.stringify(result));
  assert.equal(result.mutations, 0, "ambient motion must not drive DOM updates");
  assert.ok(result.anchorsStable && result.seatsStable && result.commandsStable);
  assert.equal(result.canonicalCells, 390); assert.deepEqual(result.intents, []);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => [...document.querySelectorAll('.stadium-ambient')].every(element => element.getAnimations().length === 0 && getComputedStyle(element).transform === 'none' && getComputedStyle(element).filter === 'none'));
  return { ...result, reducedMotionStatic: true };
}
