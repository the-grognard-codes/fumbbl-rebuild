import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/catalog-v1.json', import.meta.url), 'utf8'));
const orcCatalog = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/catalog-orc-v1.json', import.meta.url), 'utf8'));
const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const teamId = '12345678-1234-1234-1234-123456789abc';
const evidenceDirectory = fileURLToPath(new URL('../../test-output/team-builder-workbench/', import.meta.url));

function savedDraft() {
  return { draftVersion: 2, ruleset: 'BB2025', catalogVersion: catalog.catalogVersion, rosterId: 'human', presetId: catalog.presetId,
    teamName: 'Saved Human', captainId: null, colors: { version: 1, primary: 'navy', secondary: 'ivory' },
    players: Array.from({ length: 11 }, (_, index) => ({ id: `player-${index + 1}`, slot: index + 1,
      jerseyNumber: index + 1, playerName: `Saved Player ${index + 1}`, positionId: 'lineman', skillIds: [] })),
    resources: { rerolls: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: 0, dedicatedFans: 0 } };
}

async function builderFixture(t, pageOptions = {}) {
  await mkdir(evidenceDirectory, { recursive: true });
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    if (pathname === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return;
    }
    const file = resolve(root, `.${pathname === '/teambuilder' ? '/teambuilder/index.html' : pathname}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser, page;
  t.after(async () => {
    try {
      if (page && !page.isClosed() && (t.name.startsWith('workbench preserves') || t.name.startsWith('eleven and sixteen'))) await page.screenshot({ path: resolve(evidenceDirectory, `${t.name.startsWith('workbench preserves') ? 'behavior' : 'geometry'}-final.png`) });
    } finally { await browser?.close(); await new Promise(done => server.close(done)); }
  });
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...pageOptions });
  const state = { requests: [], messages: null, holdValidation: false, pendingValidation: null, versionStatus: 'CURRENT',
    document: { formatVersion: 4, teamId, documentVersion: 1, ruleset: 'BB2025', catalogVersion: catalog.catalogVersion,
      owner: { namespace: 'account', subject: account }, draft: savedDraft(),
      validation: { valid: true, total: 550000, budget: catalog.budget, skillPoints: 0, messages: [] } } };
  await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture'}));return()=>{};}" }));
  await page.routeWebSocket('**/browser/v2', socket => {
    const send = body => socket.send(JSON.stringify({ version: 2, ...body }));
    state.disconnect = () => socket.close({ code: 1001, reason: 'Validation transport interrupted by fixture' });
    state.send = send;
    socket.onMessage(raw => {
      const request = JSON.parse(raw); state.requests.push(request);
      if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: account });
      if (request.type === 'catalog') {
        const complete = () => send({ ...(request.rosterId === 'orc' ? orcCatalog : catalog), version: 2, requestId: request.requestId });
        if (request.rosterId && state.holdCatalogRoster === request.rosterId) { state.pendingCatalog = complete; state.catalogHeld?.(); }
        else complete();
      }
      if (request.type === 'validateTeam') {
        const draft = request.draft;
        const messages = state.messages ?? (draft.teamName && draft.players.length >= 11 && draft.players.length <= 16
          ? [] : [{ code: 'PLAYER_COUNT', path: 'players', text: 'Recruit at least eleven players.' }]);
        const response = { type: 'teamValidation', requestId: request.requestId, catalogVersion: catalog.catalogVersion,
          ruleset: 'BB2025', draftVersion: 2, valid: !messages.length, total: messages.length ? null : 550000,
          budget: catalog.budget, skillPoints: draft.players.filter(player => player.skillIds.length).length, messages };
        const complete = () => send(response);
        if (state.holdValidation) {
          state.pendingValidation = complete;
          state.sendHeldValidationOnCurrentSocket = () => state.send(response);
          state.validationHeld?.();
        } else complete();
      }
      if (request.type === 'savedTeam') {
        const validation = { valid: true, total: 550000, budget: catalog.budget, skillPoints: 0, messages: [] };
        if (request.operation === 'update' || request.operation === 'create') {
          state.document = { ...state.document, draft: structuredClone(request.draft), documentVersion: state.document.documentVersion + 1 };
        }
        const document = ['load', 'update', 'create'].includes(request.operation) ? structuredClone(state.document) : null;
        const response = { type: 'savedTeam', requestId: request.requestId, code: 'OK', document,
          versionStatus: document ? state.versionStatus : null, validation: document ? validation : null,
          teams: request.operation === 'list' ? [{ teamId, documentVersion: state.document.documentVersion,
            catalogVersion: catalog.catalogVersion, teamName: state.document.draft.teamName, rosterId: state.document.draft.rosterId, eligibility: state.versionStatus }] : [] };
        if (request.operation === 'load' && state.holdLoad) { state.pendingLoad = () => send(response); state.loadHeld?.(); }
        else send(response);
      }
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/teambuilder`);
  await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).waitFor();
  if (t.name.startsWith('eleven and sixteen')) await captureOpening(page, 'empty-human');
  return { page, state };
}

