// Explicit native smoke on a retained acceptance match. No routes or game rules
// are mocked. Requires existing synthetic identities and an ACTIVE PLAY match.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const origin = 'http://localhost:5000';
assert.match(await (await fetch(`${origin}/firebase-web-config.js`)).text(), /"environment":\s*"local-dev"/);
const tokens = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_TOKENS_FILE, 'utf8'));
const retained = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_RESUME_FROM, 'utf8'));
assert.match(retained.matchId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
for (const role of ['home', 'away']) assert.match(tokens[role].uid, /^acceptance-(home|away)-[0-9a-f-]{36}$/);
const output = resolve(process.env.COACH_ACCEPTANCE_EVIDENCE ?? '../.tools/debug-performance/native-focused'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], clients = [];
try {
  for (const role of ['home', 'away']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await context.newPage();
    const client = { role, page, state: null }; clients.push(client);
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framereceived', event => { const message = JSON.parse(String(event.payload)); if (message.type === 'setupState' && message.state) client.state = message.state; }));
    await page.goto(`${origin}/login`);
    await page.evaluate(async token => {
      const { authentication } = await import('/assets/auth-client.js');
      const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signInWithCustomToken(authentication().auth, token);
    }, tokens[role].token);
    await page.goto(`${origin}/play/match?matchId=${retained.matchId}`); await page.getByLabel('Live match pitch').waitFor();
  }
  const view = clients[0].state; assert.equal(view.phase, 'PLAY'); assert.equal(view.saveResume.status, 'ACTIVE');
  const client = clients.find(client => client.role === view.actor), page = client.page;
  await page.bringToFront();
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByLabel('Diagnostics display').selectOption('graph');
  const overlay = page.getByLabel('Performance diagnostics', { exact: true });
  await overlay.getByText(/server timing enabled/).waitFor();
  await page.getByRole('button', { name: 'Close debug panel', exact: true }).click();
  const profileSession = process.env.COACH_ACCEPTANCE_CPU_PROFILE === '1' ? await page.context().newCDPSession(page) : null;
  const traceEvents = []; let traceTruncated = false;
  if (profileSession) {
    profileSession.on('Tracing.dataCollected', ({ value }) => {
      if (traceEvents.length + value.length > 20000) traceTruncated = true;
      traceEvents.push(...value.slice(0, Math.max(0, 20000 - traceEvents.length)));
    });
    await profileSession.send('Profiler.enable'); await profileSession.send('Profiler.start');
    await profileSession.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
  }
  const before = client.state.revision;
  await page.getByRole('button', { name: 'End Turn', exact: true }).click();
  const confirmation = page.getByText('Unactivated players remain. Confirm to end this turn.', { exact: true });
  if (await confirmation.isVisible()) await page.getByRole('button', { name: 'Confirmed!', exact: true }).click();
  await overlay.locator('.performance-readouts p').filter({ hasText: 'Action RTT' }).filter({ hasNotText: 'No samples' }).waitFor();
  await page.waitForTimeout(2000);
  if (profileSession) {
    const { profile } = await profileSession.send('Profiler.stop');
    const complete = new Promise(resolve => profileSession.once('Tracing.tracingComplete', resolve));
    await profileSession.send('Tracing.end'); await complete;
    await writeFile(resolve(output, 'native-response.cpuprofile'), JSON.stringify(profile));
    await writeFile(resolve(output, 'native-response-trace.json'), JSON.stringify({ traceEvents, truncated: traceTruncated }));
  }
  assert.ok(client.state.revision > before, 'An authorized UI action advanced the native revision');
  await overlay.getByRole('button', { name: 'Pause', exact: true }).click();
  const downloadWait = page.waitForEvent('download'); await overlay.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadWait, capture = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.ok(capture.capture.samples.some(sample => sample.kind === 'rtt' && sample.category === 'mutation'));
  assert.ok(capture.capture.samples.some(sample => sample.kind === 'handling'));
  assert.equal(capture.capture.server, 'enabled'); assert.deepEqual(errors, []);
  for (const privateValue of [retained.matchId, tokens.home.uid, tokens.away.uid, tokens.home.token, tokens.away.token]) assert.equal(JSON.stringify(capture).includes(privateValue), false);
  await writeFile(resolve(output, 'diagnostics-capture.json'), JSON.stringify(capture, null, 2));
  await page.screenshot({ path: resolve(output, 'diagnostics-overlay.png') });
  await overlay.getByRole('button', { name: 'Off', exact: true }).click(); await overlay.waitFor({ state: 'detached' });
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, nativeEngine: true, mutation: 'endTurn',
    metrics: [...new Set(capture.capture.samples.map(sample => sample.kind))], capability: capture.capture.server,
    privacy: 'passed', off: 'passed', scope: 'two coaches, one native UI action; not spectator or full-match acceptance' }, null, 2));
  console.log('Native diagnostics passed: authenticated negotiation, UI action RTT, server durations, private export and Off teardown.');
} finally { await browser.close(); }
