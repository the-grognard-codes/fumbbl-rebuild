import { mkdir as prepareReferenceOutput } from 'node:fs/promises';
await prepareReferenceOutput('.tools/pitch-camera-references-v4-qa', { recursive: true });
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(path.resolve('browser-client/package.json'));
const { chromium } = require('playwright');
const root = path.resolve('docs/adr/references/0003-angled-pitch-v4');
const output = path.resolve('.tools/pitch-camera-references-v4-qa');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 1200 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { orientations: [], layouts: [], errors };
const ready = () => page.evaluate(() => window.pitchReferenceReady);
const state = () => page.evaluate(() => ({
  ...window.pitchReference.export(),
  fixture: JSON.stringify({ players: window.pitchReference.scene.players,
    ball: window.pitchReference.scene.ball, selected: window.pitchReference.scene.selected }),
  hud: document.getElementById('hud').getBoundingClientRect().toJSON(),
  panValue: document.getElementById('pan').value,
  feet: window.pitchReference.anchors.find(a => a.id === 'home-3').screenCenter,
  cells: document.querySelectorAll('.square').length,
  readout: document.getElementById('square-readout').textContent
}));
async function pan(value) {
  await page.locator('#pan').evaluate((input, n) => {
    input.value = n; input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await ready();
}
async function pitchPoint(x, y) {
  return page.evaluate(({ x, y }) => {
    const p = window.pitchReference.project(x, y);
    const matrix = document.getElementById('pitch').getScreenCTM();
    const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, { x, y });
}

try {
  for (const end of ['home', 'away']) {
    await page.goto(`${pathToFileURL(path.join(root, 'viewer.html'))}?view=perspective-40-${end}`);
    await ready();
    assert.equal((await state()).view, `perspective-40-${end}`);
    await pan(9.5);
    const before = await state();
    await page.locator('#toggle-tactical').click(); await ready();
    const overhead = await state();
    assert.equal(overhead.view, `top-down-${end}`);
    assert.equal(overhead.camera.elevation, 90);
    assert.equal(overhead.camera.perspective, false);
    assert.equal(overhead.camera.vanishingPoint, null);
    assert.equal(overhead.camera.focus, before.camera.focus);
    assert.equal(overhead.framing, 'play');
    assert.equal(overhead.fixture, before.fixture);
    assert.equal(overhead.cells, 390);
    assert.equal(overhead.players.length, 22);
    assert.deepEqual(overhead.hud, before.hud);
    assert.equal(await page.locator('#toggle-tactical').getAttribute('aria-pressed'), 'true');
    await page.locator('#toggle-tactical').click(); await ready();
    const restored = await state();
    assert.equal(restored.view, before.view);
    assert.equal(restored.camera.focus, before.camera.focus);
    assert.deepEqual(restored.feet, before.feet);
    assert.equal(restored.fixture, before.fixture);

    for (const view of [`perspective-40-${end}`, `top-down-${end}`]) {
      await page.selectOption('#view', view); await pan(13);
      const initial = await state();
      const at = await pitchPoint(13, 7.5);
      await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, 120);
      await page.waitForFunction(f => window.pitchReference.camera.focus !== f, initial.camera.focus);
      await ready(); const wheeled = await state();
      assert.ok((wheeled.camera.focus - 13) * (end === 'home' ? 1 : -1) < 0);
      if (view.startsWith('top-down')) {
        assert.equal(wheeled.feet.x, initial.feet.x);
        assert.notEqual(wheeled.feet.y, initial.feet.y);
      }
      await page.locator('#stage').focus(); await page.keyboard.press('ArrowUp'); await ready();
      assert.equal((await state()).camera.focus, wheeled.camera.focus + (end === 'home' ? 1 : -1));
      const readoutBeforeDrag = (await state()).readout;
      const dragStart = await pitchPoint((await state()).camera.focus, 7.5);
      const focusBeforeDrag = (await state()).camera.focus;
      await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down();
      await page.mouse.move(dragStart.x, dragStart.y + 90, { steps: 8 });
      await page.mouse.up(); await ready();
      assert.notEqual((await state()).camera.focus, focusBeforeDrag);
      assert.equal((await state()).readout, readoutBeforeDrag);
      assert.equal((await state()).fixture, initial.fixture);
      await page.locator('#center').click(); await ready();
      assert.equal((await state()).camera.focus, 13);
      await pan(9.5);
      const alden = await pitchPoint(9.5, 7.5);
      await page.mouse.click(alden.x, alden.y);
      assert.match((await state()).readout, /^Square \(9, 7\)/);
      await page.locator('#coordinates').check(); await ready();
      assert.equal(await page.locator('#square-coordinates text').count(), 390);
      await page.locator('#coordinates').uncheck(); await ready();
      assert.equal(await page.locator('#square-coordinates').count(), 0);
      assert.equal(await page.locator("#framing").count(), 0);
      assert.equal((await state()).camera.focus, 9.5);
      assert.equal((await state()).fixture, initial.fixture);
    }
    await page.selectOption('#view', `perspective-35-${end}`); await ready();
    await page.locator('#toggle-tactical').click(); await ready();
    await page.locator('#toggle-tactical').click(); await ready();
    assert.equal((await state()).view, `perspective-35-${end}`);
    report.orientations.push({ end, default: 40, topDown: 90, switching: 'preserved position and fixture',
      controls: ['wheel', 'drag', 'arrows', 'midfield', 'square click', 'coordinates', 'no full-pitch option'] });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    {
      assert.equal(await page.locator('[data-framing]').count(), 0);
      await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
      const sizes = await page.evaluate(() => ({ count: document.images.length,
        decoded: [...document.images].every(i => i.naturalWidth === 1672 && i.naturalHeight === 941),
        overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(sizes.count, 10); assert.equal(sizes.decoded, true); assert.equal(sizes.overflow, false);
      report.layouts.push({ surface: 'gallery', width, ...sizes });
    }
    await page.goto(pathToFileURL(path.join(root, 'viewer.html')).href); await ready();
    for (const view of ['perspective-40-home', 'top-down-home']) {
      await page.selectOption('#view', view); await ready();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      report.layouts.push({ surface: 'viewer', width, view, overflow: false });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'tactical-interaction-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