async function captureOpening(page, label) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(evidenceDirectory, `${label}-top-${width}x${height}.png`) });
    await page.screenshot({ path: resolve(evidenceDirectory, `${label}-full-${width}x${height}.png`), fullPage: true });
  }
}

async function openDisclosure(page, selector) {
  const details = page.locator(selector);
  if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
}

async function assertFocused(page, id) {
  await page.waitForFunction(expected => document.activeElement?.id === expected, id);
}

for (const hasTouch of [false, true]) {
  test(`formation squares and circular markers fit the hosted workbench with ${hasTouch ? 'touch' : 'mouse'} input`, { timeout: 30000 }, async t => {
    const { page } = await builderFixture(t, { hasTouch });
    await openDisclosure(page, '.saved-teams-panel');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByLabel('Name for slot 11', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Manage formations', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 720], [1280, 480]]) {
      await page.setViewportSize({ width, height });
      for (const name of ['5-4-2 Offense', '7-2-2 Offense', 'Chevron Defense', 'Anchor Defense']) {
        await dialog.getByRole('button', { name: new RegExp(`^${name}`) }).click();
        const geometry = await dialog.evaluate(element => {
          const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
          return {
            squares: [...element.querySelectorAll('[data-formation-cell], .formation-opponent span')].map(rect),
            markers: [...element.querySelectorAll('.formation-grid .formation-chit')].map(node => {
              const range = document.createRange(); range.selectNodeContents(node);
              return { marker: rect(node), cell: rect(node.parentElement), number: rect(range) };
            }),
            overflow: element.scrollWidth > element.clientWidth + 1
          };
        });
        assert.equal(geometry.squares.length, 225);
        assert.equal(geometry.markers.length, 11);
        const distorted = geometry.squares.find(box => Math.abs(box.width - box.height) > 1);
        assert.equal(distorted, undefined, `${name} squares must have equal sides at ${width}px: ${JSON.stringify(distorted)}`);
        for (const { marker, cell, number } of geometry.markers) {
          assert.ok(Math.abs(marker.width - marker.height) <= 1, `Marker must stay circular at ${width}px`);
          assert.ok(marker.x >= cell.x && marker.y >= cell.y && marker.x + marker.width <= cell.x + cell.width + 1
            && marker.y + marker.height <= cell.y + cell.height + 1, `Marker must fit inside its square at ${width}px: ${JSON.stringify({ marker, cell })}`);
          assert.ok(number.x >= marker.x && number.x + number.width <= marker.x + marker.width + 1,
            `Jersey number must fit inside its marker at ${width}px: ${JSON.stringify({ number, marker })}`);
        }
        assert.equal(geometry.overflow, false, `Formation dialog must fit at ${width}px`);
      }
      await dialog.locator('.formation-pitch').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(evidenceDirectory, `formation-${hasTouch ? 'touch' : 'mouse'}-${width}x${height}.png`) });
    }
    await dialog.locator('.formation-grid .occupied').first().click();
    await dialog.getByRole('button', { name: 'Reserves', exact: true }).click();
    const reserve = await dialog.locator('.formation-reserves .formation-chit').boundingBox();
    assert.ok(Math.abs(reserve.width - reserve.height) <= 1, 'Reserve markers must also stay circular');
  });
}

