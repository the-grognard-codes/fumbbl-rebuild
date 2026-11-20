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
    const svg = die.querySelector(':scope > svg');
    const center = element => { const box = element.getBoundingClientRect(); return box.y + box.height / 2; };
    const number = svg.querySelector('text');
    const marks = number ? [number] : [...svg.querySelectorAll('path')];
    const markBoxes = marks.map(mark => mark.getBoundingClientRect());
    const markCenter = (Math.min(...markBoxes.map(box => box.top)) + Math.max(...markBoxes.map(box => box.bottom))) / 2;
    const polygon = svg.querySelector('polygon');
    const textLine = document.createRange();
    textLine.selectNodeContents(row.firstChild);
    const graphic = polygon ?? die;
    const graphicBox = graphic.getBoundingClientRect();
    return { name: row.textContent.trim().split(':')[0],
      graphicOffset: markCenter - (polygon ? graphicBox.top + graphicBox.height * 2 / 3 : center(die)),
      bottomOffset: graphicBox.bottom - textLine.getBoundingClientRect().bottom,
      selectedFilter: getComputedStyle(die).filter, numberSize: number && getComputedStyle(number).fontSize,
      selectedOutline: getComputedStyle(die).outlineColor, coachMarker: die.dataset.coachMarker, coachTitle: die.title,
      dieHeight: die.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(die).fontSize),
      layeredFaces: die.querySelectorAll('.block-die-cube, .polyhedron-face').length,
      faceStroke: polygon ? getComputedStyle(polygon).stroke : null };
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
    assert.equal(item.layeredFaces, 0, 'settled log dice have a single flat face');
    if (triangle) {
      assert.equal(item.numberSize, '16px', 'numeric values share the same legible triangle typography');
      assert.equal(item.faceStroke, 'none', 'triangle has no cyan outline');
    } else assert.equal(item.dieHeight, item.fontSize * 1.5, 'flat face height scales with the inherited text size');
  }
  assert.deepEqual(measurements.map(item => item.name), ['Block POW', 'Block PUSH', 'Block SKULL', 'D6 pips', 'D8 number', 'D16 number']);
  for (const fontSize of [10, 12, 14]) {
    await page.locator('[data-die-mark-probe]').evaluate((element, size) => { element.style.fontSize = `${size}px`; }, fontSize);
    const offsets = await page.locator('[data-die-mark-probe] p').evaluateAll(rows => rows.map(row => {
      const die = row.querySelector('.polygon-die');
      const graphic = die.querySelector('polygon') ?? die;
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
