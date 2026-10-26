import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const definitions = JSON.parse(readFileSync(new URL('../../assets/game/ui/player-skill-markers-v1/catalog.json', import.meta.url), 'utf8'));
const ids = ['guard','block','loner','really-stupid','dodge','foul-appearance'];
const data = { version: 1, entries: ids.map(id => ({ id, category: definitions.find(item => item.id === id).category,
  origin: id === 'guard' ? 'base' : 'acquired' })), details: ['Block','Dodge','Foul Appearance','Guard','Loner (4+)','Really Stupid','Working in Tandem'] };
const state = { ...initial, players: Array.from({ length: 12 }, (_, index) => ({ ...initial.players[index % 2],
  id: index === 0 ? 'home1' : index === 1 ? 'away1' : `player${index}`, name: index === 0 ? 'Test Star' : `Player ${index}`,
  number: Math.floor(index / 2) + 1, slot: Math.floor(index / 2) + 1,
  x: 10 + Math.floor(index / 4), y: 5 + index % 4, art: { rosterId: 'human', positionId: 'lineman' },
  skills: data.details, skillMarkers: data })) };
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = process.env.SKILL_MARKERS_EVIDENCE_DIR
  || fileURLToPath(new URL('../../.tools/skill-marker-review/', import.meta.url));