test('validation can retry after transport loss without editing the draft or trusting the abandoned response', { timeout: 30000 }, async t => {
  const { page, state } = await builderFixture(t);
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByLabel('Name for slot 11', { exact: true }).waitFor();
  const validate = page.getByRole('button', { name: 'Validate Roster', exact: true });
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  state.holdValidation = true;
  const held = new Promise(resolve => { state.validationHeld = resolve; });
  await validate.click();
  await held;
  const originalRequest = state.requests.find(request => request.type === 'validateTeam');
  assert.equal(await page.getByRole('button', { name: 'Validating roster…', exact: true }).isDisabled(), true, 'The original request is genuinely in flight');

  await state.disconnect();
  await page.getByText('Disconnected', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByText('Connected', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Validate Roster"]')?.disabled === false);
  assert.equal(state.requests.filter(request => request.type === 'authenticate').length, 2, 'The retry uses a newly authenticated transport');
  assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), originalRequest.draft.teamName);
  assert.equal(await page.getByLabel('Name for slot 1', { exact: true }).inputValue(), originalRequest.draft.players[0].playerName);
  assert.equal(await page.getByLabel(/^Name for slot/).count(), 11);
  assert.equal(await save.isDisabled(), true);

  state.sendHeldValidationOnCurrentSocket();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await save.isDisabled(), true, 'The abandoned request ID cannot validate the unchanged draft on the new transport');
  assert.equal(await validate.isDisabled(), false);

  state.holdValidation = false;
  await validate.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Save changes"]')?.disabled === false);
  const retries = state.requests.filter(request => request.type === 'validateTeam');
  assert.equal(retries.length, 2);
  assert.notEqual(retries[1].requestId, originalRequest.requestId);
  assert.deepEqual(retries[1].draft, originalRequest.draft, 'Reconnect recovery needs no incidental edit');
  assert.equal(state.requests.filter(request => request.type === 'savedTeam' && ['create', 'update'].includes(request.operation)).length, 0);
});

test('late team loads and dependent catalogs cannot overwrite newer edits or a new draft', { timeout: 30000 }, async t => {
  const { page, state } = await builderFixture(t);
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByLabel('Name for slot 11', { exact: true }).waitFor();

  state.holdLoad = true;
  let held = new Promise(resolve => { state.loadHeld = resolve; });
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await held;
  await page.getByLabel('Team name', { exact: true }).fill('Keep my later edit');
  state.pendingLoad();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), 'Keep my later edit');
  assert.equal(await page.getByLabel(/^Name for slot/).count(), 11);
  assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);

  held = new Promise(resolve => { state.loadHeld = resolve; });
  await openDisclosure(page, '.saved-teams-panel');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await held;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'New team', exact: true }).click();
  await page.getByText('No players recruited yet.', { exact: true }).waitFor();
  state.pendingLoad();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel(/^Name for slot/).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save team', exact: true }).isDisabled(), true);

  state.holdLoad = false;
  state.document = { ...state.document, draft: { ...savedDraft(), teamName: 'Saved Orc', rosterId: 'orc',
    colors: { version: 1, primary: 'black', secondary: 'ivory' },
    players: savedDraft().players.map(player => ({ ...player, positionId: 'orc-lineman' })) } };
  state.holdCatalogRoster = 'orc';
  const catalogHeld = new Promise(resolve => { state.catalogHeld = resolve; });
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await catalogHeld;
  await page.getByRole('button', { name: 'New team', exact: true }).click();
  await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).waitFor();
  state.pendingCatalog();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.getByLabel('Team', { exact: true }).inputValue(), 'human');
  assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel(/^Name for slot/).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: 'Save team', exact: true }).isDisabled(), true);
});

test('a newer Load keeps precedence over an older pending cross-roster catalog', { timeout: 30000 }, async t => {
  const { page, state } = await builderFixture(t);
  state.document = { ...state.document, draft: { ...savedDraft(), teamName: 'Older Orc', rosterId: 'orc',
    colors: { version: 1, primary: 'black', secondary: 'ivory' },
    players: savedDraft().players.map(player => ({ ...player, positionId: 'orc-lineman' })) } };
  state.holdCatalogRoster = 'orc';
  const catalogHeld = new Promise(resolve => { state.catalogHeld = resolve; });
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await catalogHeld;

  state.document = { ...state.document, draft: { ...savedDraft(), teamName: 'Newest Human' } };
  state.holdLoad = true;
  const loadHeld = new Promise(resolve => { state.loadHeld = resolve; });
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await loadHeld;
  state.pendingCatalog();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.getByRole('button', { name: 'Add Orc Lineman', exact: true }).count(), 0,
    'An older catalog must not adopt its Orc draft while the newer Load is pending');

  state.pendingLoad();
  await page.waitForFunction(() => document.getElementById('builder-team-name')?.value === 'Newest Human');
  assert.equal(await page.getByLabel('Team', { exact: true }).inputValue(), 'human');
  assert.equal(await page.getByLabel(/^Name for slot/).count(), 11);
  assert.equal(await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).isDisabled(), false);
  assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
});

