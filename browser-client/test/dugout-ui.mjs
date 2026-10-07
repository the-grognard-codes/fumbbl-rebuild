import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const players = [{ ...base.players[0], id: 'reserve-home', name: 'Home Reserve', role: 'home', x: null, y: null, offPitch: 'reserve' },
  { ...base.players[1], id: 'reserve-away', name: 'Away Reserve', role: 'away', x: null, y: null, offPitch: 'reserve' }];
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(players => { window.dugoutPlayers = players; window.dugoutSelections = []; }, players);
  await page.route('**/dugout-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><div id="app"></div><script type="module" src="/test/dugout-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dugout-test`);
  const home = page.getByRole('region', { name: 'Rovers dugout' });
  const away = page.getByRole('region', { name: 'Crew dugout' });
  await home.waitFor();
  assert.equal(await home.getByRole('button', { name: /Reserves: 1; expand dugout/ }).count(), 1);
  await page.getByRole('button', { name: 'Condense Rovers dugout' }).click();
  assert.equal(await home.getAttribute('class').then(value => value.includes('condensed')), true);
  assert.equal(await home.locator('.live-dugout-zones').count(), 0, 'Condensed home dugout renders only its heading');
  assert.equal(await away.getByRole('button', { name: /Reserves: 1; expand dugout/ }).count(), 1,
    'Condensing home does not change away');
  await page.getByRole('button', { name: 'Restore Rovers dugout' }).click();
  assert.equal(await home.getByRole('button', { name: /Reserves: 1; expand dugout/ }).count(), 1);
  await home.getByRole('button', { name: /Reserves: 1; expand dugout/ }).click();
  const reserve = home.getByRole('button', { name: 'Home Reserve, number 1, Reserves' });
  assert.equal(await home.getAttribute('class').then(value => value.includes('expanded')), true);
  assert.equal(await home.locator('.live-dugout-controls button').count(), 1, 'Expanded view only has the down control');
  assert.equal(await home.locator('.live-dugout-controls path').getAttribute('d'), 'M4 7 10 13 16 7');
  assert.equal(await home.locator('.live-dugout-zone').evaluateAll(elements => elements.every((element, index) => {
    if (!index) return true;
    const current = element.getBoundingClientRect(), prior = elements[index - 1].getBoundingClientRect();
    return Math.abs(current.left - prior.left) < 1 && current.top >= prior.bottom;
  })), true, 'Expanded state categories form one vertical column');
  await reserve.click();
  assert.deepEqual(await page.evaluate(() => window.dugoutSelections), ['reserve-home']);
  await page.getByRole('button', { name: 'Minimize Rovers dugout' }).click();
  assert.equal(await home.getByRole('button', { name: /Reserves: 1; expand dugout/ }).count(), 1, 'Down returns to state counts');
  await page.getByRole('button', { name: 'Condense Rovers dugout' }).click();
  await page.getByRole('button', { name: 'Condense Crew dugout' }).click();
  assert.equal(await home.locator('.live-dugout-zones').count(), 0);
  assert.equal(await away.locator('.live-dugout-zones').count(), 0);
  await page.getByRole('button', { name: 'Restore Rovers dugout' }).click();
  assert.equal(await reserve.count(), 0, 'Up from title-only returns to the middle summary view');
  await page.getByRole('button', { name: 'Expand Rovers dugout' }).click();
  assert.equal(await reserve.count(), 1, 'A second up step returns to the expanded player view');
  assert.equal(await home.locator('.live-dugout-controls path').getAttribute('d'), 'M4 7 10 13 16 7');
  assert.equal(await away.locator('.live-dugout-zones').count(), 0, 'Away remains condensed');
  await page.getByRole('button', { name: 'Restore Crew dugout' }).click();
  assert.equal(await away.getByRole('button', { name: /Reserves: 1; expand dugout/ }).count(), 1,
    'Away restores its own prior compact mode');
  assert.deepEqual(errors, []);
  console.log('PASS: exactly three independent dugout views, up/down-only controls, vertical expansion and reserve selection.');
} finally { await browser.close(); await server.close(); }
