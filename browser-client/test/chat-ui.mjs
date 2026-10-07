import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const fixture = {
  messages: [{ index: 0, at: 1_700_000_000_000, revision: 1, authorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    role: 'home', text: 'Opening chat entry' }],
  records: [{ index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 1_700_000_000_000, decision: {},
    state: base, native: [{ reportList: { reports: [{ reportId: 'dodgeRoll', playerId: base.players[0].id,
      roll: 4, minimumRoll: 3, successful: true }] } }] }]
};
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(fixture => { window.chatFixture = fixture; window.chatSent = []; }, fixture);
  await page.route('**/chat-test', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/test/chat-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat-test`);
  const chatEntry = page.locator('.match-chat-scroll p span').first();
  const logEntry = page.locator('.match-event-scroll p').first();
  await chatEntry.waitFor(); await logEntry.waitFor();
  assert.equal(await page.locator('.match-chat-count, .match-chat-compose').count(), 0);
  const size = async selector => page.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  for (const [name, pixels] of [['Small', 12], ['Medium', 14], ['Large', 18]]) {
    await page.getByRole('button', { name: `${name} chat text` }).click();
    assert.equal(await size('.match-chat-scroll p span'), pixels, `${name} applies to rendered chat text`);
    assert.equal(await size('.match-event-scroll p'), 14, 'Chat size does not change log entries');
  }
  await page.getByRole('button', { name: 'Small chat text' }).click();
  await page.getByRole('button', { name: 'Large log text' }).click();
  assert.equal(await size('.match-chat-scroll p span'), 12);
  assert.equal(await size('.match-event-scroll p'), 18);
  await page.reload(); await chatEntry.waitFor(); await logEntry.waitFor();
  assert.equal(await size('.match-chat-scroll p span'), 12, 'Chat preference survives reload');
  assert.equal(await size('.match-event-scroll p'), 18, 'Log preference remains independent after reload');
  await chatEntry.click();
  const draft = page.getByLabel('Message the match'); await draft.waitFor();
  await draft.fill('Saved draft'); await draft.press('Escape');
  assert.equal(await draft.count(), 0, 'Escape closes the composer');
  await page.getByRole('button', { name: 'Click chat or press Enter to write' }).click();
  assert.equal(await draft.inputValue(), 'Saved draft', 'Pointer entry restores the draft');
  await draft.fill('Sent from chat'); await draft.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.chatSent), ['Sent from chat']);
  assert.equal(await page.locator('.match-chat-scroll p span').last().textContent(), 'Sent from chat');
  assert.equal(await page.locator('.match-chat-scroll p span').last().evaluate(element => parseFloat(getComputedStyle(element).fontSize)),
    12, 'Incoming chat keeps selected size');
  await draft.press('Escape');
  await page.locator('.match-chat').focus(); await page.keyboard.press('Enter');
  assert.equal(await draft.count(), 1, 'Enter still opens chat from the match');
  assert.deepEqual(errors, []);
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 667 } });
  const touchPage = await touch.newPage();
  await touchPage.addInitScript(fixture => { window.chatFixture = fixture; window.chatSent = []; }, fixture);
  await touchPage.route('**/chat-test', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/test/chat-ui-harness.tsx"></script>' }));
  await touchPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat-test`);
  await touchPage.getByRole('button', { name: 'Click chat or press Enter to write' }).tap();
  assert.equal(await touchPage.getByLabel('Message the match').isVisible(), true, 'Touch opens the composer');
  await touch.close();
  console.log('PASS: independent persisted chat/log sizes on actual entries, mouse/touch/keyboard chat entry, draft, send and incoming message.');
} finally { await browser.close(); await server.close(); }
