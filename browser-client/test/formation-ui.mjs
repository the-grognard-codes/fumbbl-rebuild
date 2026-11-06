import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';
import { starterFormations } from '../src/team-formations.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const draft = { players: Array.from({ length: 12 }, (_, index) => ({ jerseyNumber: index + 1 })) };
const evidence = fileURLToPath(new URL('../../.notes/deployment-formations-evidence/', import.meta.url));
await mkdir(evidence, { recursive: true });
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 1000 }, hasTouch: touch, isMobile: touch });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(draft => { window.formationDraft = draft; window.formationSaves = []; }, draft);
    await page.route('**/formation-editor-test', route => route.fulfill({ contentType: 'text/html', body: `
      <meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#101c2b;color:#edf5ff;font:16px sans-serif}button{padding:.5rem;background:#254b66;color:#edf5ff;border:1px solid #40637e}input{padding:.5rem;background:#07111d;color:#edf5ff}</style>
      <main id="app"></main><script type="module" src="/test/formation-manager-harness.tsx"></script>` }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/formation-editor-test`);
    await page.getByRole('button', { name: 'Open formations' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.locator('[data-formation-cell]').count(), 195);
    assert.equal(await dialog.locator('.formation-grid .formation-chit').count(), 11);
    assert.equal(await dialog.getByRole('button', { name: 'Save formation', exact: true }).isEnabled(), true);
    const gridCell = (column, depth) => dialog.locator(`[data-formation-cell][data-column="${column}"][data-depth="${depth}"]`);
    if (touch) await gridCell(7, 0).tap(); else await gridCell(7, 0).click();
    assert.equal(await dialog.locator('.formation-grid .formation-chit').count(), 11, 'Selecting a deployed chit preserves exactly eleven assignments');
    assert.equal(await dialog.getByRole('button', { name: 'Save formation', exact: true }).isEnabled(), true);
    if (touch) {
      await dialog.getByRole('button', { name: 'Select number 12', exact: true }).tap();
      await gridCell(7, 5).tap();
    } else {
      await dialog.getByRole('button', { name: 'Select number 12', exact: true }).scrollIntoViewIfNeeded();
      const source = await dialog.getByRole('button', { name: 'Select number 12', exact: true }).boundingBox();
      const target = await gridCell(7, 5).boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down(); await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 }); await page.mouse.up();
    }
    await gridCell(7, 5).getByText('12', { exact: true }).waitFor();
    if (!touch) {
      await gridCell(7, 4).click();
      await gridCell(7, 4).getByText('12', { exact: true }).waitFor({ timeout: 2000 });
    }
    assert.equal(await dialog.getByRole('button', { name: 'Save formation', exact: true }).isDisabled(), true, 'Twelve assignments cannot be saved');
    await dialog.getByRole('button', { name: 'Reserves', exact: true }).click();
    await dialog.getByRole('button', { name: 'Select number 12', exact: true }).waitFor();
    await dialog.getByLabel('Formation name').fill('Renamed Offense');
    await page.screenshot({ path: `${evidence}/${touch ? 'editor-mobile' : 'editor-desktop'}.png`, fullPage: true });
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Dialog fits viewport without horizontal overflow');
    await dialog.getByRole('button', { name: 'Save formation', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await page.evaluate(() => window.formationSaves)).at(-1).offense[0].name, 'Renamed Offense');
    await page.getByRole('button', { name: 'Open formations' }).click();
    await dialog.getByLabel('Formation name').fill('Discard This');
    await dialog.getByRole('button', { name: 'Close formation manager' }).click();
    await page.getByRole('button', { name: 'Open formations' }).click();
    assert.equal(await dialog.getByLabel('Formation name').inputValue(), 'Renamed Offense');
    await dialog.getByRole('button', { name: 'Create offensive formation' }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Save formation', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Delete formation', exact: true }).click();
    await dialog.getByRole('button', { name: /Renamed Offense.*Default/ }).click();
    await dialog.getByRole('button', { name: 'Delete formation', exact: true }).click();
    await dialog.getByRole('button', { name: /7-2-2 Offense.*Default/ }).click();
    await dialog.getByRole('button', { name: 'Delete formation', exact: true }).click();
    await dialog.getByRole('button', { name: /Chevron Defense.*Default/ }).click();
    await dialog.getByRole('button', { name: 'Delete formation', exact: true }).click();
    await dialog.getByRole('button', { name: /Anchor Defense.*Default/ }).click();
    await dialog.getByRole('button', { name: 'Delete formation', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save formation changes' }).click();
    await page.getByRole('button', { name: 'Open formations' }).click();
    assert.equal(await dialog.locator('.formation-list button').count(), 0, 'Deleted defaults do not regenerate');
    await dialog.getByRole('button', { name: 'Close formation manager' }).click();
    const populated = starterFormations(draft.players);
    for (const role of ['offense', 'defense']) populated[role] = Array.from({ length: 3 }, (_, index) => ({
      ...structuredClone(populated[role][0]), name: `${role} ${index + 1}`
    }));
    populated.offense[1].players = populated.offense[1].players.map(player => player.jerseyNumber === 1 ? { ...player, jerseyNumber: 99 } : player);
    await page.evaluate(formations => { window.formationDraft.formations = formations; }, populated);
    await page.getByRole('button', { name: 'Open formations' }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Create offensive formation' }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Create defensive formation' }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'offense 2', exact: true }).click();
    assert.equal(await dialog.locator('.formation-chit.missing').textContent(), '99');
    await dialog.getByRole('button', { name: 'Make default', exact: true }).click();
    const originalSquare = gridCell(5, 0);
    await originalSquare.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await gridCell(5, 1).locator('.formation-chit').textContent(), '10', 'Keyboard can move a selected chit');
    await dialog.getByRole('button', { name: 'Save formation', exact: true }).click();
    assert.equal((await page.evaluate(() => window.formationSaves)).at(-1).offense[0].name, 'offense 2');

    assert.deepEqual(errors, []);
    await page.close();
  }

  const frame = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
  const setup = { ...frame, phase: 'SETUP', turnMode: 'SETUP', actor: 'home', callerRole: 'home', actions: [], activePlayerId: null,
    savedFormations: [{ name: '5-4-2 Offense', index: 0 }, { name: 'Short', index: 1 }, { name: 'Sixteen Char Max', index: 2 }] };
  delete setup.playerActionMenu;
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, setup);
    await page.route('**/formation-setup-test', route => route.fulfill({ contentType: 'text/html', body:
      '<meta name="viewport" content="width=device-width, initial-scale=1"><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/formation-setup-test`);
    const container = page.getByRole('region', { name: 'Saved Formations' });
    await container.waitFor();
    const buttons = await container.getByRole('button').all();
    const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
    assert.ok(boxes.every(box => Math.abs(box.width - boxes[0].width) < 1));
    const confirm = await page.getByRole('button', { name: 'Confirmed!', exact: true }).boundingBox();
    const box = await container.boundingBox();
    assert.ok(box.y >= confirm.y + confirm.height && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'Formation controls sit below Confirm and fit the match');
    assert.ok(Math.abs(box.y - confirm.y - confirm.height - 29) < 1, 'Confirm retains its original spacing above the formation box');
    const historyBoxes = await Promise.all(['.match-history-chat', '.match-history-log'].map(selector => page.locator(selector).boundingBox()));
    if (width > 600) {
      for (const historyBox of historyBoxes) assert.ok(Math.abs(box.y + box.height - historyBox.y - historyBox.height) < 1,
        `Formation and history bottoms align at ${width}px: formation ${box.y + box.height}, history ${historyBox.y + historyBox.height}`);
    } else {
      for (const historyBox of historyBoxes) assert.ok(confirm.y >= historyBox.y + historyBox.height,
        'Phone setup controls remain below the stacked history panels');
    }
    await buttons[1].click();
    assert.deepEqual((await page.evaluate(() => window.hudIntents)).at(-1), { operation: 'formation', fields: { formationIndex: 1 } });
    assert.equal(await buttons[0].isDisabled(), true, 'Pending mutations disable selection');
    await page.screenshot({ path: `${evidence}/setup-${width}.png` });
    await page.evaluate(state => { const next = { ...state, revision: state.revision + 1 }; delete next.savedFormations; window.publishHud(next); }, setup);
    await container.waitFor({ state: 'hidden' });
    await page.close();
  }
  assert.equal(starterFormations(draft.players).offense.length, 2);
  console.log('Formation editor mouse/touch, validation, save/discard/deletion, and live setup controls passed.');
} finally { await browser.close(); await server.close(); }