await mkdir(evidence, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('player-skill-markers-v1') && response.status() !== 200) missing.push(response.url()); });
  await page.addInitScript(view => { window.markerInput = { view, replay: false }; window.markerIntents = []; }, state);
  await page.route('**/markers-test', route => route.fulfill({ contentType: 'text/html', body:
    '<style>html,body{margin:0;background:#101c2b}</style><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/skill-markers-harness.tsx"></script>' }));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/markers-test`;
  await page.goto(url); await page.locator('.coach-match').waitFor();
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  const icons = () => page.locator('[data-player-id="home1"] .live-skill-icon');
  const shown = async () => {
    const strip = page.locator('[data-player-id="home1"] .live-skill-markers');
    if (!await strip.count()) return [];
    return (await strip.getAttribute('aria-label')).slice('Skills: '.length).split(', ').map(name => definitions.find(item => item.name === name).id);
  };
  await page.waitForFunction(() => document.querySelectorAll('[data-player-id="home1"] .live-skill-icon').length > 0);
  assert.deepEqual(await shown(), ['loner','really-stupid','block','dodge','foul-appearance']);
  assert.equal(await page.locator('[data-player-id="home1"] .live-skill-overflow').textContent(), `+${5 - await icons().count()}`);
  const menu = page.getByRole('dialog', { name: 'Game Menu', exact: true });
  const open = async () => { await page.getByRole('button', { name: 'Game Menu', exact: true }).click(); await menu.getByRole('tab', { name: 'Skills & Traits', exact: true }).click(); };
  await open();
  assert.equal(await menu.getByRole('checkbox', { name: 'Show player base skills' }).isChecked(), false);
  await menu.getByRole('checkbox', { name: 'Show Big Guy negatraits and Secret Weapon' }).uncheck();
  assert.deepEqual(await shown(), ['loner','block','dodge','foul-appearance']);
  await menu.getByRole('checkbox', { name: 'Show traits', exact: true }).uncheck();
  assert.deepEqual(await shown(), ['block','dodge','foul-appearance']);
  await menu.getByRole('checkbox', { name: 'Show player acquired skills' }).uncheck();
  assert.equal(await icons().count(), 0);
  await menu.getByRole('checkbox', { name: 'Show player base skills' }).check();
  assert.deepEqual(await shown(), ['guard']);
  await menu.getByRole('checkbox', { name: 'Own team', exact: true }).uncheck(); assert.equal(await icons().count(), 0);
  await menu.getByRole('checkbox', { name: 'Own team', exact: true }).check();
  await menu.getByRole('checkbox', { name: 'Opponent', exact: true }).uncheck();
  assert.equal(await page.locator('.live-marker.away .live-skill-icon').count(), 0);
  await menu.getByRole('checkbox', { name: 'Opponent', exact: true }).check();
  await menu.getByRole('checkbox', { name: 'Show player acquired skills' }).check();
  await menu.getByRole('checkbox', { name: 'Show traits', exact: true }).check();
  await menu.getByRole('combobox', { name: 'Skill marker presentation' }).selectOption('illustrated');
  await menu.getByRole('slider', { name: 'Skill marker size' }).focus(); await page.keyboard.press('End');
  assert.match(await icons().first().getAttribute('src'), /illustrated\/loner.png$/);
  await page.screenshot({ path: `${evidence}/settings-desktop.png` });
  await page.keyboard.press('Escape');
  await page.reload(); await open();
  assert.equal(await menu.getByRole('combobox', { name: 'Skill marker presentation' }).inputValue(), 'illustrated');
  assert.equal(await menu.getByRole('slider', { name: 'Skill marker size' }).inputValue(), '2');
  assert.equal(await menu.getByRole('checkbox', { name: 'Show Big Guy negatraits and Secret Weapon' }).isChecked(), false);
  // All settings remain reachable on a short Android-sized viewport.
  await page.setViewportSize({ width: 390, height: 380 });
  await menu.getByRole('slider', { name: 'Skill marker size' }).scrollIntoViewIfNeeded();
  assert.equal(await menu.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await page.screenshot({ path: `${evidence}/settings-mobile.png` });
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.live-marker[data-player-id="home1"]').hover();
  const card = page.getByRole('tooltip', { name: 'Test Star player card' });
  await card.waitFor(); assert.match(await card.textContent(), /Loner \(4\+\).*Working in Tandem/);
  const before = (await icons().first().boundingBox()).height;
  await open(); await menu.getByRole('tab', { name: 'Interface', exact: true }).click();
  await menu.getByRole('button', { name: '2×', exact: true }).click(); await page.keyboard.press('Escape');
  assert.ok((await icons().first().boundingBox()).height > before, 'Markers grow with the projected player square');
  assert.equal(await icons().evaluateAll(images => images.every(image => getComputedStyle(image).pointerEvents === 'none'
    && image.complete && image.naturalWidth > 0 && image.getBoundingClientRect().height >= 20)), true);
  await page.screenshot({ path: `${evidence}/illustrated-pitch-desktop.png` });
  // Replay uses the same persisted preferences but labels teams Home/Away, even for an away coach recording.
  const publish = (view, replay) => page.evaluate(input => window.publishMarkerState(input), { view, replay });
  await publish({ ...state, callerRole: 'away' }, true); await open();
  await menu.getByRole('checkbox', { name: 'Home team', exact: true }).uncheck(); assert.equal(await icons().count(), 0);
  await menu.getByRole('checkbox', { name: 'Home team', exact: true }).check();
  await page.keyboard.press('Escape');
  const withoutDodge = { ...state, revision: 5, players: state.players.map(player => ({ ...player,
    skillMarkers: { ...data, entries: data.entries.filter(entry => entry.id !== 'dodge') } })) };
  await publish(withoutDodge, true); assert.deepEqual(await shown(), ['loner','block','guard','foul-appearance']);
  await publish(state, true); assert.deepEqual(await shown(), ['loner','block','dodge','guard','foul-appearance']);
  // Restored live snapshot uses its own current abilities and keeps the saved style/filter choices.
  await publish(withoutDodge, false); assert.deepEqual(await shown(), ['loner','block','guard','foul-appearance']);
  await page.locator('.live-marker[data-player-id="home1"]').focus();
  await page.getByRole('tooltip', { name: 'Test Star player card' }).waitFor();
  await page.screenshot({ path: `${evidence}/recovered-live-pitch.png` });
  // Historical replay and recovery projections can have distraction but no conditions metadata.
  for (const replay of [true, false]) for (const [posture, label] of [['is prone', 'Prone'], ['has been stunned', 'Stunned']]) {
    const legacy = { ...state, players: state.players.map(({ conditions, ...player }) => player.id === 'home1'
      ? { ...player, state: posture, status: 'Distracted' } : player) };
    await publish(legacy, replay);
    await page.locator('.live-marker[data-player-id="home1"]').focus();
    const legacyCard = page.getByRole('tooltip', { name: 'Test Star player card' });
    await legacyCard.waitFor();
    const status = legacyCard.locator('.live-player-card-detail').filter({ has: page.locator('strong', { hasText: /^Status:?$/ }) });
    assert.equal(await status.locator('p').innerText(), `${label}, Distracted`);
  }
  assert.deepEqual(await page.evaluate(() => window.markerIntents), []);
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  // Touch inspection on an Android browser profile preserves player targeting and full cards.
  const touch = await browser.newContext({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36' });
  const mobile = await touch.newPage();
  await mobile.addInitScript(view => { window.markerInput = { view, replay: false }; window.markerIntents = []; }, state);
  await mobile.route('**/markers-test', route => route.fulfill({ contentType: 'text/html', body:
    '<meta name="viewport" content="width=device-width, initial-scale=1"><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/skill-markers-harness.tsx"></script>' }));
  await mobile.goto(url); await mobile.locator('.live-marker[data-player-id="home1"]').tap();
  await mobile.getByRole('tooltip', { name: 'Test Star player card' }).waitFor();
  await mobile.screenshot({ path: `${evidence}/android-touch-pitch.png` });
  assert.deepEqual(await mobile.evaluate(() => window.markerIntents), []);
  await touch.close();
  console.log('Skill marker UI PASS: all controls, persistence, zoom, dense pitch, cards, replay seeks, recovered snapshots, legacy prone/stunned distraction, short viewport.');
} finally { await browser.close(); await server.close(); }
