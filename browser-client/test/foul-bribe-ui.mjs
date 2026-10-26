import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const journeys = ['bribe-6.json', 'bribe-1.json', 'bribe-decline.json'].flatMap(name =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')).map(journey => ({ ...journey, file: name })));
const evidence = fileURLToPath(new URL('../../.tools/validation/foul-bribe/', import.meta.url));
mkdirSync(evidence, { recursive: true });
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MatchDecisionDialog } from '/src/MatchDecisionDialog.tsx';
import { LiveMatchScoreboard } from '/src/LiveMatchScoreboard.tsx';
import { matchDecision } from '/src/match-decision.ts';
import '/src/play-brand.css';
import '/src/coach-match.css';
import '/src/ui-round-four.css';
function Review() {
  const [view, setView] = React.useState(null), [pending, setPending] = React.useState(false);
  window.showView = next => flushSync(() => { setPending(false); setView(next); });
  const decision = view ? matchDecision(view, view.actions) : null;
  return React.createElement('main', { className: 'play-runtime live-match-page' },
    React.createElement('section', { className: 'hosted-match coach-match' },
      view && React.createElement(LiveMatchScoreboard, { view }),
      decision && React.createElement(MatchDecisionDialog, { key: decision.key, decision, disabled: pending, activeX: null,
        onChoice: () => { throw Error('Unexpected local choice'); },
        onAction: id => { window.selected.push(id); setPending(true); } })));
}
window.selected = [];
createRoot(document.getElementById('app')).render(React.createElement(Review));
`;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  plugins: [{ name: 'foul-bribe-review', resolveId(id) { if (id === '/bribe-review.tsx') return '\0bribe-review.tsx'; },
    load(id) { if (id === '\0bribe-review.tsx') return harness; } }], server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 412, height: 915 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/bribe-review', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module" src="/bribe-review.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/bribe-review`);
    await page.waitForFunction(() => typeof window.showView === 'function');
    for (const journey of journeys) {
      for (const callerRole of [journey.role === 'home' ? 'away' : 'home', 'spectator']) {
        await page.evaluate(view => window.showView(view), { ...journey.bribe, callerRole });
        assert.equal(await page.getByRole('dialog').count(), 0, 'Only the fouling coach can decide');
      }
      await page.evaluate(view => window.showView(view), journey.argue);
      const noArgue = journey.argue.actions.find(action => action.id.endsWith('argue:no'));
      await page.getByRole('button', { name: noArgue.label, exact: true }).click();
      assert.equal(await page.evaluate(() => window.selected.at(-1)), noArgue.id);
      await page.evaluate(view => window.showView(view), journey.bribe);
      const dialog = page.getByRole('dialog');
      await page.getByRole('heading', { name: 'Use a bribe?', exact: true }).waitFor();
      assert.equal(await dialog.getByRole('button').count(), 2);
      const action = journey.bribe.actions.find(action => action.id === journey.actionId);
      await dialog.getByRole('button', { name: action.label, exact: true }).click();
      assert.equal(await page.evaluate(() => window.selected.at(-1)), journey.actionId);
      for (const button of await dialog.getByRole('button').all()) assert.equal(await button.isDisabled(), true);
      await page.evaluate(view => window.showView(view), journey.result);
      assert.equal(await page.getByRole('dialog').count(), 0);
      const expected = journey.file === 'bribe-decline.json' ? 1 : 0;
      const resources = page.locator(`.live-resources.${journey.role} .live-resource.bribe`);
      assert.equal(await resources.count(), expected);
    }
    await page.reload();
    await page.waitForFunction(() => typeof window.showView === 'function');
    await page.evaluate(view => window.showView(view), journeys[0].bribe);
    await page.getByRole('heading', { name: 'Use a bribe?', exact: true }).waitFor();
    await page.screenshot({ path: `${evidence}/bribe-${viewport.width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: native foul -> decline Argue -> use/decline bribe for both coaches; success/failure, resource spending, pending input, observer isolation, desktop/Android and reload.');
} finally { await browser.close(); await server.close(); }