test('workbench preserves draft state, focuses validation errors, and gates saving to the exact validated draft', async t => {
  const { page, state } = await builderFixture(t);
  const save = page.getByRole('button', { name: 'Save team', exact: true });
  assert.equal(await page.getByRole('radiogroup', { name: 'Primary color', exact: true }).isVisible(), false, 'Kit choices start out of the recruitment workflow');
  assert.equal(await page.getByRole('button', { name: 'Load', exact: true }).isVisible(), false);
  const entryOrder = await page.evaluate(() => document.querySelector('.saved-teams-panel').compareDocumentPosition(document.querySelector('.builder-workbench')));
  assert.ok(entryOrder & 4, 'Saved-team entry precedes the editor');
  await openDisclosure(page, '.saved-teams-panel');

  let dialogs = 0;
  const rejectUnexpectedDialog = dialog => { dialogs++; return dialog.dismiss(); };
  page.on('dialog', rejectUnexpectedDialog);
  await page.getByRole('button', { name: 'New team', exact: true }).click();
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByLabel('Name for slot 11', { exact: true }).waitFor();
  assert.equal(dialogs, 0, 'Pristine draft navigation does not interrupt the coach');
  page.off('dialog', rejectUnexpectedDialog);

  const playerName = page.getByLabel('Name for slot 1', { exact: true });
  await playerName.fill('Unsaved Coach Choice');
  for (const action of ['New team', 'Load']) {
    if (action === 'Load') await openDisclosure(page, '.saved-teams-panel');
    const before = state.requests.length;
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: action, exact: true }).click();
    assert.equal(await playerName.inputValue(), 'Unsaved Coach Choice', `${action} cancellation retains edits`);
    assert.equal(state.requests.slice(before).filter(request => request.type === 'savedTeam' && request.operation === 'load').length, 0);
  }
  await openDisclosure(page, '.saved-teams-panel');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('builder-player-1-name')?.value === 'Saved Player 1');
  await playerName.fill('Second unsaved choice');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'New team', exact: true }).click();
  await page.getByText('No players recruited yet.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Team name', { exact: true }).inputValue(), '');

  await page.getByLabel('Team name', { exact: true }).fill('Workbench team');
  for (let index = 0; index < 11; index++) await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).click();
  const status = page.locator('.workbench-status');
  assert.match(await status.innerText(), /11\s*\/\s*16/);
  const beforeResources = await status.innerText();
  await page.getByRole('button', { name: 'Add Team re-rolls', exact: true }).click();
  assert.notEqual(await status.innerText(), beforeResources, 'Resource spending updates the completion totals before validation');
  assert.match(await status.innerText(), /550,000/);
  await page.getByRole('button', { name: 'Subtract Team re-rolls', exact: true }).click();

  assert.equal(await page.getByLabel('Skill for slot 1', { exact: true }).isVisible(), false);
  state.messages = [
    { code: 'TEAM_NAME', path: 'teamName', text: 'Choose another team name.' },
    { code: 'JERSEY', path: 'players[0].jerseyNumber', text: 'Give this player a unique number.' },
    { code: 'CAPTAIN', path: 'players[0].captainId', text: 'Review this captain choice.' },
    { code: 'SKILL', path: 'players[0].skillIds', text: 'Review this player skill.' },
    { code: 'SKILL_INELIGIBLE', path: 'players[0]', text: 'This player cannot purchase that skill.' },
    { code: 'RESOURCE', path: 'resources.rerolls', text: 'Review your re-roll purchase.' },
    { code: 'RESOURCE', path: 'resources', text: 'Review all sideline resources.' },
    { code: 'FUTURE', path: 'future.server.constraint', text: 'Review the roster for this server rule.' }
  ];
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).click();
  const errors = page.locator('#builder-validation');
  for (const [message, id] of [
    ['Choose another team name.', 'builder-team-name'],
    ['Give this player a unique number.', 'builder-player-1-jersey'],
    ['Review this captain choice.', 'builder-player-1-captain'],
    ['Review this player skill.', 'builder-player-1-skill'],
    ['This player cannot purchase that skill.', 'builder-player-1-skill'],
    ['Review your re-roll purchase.', 'builder-resource-rerolls'],
    ['Review all sideline resources.', 'builder-resources']
  ]) {
    await errors.getByText(message, { exact: true }).click();
    await assertFocused(page, id);
  }
  assert.equal(await page.getByLabel('Skill for slot 1', { exact: true }).isVisible(), true, 'Error navigation opens the containing player options');
  await errors.getByText('Review the roster for this server rule.', { exact: true }).click();
  await assertFocused(page, 'builder-roster');
  assert.equal(await save.isDisabled(), true);

  state.messages = null;
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Save team"]')?.disabled === false);
  await page.getByLabel('Skill for slot 1', { exact: true }).selectOption('wrestle');
  assert.equal(await save.isDisabled(), true, 'Player options invalidate the previous validation');
  assert.match(await status.innerText(), /1\s*\/\s*8/);
  state.holdValidation = true;
  const validationHeld = new Promise(resolve => { state.validationHeld = resolve; });
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).click();
  await validationHeld;
  assert.ok(state.pendingValidation, 'The fixture retained the in-flight validation response');
  await page.getByLabel('Name for slot 1', { exact: true }).fill('Edited during validation');
  state.pendingValidation();
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).waitFor();
  assert.equal(await save.isDisabled(), true, 'A successful stale response cannot enable saving a newer draft');
  state.holdValidation = false;
  await page.getByRole('button', { name: 'Validate Roster', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Save team"]')?.disabled === false);
  await save.click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  assert.equal(state.document.draft.players[0].playerName, 'Edited during validation');
  assert.deepEqual(state.document.draft.players[0].skillIds, ['wrestle']);

  state.versionStatus = 'MIGRATION_REQUIRED';
  await openDisclosure(page, '.saved-teams-panel');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'cannot enter a new match' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add Human Lineman', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Name for slot 1', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Validate Roster', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
});

