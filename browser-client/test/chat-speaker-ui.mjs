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
  const native = JSON.parse(readFileSync(new URL('./fixtures/chat-speakers.json', import.meta.url), 'utf8'));
  const messages = native.pages.flatMap(page => page.messages);
  const expected = messages.map(message => message.role === 'home' ? 'Rovers' : message.role === 'away' ? 'Crew' : `Spectator${message.spectatorNumber}`);
  for (const viewer of ['home', 'away', 'spectator']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(fixture => { window.chatFixture = fixture; window.chatSent = []; }, { ...fixture, messages });
    await page.route('**/chat-test', route => route.fulfill({ contentType: 'text/html', body:
      '<style>html,body{margin:0;height:100%;background:#07131f;font-family:system-ui,sans-serif}.play-runtime{height:100%}</style><div id="app"></div><script type="module" src="/test/chat-ui-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat-test`);
    await page.locator('.match-chat-scroll strong').first().waitFor();
    assert.deepEqual(await page.locator('.match-chat-scroll strong').allTextContents(), expected, viewer);
    const colors = await page.locator('.match-chat-scroll strong').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.dataset.speakerRole, getComputedStyle(element).color])));
    assert.equal(colors.spectator, 'rgb(214, 181, 241)');
    assert.equal(new Set(Object.values(colors)).size, 3, 'Each coach and spectators have distinct colors');
    await page.evaluate(input => window.publishChatScenario(input), { messages: native.late.messages });
    assert.deepEqual(await page.locator('.match-chat-scroll strong').allTextContents(), ['Rovers', 'Rovers', 'Rovers', 'Spectator3', 'Spectator1']);
    await page.evaluate(input => window.publishChatScenario(input), { messages: messages.slice(0, 5), names: { home: 'Rovers', away: 'Rovers' } });
    assert.deepEqual(await page.locator('.match-chat-scroll strong').allTextContents(), ['Rovers (Home)', 'Spectator1', 'Rovers (Away)', 'Spectator2', 'Spectator1']);
    await page.evaluate(input => window.publishChatScenario(input), { messages: [], unavailable: true });
    assert.equal(await page.locator('.match-chat-scroll strong').textContent(), 'Match');
    const systemColor = await page.locator('.match-chat-scroll strong').evaluate(element => getComputedStyle(element).color);
    assert.notEqual(systemColor, colors.spectator);
    await page.reload(); await page.locator('.match-chat-scroll strong').first().waitFor();
    assert.deepEqual(await page.locator('.match-chat-scroll strong').allTextContents(), expected, 'History reload preserves every ordinal');
    if (process.env.CHAT_SPEAKER_EVIDENCE_DIR) {
      const directory = process.env.CHAT_SPEAKER_EVIDENCE_DIR;
      await import('node:fs/promises').then(fs => fs.mkdir(directory, { recursive: true }));
      await page.evaluate(input => window.publishChatScenario(input), { messages: messages.slice(0, 5) });
      await page.locator('.match-chat-scroll').evaluate(element => { element.scrollTop = 0; });
      await page.locator('.match-chat').screenshot({ path: `${directory}/${viewer}-speaker-labels.png` });
    }
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: native first-post spectator ordinals across paging/reload, team-only coach labels, same-name qualifiers and distinct MUTP speaker colors for every viewer.');
} finally { await browser.close(); await server.close(); }
