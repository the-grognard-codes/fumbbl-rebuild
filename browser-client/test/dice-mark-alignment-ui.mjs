import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/die-mark-alignment', route => route.fulfill({ contentType: 'text/html', body:
    '<style>body{background:#07131f;color:#b6c7d8}</style><div id="app"></div><script type="module" src="/test/dice-mark-alignment-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/die-mark-alignment`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-die-mark-probe] .polygon-die[data-face="POW"]').waitFor();
  const measurements = await page.locator('[data-die-mark-probe] p').evaluateAll(rows => rows.map(row => {
    const die = row.querySelector('.polygon-die');
    const face = die.querySelector('.block-die-side[data-result="true"], .polyhedron-face[data-result="true"]');
    const center = element => { const box = element.getBoundingClientRect(); return box.y + box.height / 2; };
    const marks = die.classList.contains('d8') || die.classList.contains('d16') ? [face.querySelector('text')] : [...face.querySelectorAll('svg path')];
    const markBoxes = marks.map(mark => mark.getBoundingClientRect());
    const markCenter = (Math.min(...markBoxes.map(box => box.top)) + Math.max(...markBoxes.map(box => box.bottom))) / 2;
    const cube = die.querySelector('.block-die-cube');
    const polygon = face.querySelector('polygon');
    return { name: row.textContent.trim().split(':')[0], offset: markCenter - center(die), lineOffset: center(die) - center(row),
      selectedFilter: getComputedStyle(die).filter, numberSize: face.querySelector('text') && getComputedStyle(face.querySelector('text')).fontSize,
      selectedOutline: getComputedStyle(die).outlineColor, coachMarker: die.dataset.coachMarker, coachTitle: die.title,
      cubeWidth: getComputedStyle(cube).width,
      faceBorder: face.classList.contains('block-die-side') ? getComputedStyle(face).borderWidth : null,
      faceStroke: polygon ? getComputedStyle(polygon).stroke : null,
      visibleFaces: [...die.querySelectorAll('.polyhedron-face')].filter(element => getComputedStyle(element).display !== 'none').length,
      hiddenFaces: [...die.querySelectorAll('.polyhedron-face:not([data-result="true"])')]
        .every(element => getComputedStyle(element).display === 'none') };
  }));
  for (const item of measurements) {
    const range = item.name.startsWith('D8') ? [-1.2, -.5] : [-.75, .75];
    assert.ok(item.offset >= range[0] && item.offset <= range[1], `${item.name} marking is centered optically (${item.offset}px from die center)`);
    assert.ok(Math.abs(item.lineOffset) < .5, `${item.name} die remains centered on its text line (${item.lineOffset}px)`);
    if (item.name === 'Block POW') {
      assert.equal(item.selectedFilter, 'none', 'selected log dice have no blue glow');
      assert.equal(item.selectedOutline, 'rgb(73, 223, 255)', 'home selection uses the blue outline');
      assert.equal(item.coachMarker, undefined, 'selected die has no coach letter');
      assert.equal(item.coachTitle, '', 'selected die has no coach badge title');
    }
    if (item.name.startsWith('Block')) assert.equal(item.cubeWidth, '22px', 'block face is sized to match numeric dice');
    if (item.name.startsWith('D6')) assert.equal(item.cubeWidth, '24px', 'numeric face expands after removing its blue border');
    if (item.name.startsWith('D8')) {
      assert.equal(item.cubeWidth, '32px', 'D8 face expands after removing its blue border');
      assert.equal(item.faceStroke, 'none', 'D8 face has no cyan outline');
    }
    if (item.name.startsWith('D16')) {
      assert.equal(item.cubeWidth, '32px', 'D16 face expands after removing its blue border');
      assert.equal(item.faceStroke, 'none', 'D16 face has no cyan outline');
    }
    if (item.name.startsWith('Block') || item.name.startsWith('D6')) assert.equal(item.faceBorder, '0px', `${item.name} face has no cyan outline`);
    if (item.name.startsWith('D8')) assert.equal(item.numberSize, '22px', 'D8 value is large enough to read');
    if (item.name.startsWith('D16')) assert.equal(item.numberSize, '20px', 'D16 value is large enough to read');
    if (item.name.startsWith('D8') || item.name.startsWith('D16')) {
      assert.equal(item.hiddenFaces, true, `${item.name} shows only its numbered face`);
      assert.equal(item.visibleFaces, 1, `${item.name} hides the rest of the solid`);
    }
  }
  assert.deepEqual(measurements.map(item => item.name), ['Block POW', 'Block PUSH', 'Block SKULL', 'D6 pips', 'D8 number', 'D16 number']);
  if (process.env.MATCH_LOG_EVIDENCE_DIR) {
    mkdirSync(process.env.MATCH_LOG_EVIDENCE_DIR, { recursive: true });
    await page.locator('[data-die-mark-probe]').screenshot({ path: resolve(process.env.MATCH_LOG_EVIDENCE_DIR, 'die-mark-alignment.png') });
  }
  console.log('PASS block symbols, D6 pips, D8/D16 faces, centered die slots, coach selection marker');
} finally { await browser.close(); await server.close(); }