test('eleven and sixteen player Human and Orc workbenches fit narrow, desktop, and short viewports', async t => {
  const { page } = await builderFixture(t);
  for (const roster of ['human', 'orc']) {
    if (roster === 'orc') {
      await openDisclosure(page, '.saved-teams-panel');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'New team', exact: true }).click();
      await page.getByLabel('Team', { exact: true }).selectOption(roster);
    }
    const add = page.getByRole('button', { name: roster === 'human' ? 'Add Human Lineman' : 'Add Orc Lineman', exact: true });
    await add.waitFor();
    await page.getByLabel('Team name', { exact: true }).fill('The Extraordinarily Persistent Coaching Association');
    for (let index = 0; index < 11; index++) await add.click();
    for (const count of [11, 16]) {
      if (count === 16) for (let index = 11; index < 16; index++) await add.click();
      await page.getByLabel('Name for slot 1', { exact: true }).fill('A'.repeat(30));
      if (count === 11) await captureOpening(page, `${roster}-11`);
      for (const [width, height] of [[320, 720], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1280, 480]]) {
        await page.setViewportSize({ width, height });
        await openDisclosure(page, '.saved-teams-panel');
        await page.locator('.roster-row').nth(Math.floor(count / 2)).scrollIntoViewIfNeeded();
        const geometry = await page.evaluate(() => {
          const box = selector => {
            const { left, right, top, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
            return { left, right, top, bottom, width, height };
          };
          const status = box('.workbench-status');
          const rows = [...document.querySelectorAll('.roster-row')].map(row => {
            const rect = row.getBoundingClientRect();
            return { top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) };
          });
          const visibleRow = rows.some(row => row.bottom - row.top >= 40 &&
            Math.max(0, Math.min(row.bottom, status.top) - row.top) + Math.max(0, row.bottom - Math.max(row.top, status.bottom)) >= 40);
          return { viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
            status, visibleRow, recruitment: box('.recruitment'), roster: box('.roster-panel'),
            overflow: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 10).map(element => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 60), right: element.getBoundingClientRect().right })) };
        });
        await page.screenshot({ path: resolve(evidenceDirectory, `${roster}-${count}-${width}x${height}.png`), fullPage: geometry.scrollWidth > width + 1 });
        const context = `${roster} ${count} players ${width}×${height}: ${JSON.stringify(geometry)}`;
        assert.ok(geometry.scrollWidth <= width + 1, context);
        assert.ok(geometry.status.left >= -1 && geometry.status.right <= width + 1, context);
        assert.ok(geometry.status.top >= -1 && geometry.status.bottom <= height + 1, `Completion stays visible: ${context}`);
        assert.ok(geometry.visibleRow, `Completion leaves a usable player row visible: ${context}`);
        if (width >= 1280) {
          assert.ok(geometry.recruitment.right <= geometry.roster.left + 2, `Recruitment sits beside the roster: ${context}`);
        }
      }
    }
    await openDisclosure(page, '.builder-kit-options');
    await openDisclosure(page, '.roster-row:first-child .roster-player-options');
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const expandedWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(expandedWidth <= width + 1, `${roster} expanded kit and player options fit at ${width}: ${expandedWidth}`);
    }
    await page.locator('.builder-kit-options > summary').click();
    assert.equal(await add.isDisabled(), true, 'The sixteen-player limit remains enforced');
  }
});
