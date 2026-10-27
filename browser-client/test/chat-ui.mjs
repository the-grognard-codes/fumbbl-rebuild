import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

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
  await page.route('**/chat-test*', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/test/chat-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat-test`);
  const chatEntry = page.locator('.match-chat-scroll p span').first();
  const logEntry = page.locator('.match-event-scroll p').first();
  await chatEntry.waitFor(); await logEntry.waitFor();
  assert.equal(await page.locator('.match-chat-count, .match-chat-compose').count(), 0);
  const size = async selector => page.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  for (const [name, pixels] of [['Small', 10], ['Medium', 12], ['Large', 14]]) {
    await page.getByRole('button', { name: `${name} chat text` }).click();
    assert.equal(await size('.match-chat-scroll p span'), pixels, `${name} applies to rendered chat text`);
    assert.equal(await size('.match-event-scroll p'), 12, 'Chat size does not change log entries');
  }
  await page.getByRole('button', { name: 'Small chat text' }).click();
  await page.getByRole('button', { name: 'Large log text' }).click();
  assert.equal(await size('.match-chat-scroll p span'), 10);
  assert.equal(await size('.match-event-scroll p'), 14);
  await page.reload(); await chatEntry.waitFor(); await logEntry.waitFor();
  assert.equal(await size('.match-chat-scroll p span'), 10, 'Chat preference survives reload');
  assert.equal(await size('.match-event-scroll p'), 14, 'Log preference remains independent after reload');
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
    10, 'Incoming chat keeps selected size');
  await draft.press('Escape');
  await page.locator('.match-chat').focus(); await page.keyboard.press('Enter');
  assert.equal(await draft.count(), 1, 'Enter still opens chat from the match');
  await draft.press('Escape');
  const messages = Array.from({ length: 80 }, (_, index) => ({ ...fixture.messages[0], index, text: `Message ${index}` }));
  const publish = async input => {
    await page.evaluate(messages => window.publishChatMessages(messages), input);
    await page.waitForFunction(count => document.querySelectorAll('.match-chat-scroll p').length === count, input.length);
  };
  const pane = page.locator('.match-chat-scroll');
  const position = () => pane.evaluate(element => element.scrollTop);
  const bottom = () => pane.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
  const notifier = page.getByRole('status', { name: 'Unread chat messages' });
  await publish(messages);
  await pane.evaluate(element => { element.scrollTop = 100; element.dispatchEvent(new Event('scroll')); });
  const before = await position();
  const chatWidth = await page.locator('.match-history-chat').evaluate(element => element.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Minimize chat', exact: true }).click();
  assert.equal(await pane.isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Small chat text' }).count(), 0);
  assert.equal(await page.locator('.match-history-chat').evaluate(element => element.getBoundingClientRect().width), chatWidth);
  await page.locator('.match-chat').focus(); await page.keyboard.press('Enter');
  assert.equal(await draft.count(), 0, 'Minimized chat does not open an invisible composer');
  messages.push({ ...messages[0], index: 80, text: 'Arrived while minimized' });
  await publish(messages); await notifier.waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await notifier.evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.getByRole('button', { name: 'Restore chat', exact: true }).click();
  assert.ok(Math.abs(await position() - before) <= 1, 'Restoring chat preserves the position above new messages');
  assert.equal(await notifier.isVisible(), true, 'Opening alone does not mark new messages read');
  await bottom(); await notifier.waitFor({ state: 'detached' });
  const previousBottom = await position();
  await page.getByRole('button', { name: 'Minimize chat', exact: true }).click();
  for (let index = 81; index < 91; index++) messages.push({ ...messages[0], index, text: `Hidden arrival ${index}` });
  await publish(messages); await notifier.waitFor();
  await page.getByRole('button', { name: 'Restore chat', exact: true }).click();
  assert.ok(Math.abs(await position() - previousBottom) <= 1, 'Minimizing at bottom also freezes the old position');
  assert.equal(await notifier.isVisible(), true);
  await bottom(); await notifier.waitFor({ state: 'detached' });
  messages.push({ ...messages[0], index: 91, text: 'Visible arrival at bottom' });
  await publish(messages);
  assert.ok(await pane.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight <= 1));
  assert.equal(await notifier.count(), 0);
  await pane.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  messages.push({ ...messages[0], index: 92, text: 'Visible arrival while reading older messages' });
  await publish(messages); await notifier.waitFor();
  assert.equal(await position(), 0);
  await bottom(); await notifier.waitFor({ state: 'detached' });

  const records = Array.from({ length: 80 }, (_, index) => ({ ...fixture.records[0], index, revision: index + 1 }));
  await page.evaluate(records => window.publishLogRecords(records), records);
  await page.waitForFunction(() => document.querySelectorAll('.match-event-scroll p').length > 20);
  await page.locator('.match-event-scroll').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  await page.getByRole('button', { name: 'Minimize game log', exact: true }).click();
  await page.getByRole('button', { name: 'Restore game log', exact: true }).click();
  assert.ok(await page.locator('.match-event-scroll').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight <= 1), 'Restoring log always shows latest entries');
  await page.getByRole('button', { name: 'Expand game log', exact: true }).click();
  await page.getByRole('button', { name: 'Minimize chat', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Restore chat', exact: true }).waitFor();
  assert.equal(await page.locator('.match-history-log').getAttribute('data-window-size'), 'maximized', 'Each size preference survives recovery/reload independently');
  assert.equal(await page.getByRole('button', { name: 'Expand game log', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Restore chat', exact: true }).click();
  await page.getByRole('button', { name: 'Minimize game log', exact: true }).click();
  assert.equal(await page.locator('.match-history-log').getAttribute('data-window-size'), 'default');
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat-test?replay`);
  await page.getByRole('tab', { name: 'Log', exact: true }).waitFor();
  assert.equal(await page.locator('.match-window-controls').count(), 0, 'Replay keeps its existing tabbed history');
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  assert.equal(await pane.isVisible(), true);
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
