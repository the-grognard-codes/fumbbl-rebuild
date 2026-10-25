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
    const face = die.querySelector('.block-die-side[data-result="true"]') ?? die;
    const center = element => { const box = element.getBoundingClientRect(); return box.y + box.height / 2; };
    const marks = die.classList.contains('d8') || die.classList.contains('d16') ? [face.querySelector('text')] : [...face.querySelectorAll('svg path')];
    const markBoxes = marks.map(mark => mark.getBoundingClientRect());
    const markCenter = (Math.min(...markBoxes.map(box => box.top)) + Math.max(...markBoxes.map(box => box.bottom))) / 2;
    const cube = die.querySelector('.block-die-cube');
    const polygon = face.querySelector('polygon');
    const textLine = document.createRange();
    textLine.selectNodeContents(row.firstChild);
    const graphic = polygon ?? face;
    const graphicBox = graphic.getBoundingClientRect();
    return { name: row.textContent.trim().split(':')[0], offset: markCenter - center(die), lineOffset: center(die) - center(row),
      graphicOffset: markCenter - (polygon ? graphicBox.top + graphicBox.height * 2 / 3 : center(face)),
      bottomOffset: graphicBox.bottom - textLine.getBoundingClientRect().bottom,
      selectedFilter: getComputedStyle(die).filter, numberSize: face.querySelector('text') && getComputedStyle(face.querySelector('text')).fontSize,
      selectedOutline: getComputedStyle(die).outlineColor, coachMarker: die.dataset.coachMarker, coachTitle: die.title,
      cubeWidth: cube && getComputedStyle(cube).width,
      dieWidth: die.getBoundingClientRect().width,
      faceBorder: face.classList.contains('block-die-side') ? getComputedStyle(face).borderWidth : null,
      faceStroke: polygon ? getComputedStyle(polygon).stroke : null,
      visibleFaces: [...die.querySelectorAll('.polyhedron-face')].filter(element => getComputedStyle(element).display !== 'none').length,
      hiddenFaces: [...die.querySelectorAll('.polyhedron-face:not([data-result="true"])')]
        .every(element => getComputedStyle(element).display === 'none') };
  }));
  for (const item of measurements) {
    const triangle = item.name.startsWith('D8') || item.name.startsWith('D16');
    assert.ok(Math.abs(item.graphicOffset) <= .75, `${item.name} marking is centered within its graphic (${item.graphicOffset}px)`);
    assert.ok(Math.abs(item.bottomOffset) < .5, `${item.name} graphic is flush with text-line bottom (${item.bottomOffset}px)`);
    if (item.name === 'Block POW') {
      assert.equal(item.selectedFilter, 'none', 'selected log dice have no blue glow');
      assert.equal(item.selectedOutline, 'rgb(73, 223, 255)', 'home selection uses the blue outline');
      assert.equal(item.coachMarker, undefined, 'selected die has no coach letter');
      assert.equal(item.coachTitle, '', 'selected die has no coach badge title');
    }
    if (item.name.startsWith('Block') || item.name.startsWith('D6')) assert.equal(item.cubeWidth, '24px', 'cube face scales with the inherited text size');
    if (item.name.startsWith('Block') || item.name.startsWith('D6')) assert.equal(item.faceBorder, '0px', `${item.name} face has no cyan outline`);
    if (triangle) {
      assert.equal(item.numberSize, '16px', 'numeric values share the same legible triangle typography');
      assert.equal(item.cubeWidth, null, 'log triangles do not render transformed solids');
      assert.equal(item.faceStroke, 'none', 'triangle has no cyan outline');
    }
  }
  assert.deepEqual(measurements.map(item => item.name), ['Block POW', 'Block PUSH', 'Block SKULL', 'D6 pips', 'D8 number', 'D16 number']);
  for (const fontSize of [10, 12, 14]) {
    await page.locator('[data-die-mark-probe]').evaluate((element, size) => { element.style.fontSize = `${size}px`; }, fontSize);
    const offsets = await page.locator('[data-die-mark-probe] p').evaluateAll(rows => rows.map(row => {
      const die = row.querySelector('.polygon-die');
      const graphic = die.querySelector('polygon') ?? die.querySelector('[data-result="true"]');
      const text = document.createRange(); text.selectNodeContents(row.firstChild);
      return graphic.getBoundingClientRect().bottom - text.getBoundingClientRect().bottom;
    }));
    assert.ok(offsets.every(offset => Math.abs(offset) < .5), `${fontSize}px: every graphic shares its text-line bottom (${offsets})`);
  }
  if (process.env.MATCH_LOG_EVIDENCE_DIR) {
    mkdirSync(process.env.MATCH_LOG_EVIDENCE_DIR, { recursive: true });
    await page.locator('[data-die-mark-probe]').screenshot({ path: resolve(process.env.MATCH_LOG_EVIDENCE_DIR, 'die-mark-alignment.png') });
  }
  console.log('PASS block symbols, D6 pips, D8/D16 faces, bottom-aligned graphics, coach selection marker');
} finally { await browser.close(); await server.close(); }
