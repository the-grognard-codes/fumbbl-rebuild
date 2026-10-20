import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { resolveEnvironment, configurationScript } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/catalog-v1.json', import.meta.url), 'utf8'));
const orcCatalog = JSON.parse(await readFile(new URL('../../browser-client/test/fixtures/catalog-orc-v1.json', import.meta.url), 'utf8'));
const accounts = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'];
const teamId = '12345678-1234-1234-1234-123456789abc';

test('signed-in builder saves an owned named team and Play selects it by name', async () => {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://local').pathname;
    if (pathname === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return;
    }
    const file = resolve(root, `.${pathname === '/teambuilder' ? '/teambuilder/index.html' : pathname === '/play' ? '/play/index.html' : pathname}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  const documents = new Map(); const requests = []; const savedCopies = new Map();
  try {
    const pages = [];
    for (let index = 0; index < 2; index++) {
      const page = await (await browser.newContext()).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = body => socket.send(JSON.stringify({ version: 2, ...body }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw); requests.push({ index, type: request.type, operation: request.operation, rosterId: request.rosterId });
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'catalog') send({ ...(request.rosterId === 'orc' ? orcCatalog : catalog), version: 2, requestId: request.requestId });
          if (request.type === 'validateTeam') {
            const valid = ['The Moles', 'The Orcs', 'The Moles Copy'].includes(request.draft.teamName) && request.draft.players.length === 11
              && new Set(request.draft.players.map(player => player.jerseyNumber)).size === 11;
            const skillPoints = request.draft.players.filter(player => player.skillIds.length).length;
            send({ type: 'teamValidation', requestId: request.requestId, catalogVersion: catalog.catalogVersion, ruleset: 'BB2025', draftVersion: 2,
              valid, total: valid ? 550000 : null, budget: catalog.budget, skillPoints,
              messages: valid ? [] : [{ code: 'PLAYER_COUNT', path: 'players', text: 'A draft must contain 11 players.' }] });
          }
          if (request.type === 'savedTeam') {
            const ownedTeams = [...savedCopies.values()].filter(document => document.owner.subject === accounts[index]);
            const owned = ownedTeams.find(document => document.teamId === request.teamId);
            const validation = { valid: true, total: 550000, budget: catalog.budget,
              skillPoints: request.draft?.players.filter(player => player.skillIds.length).length ?? 0, messages: [] };
            if (request.operation === 'create') {
              if (ownedTeams.some(document => document.draft.teamName.toLowerCase() === request.draft.teamName.toLowerCase())) {
                send({ type: 'savedTeam', requestId: request.requestId, code: 'TEAM_NAME_TAKEN', document: null, versionStatus: null, validation: null, teams: [] }); return;
              }
              const document = { formatVersion: 3, teamId: ownedTeams.length ? '23456789-1234-1234-1234-123456789abc' : teamId, documentVersion: 1, ruleset: 'BB2025', catalogVersion: catalog.catalogVersion,
                owner: { namespace: 'account', subject: accounts[index] }, draft: request.draft, validation };
              documents.set(accounts[index], document);
              savedCopies.set(`${accounts[index]}:${document.teamId}`, document);
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document, versionStatus: 'CURRENT', validation, teams: [] });
            } else if (request.operation === 'delete') {
              savedCopies.delete(`${accounts[index]}:${request.teamId}`);
              documents.delete(accounts[index]);
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document: null, versionStatus: null, validation: null, teams: [] });
            } else if (request.operation === 'load' && owned?.teamId === request.teamId) {
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document: owned, versionStatus: 'CURRENT', validation, teams: [] });
            } else {
              const teams = ownedTeams.map(document => ({ teamId: document.teamId, documentVersion: document.documentVersion, catalogVersion: document.catalogVersion,
                teamName: document.draft.teamName, rosterId: document.draft.rosterId, eligibility: 'CURRENT' }));
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document: null, versionStatus: null, validation: null, teams });
            }
          }
        });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/teambuilder`);
      await page.getByRole('button', { name: 'Add Human Lineman' }).waitFor();
    }
    await pages[0].getByLabel('Team name').fill('The Moles');
    for (let count = 0; count < 11; count++) await pages[0].getByRole('button', { name: 'Add Human Lineman' }).click();
    const generatedNames = await pages[0].getByLabel(/^Name for slot/).evaluateAll(inputs => inputs.map(input => input.value));
    assert.equal(new Set(generatedNames).size, 11);
    for (const name of generatedNames) assert.match(name, /^[A-Z][a-z]{1,11}$/);
    await pages[0].getByLabel('Name for slot 1', { exact: true }).fill('Coach Choice');
    await pages[0].getByText('Players 11/16', { exact: true }).waitFor();
    await pages[0].getByRole('button', { name: 'Show Team Details' }).click();
    for (const width of [1920, 1223]) {
      await pages[0].setViewportSize({ width, height: 1080 });
      assert.ok(await pages[0].locator('.team-details').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Human details fit at ${width}`);
      await pages[0].locator('.team-details').screenshot({ path: fileURLToPath(new URL(`../../.tools/builder-human-details-${width}.png`, import.meta.url)) });
    }
    assert.equal(await pages[0].getByText('Roster values are estimates until server validation.').count(), 0);
    const skillChoices = await pages[0].getByLabel('Skill for slot 1', { exact: true }).locator('option').allTextContents();
    for (const skill of ['Guard (Elite)', 'Wrestle', 'Sidestep', 'Sure Feet', 'Mighty Blow (Elite)'])
      assert.ok(skillChoices.includes(skill), skill);
    await pages[0].getByLabel('Skill for slot 1', { exact: true }).selectOption('wrestle');
    await pages[0].getByRole('button', { name: 'Validate Roster' }).click();
    await pages[0].getByText(/Valid draft/).waitFor();
    await pages[0].getByRole('button', { name: 'Save team' }).click();
    await pages[0].getByText(/Saved team The Moles/).waitFor();
    assert.deepEqual(documents.get(accounts[0]).draft.players[0].skillIds, ['wrestle']);
    assert.equal(documents.get(accounts[0]).draft.players[0].playerName, 'Coach Choice');
    assert.doesNotMatch(await pages[0].locator('.saved-teams-panel').innerText(), /version \d/);
    assert.match(await pages[0].locator('.saved-teams-panel').innerText(), /The Moles\s*· Human/);
    assert.equal(await pages[1].getByText('No saved teams yet.').count(), 1);
    await pages[0].goto(`http://127.0.0.1:${server.address().port}/play`);
    await pages[0].getByLabel('Saved team').waitFor();
    await pages[0].getByRole('option', { name: /The Moles/ }).waitFor({ state: 'attached' });
    assert.match(await pages[0].getByLabel('Saved team').innerText(), /The Moles · Human/);
    assert.doesNotMatch(await pages[0].getByLabel('Saved team').innerText(), /version \d/);
    assert.equal(await pages[0].getByRole('button', { name: 'Create game' }).isDisabled(), false);
    assert.equal(documents.has(accounts[1]), false);
    assert.ok(requests.some(entry => entry.index === 0 && entry.type === 'savedTeam' && entry.operation === 'create'));
    await pages[0].goto(`http://127.0.0.1:${server.address().port}/teambuilder`);
    await pages[0].getByRole('button', { name: 'Load' }).click();
    const original = structuredClone(savedCopies.get(`${accounts[0]}:${teamId}`));
    await pages[0].getByRole('button', { name: 'Save as new', exact: true }).click();
    await pages[0].getByLabel('Team name').fill('The Moles');
    await pages[0].getByRole('button', { name: 'Validate Roster' }).click();
    await pages[0].getByText(/Valid draft/).waitFor();
    await pages[0].getByRole('button', { name: 'Save new team', exact: true }).click();
    await pages[0].getByRole('alert').filter({ hasText: 'You already have a team with that name' }).waitFor();
    await pages[0].getByLabel('Team name').fill('The Moles Copy');
    await pages[0].getByLabel('Name for slot 1', { exact: true }).fill('New Captain');
    assert.equal(await pages[0].getByRole('button', { name: 'Save new team', exact: true }).isDisabled(), true);
    await pages[0].getByRole('button', { name: 'Validate Roster' }).click();
    await pages[0].getByText(/Valid draft/).waitFor();
    await pages[0].getByRole('button', { name: 'Save new team', exact: true }).click();
    await pages[0].getByText('Saved team The Moles Copy', { exact: true }).waitFor();
    assert.deepEqual(savedCopies.get(`${accounts[0]}:${teamId}`), original);
    assert.equal(documents.get(accounts[0]).draft.players[0].playerName, 'New Captain');
    await pages[0].locator('.saved-teams-panel').getByText('The Moles Copy', { exact: true }).waitFor();
    assert.equal(await pages[0].locator('.saved-teams-panel li').count(), 2);
    pages[0].once('dialog', dialog => dialog.accept());
    await pages[0].getByRole('button', { name: 'Delete team' }).click();
    await pages[0].locator('.saved-teams-panel').getByText('The Moles Copy', { exact: true }).waitFor({ state: 'hidden' });
    await pages[0].locator('.saved-teams-panel li').filter({ has: pages[0].getByText('The Moles', { exact: true }) }).getByRole('button', { name: 'Load' }).click();
    await pages[0].getByRole('button', { name: 'Delete team' }).waitFor();
    pages[0].once('dialog', dialog => dialog.accept());
    await pages[0].getByRole('button', { name: 'Delete team' }).click();
    await pages[0].getByText('No saved teams yet.').waitFor();
    assert.equal(documents.has(accounts[0]), false);
    assert.ok(requests.some(entry => entry.index === 0 && entry.type === 'savedTeam' && entry.operation === 'delete'));
    await pages[0].getByRole('button', { name: 'New team' }).click();
    await pages[0].getByLabel('Team', { exact: true }).selectOption('orc');
    await pages[0].getByRole('button', { name: 'Add Orc Lineman' }).waitFor();
    await pages[0].getByRole('button', { name: 'Show Team Details' }).click();
    for (const width of [1920, 1223]) {
      await pages[0].setViewportSize({ width, height: 1080 });
      assert.ok(await pages[0].locator('.team-details').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Orc details fit at ${width}`);
      await pages[0].locator('.team-details').screenshot({ path: fileURLToPath(new URL(`../../.tools/builder-orc-details-${width}.png`, import.meta.url)) });
    }
    assert.ok(requests.some(entry => entry.index === 0 && entry.type === 'catalog' && entry.rosterId === 'orc'));
    assert.match(await pages[0].locator('.recruitment img.sprite').first().getAttribute('src'), /assets\/game\/teams\/orc\//);
    await pages[0].getByLabel('Team name').fill('The Orcs');
    for (let count = 0; count < 11; count++) await pages[0].getByRole('button', { name: 'Add Orc Lineman' }).click();
    await pages[0].getByRole('button', { name: 'Validate Roster' }).click();
    await pages[0].getByText(/Valid draft/).waitFor();
    await pages[0].getByRole('button', { name: 'Save team' }).click();
    await pages[0].getByText(/Saved team The Orcs/).waitFor();
    await pages[0].locator('.saved-teams-panel').getByText(/The Orcs · Orc/).waitFor();
    assert.equal(documents.get(accounts[0]).draft.rosterId, 'orc');
    await pages[0].goto(`http://127.0.0.1:${server.address().port}/teambuilder`);
    await pages[0].getByRole('button', { name: 'Load' }).click();
    await pages[0].getByRole('button', { name: 'Add Orc Lineman' }).waitFor();
    assert.equal(await pages[0].getByLabel('Team', { exact: true }).inputValue(), 'orc');
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
