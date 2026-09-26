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
  const documents = new Map(); const requests = [];
  try {
    const pages = [];
    for (let index = 0; index < 2; index++) {
      const page = await (await browser.newContext()).newPage(); pages.push(page);
      await page.route('**/assets/auth-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const authentication=()=>({auth:{},config:window.MOLES_FIREBASE_CONFIG});' }));
      await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({getIdToken:async()=>'fixture-${index}'}));return()=>{};}` }));
      await page.routeWebSocket('**/browser/v2', socket => {
        const send = body => socket.send(JSON.stringify({ version: 2, ...body }));
        socket.onMessage(raw => {
          const request = JSON.parse(raw); requests.push({ index, type: request.type, operation: request.operation });
          if (request.type === 'authenticate') send({ type: 'authentication', requestId: request.requestId, code: 'ACCEPTED', accountId: accounts[index] });
          if (request.type === 'browse') send({ type: 'browse', requestId: request.requestId, code: 'ACCEPTED', matches: [] });
          if (request.type === 'catalog') send({ ...catalog, version: 2, requestId: request.requestId });
          if (request.type === 'validateTeam') {
            const valid = request.draft.teamName === 'The Moles' && request.draft.players.length === 11
              && new Set(request.draft.players.map(player => player.jerseyNumber)).size === 11;
            const skillPoints = request.draft.players.filter(player => player.skillIds.length).length;
            send({ type: 'teamValidation', requestId: request.requestId, catalogVersion: catalog.catalogVersion, ruleset: 'BB2025', draftVersion: 2,
              valid, total: valid ? 550000 : null, budget: catalog.budget, skillPoints,
              messages: valid ? [] : [{ code: 'PLAYER_COUNT', path: 'players', text: 'A draft must contain 11 players.' }] });
          }
          if (request.type === 'savedTeam') {
            const owned = documents.get(accounts[index]);
            const validation = { valid: true, total: 550000, budget: catalog.budget,
              skillPoints: request.draft?.players.filter(player => player.skillIds.length).length ?? 0, messages: [] };
            if (request.operation === 'create') {
              const document = { formatVersion: 3, teamId, documentVersion: 1, ruleset: 'BB2025', catalogVersion: catalog.catalogVersion,
                owner: { namespace: 'account', subject: accounts[index] }, draft: request.draft, validation };
              documents.set(accounts[index], document);
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document, versionStatus: 'CURRENT', validation, teams: [] });
            } else if (request.operation === 'delete') {
              documents.delete(accounts[index]);
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document: null, versionStatus: null, validation: null, teams: [] });
            } else if (request.operation === 'load' && owned?.teamId === request.teamId) {
              send({ type: 'savedTeam', requestId: request.requestId, code: 'OK', document: owned, versionStatus: 'CURRENT', validation, teams: [] });
            } else {
              const teams = owned ? [{ teamId: owned.teamId, documentVersion: owned.documentVersion, catalogVersion: owned.catalogVersion,
                teamName: owned.draft.teamName, rosterId: owned.draft.rosterId, eligibility: 'CURRENT' }] : [];
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
    const skillChoices = await pages[0].getByLabel('Skill for slot 1', { exact: true }).locator('option').allTextContents();
    for (const skill of ['Guard (Elite)', 'Wrestle', 'Sidestep', 'Sure Feet', 'Mighty Blow (Elite)'])
      assert.ok(skillChoices.includes(skill), skill);
    await pages[0].getByLabel('Skill for slot 1', { exact: true }).selectOption('wrestle');
    await pages[0].getByRole('button', { name: 'Validate Roster' }).click();
    await pages[0].getByText(/Valid draft/).waitFor();
    await pages[0].getByRole('button', { name: 'Save team' }).click();
    await pages[0].getByText(/Saved team The Moles/).waitFor();
    assert.deepEqual(documents.get(accounts[0]).draft.players[0].skillIds, ['wrestle']);
    assert.equal(await pages[1].getByText('No saved teams yet.').count(), 1);
    await pages[0].goto(`http://127.0.0.1:${server.address().port}/play`);
    await pages[0].getByLabel('Saved team').waitFor();
    await pages[0].getByRole('option', { name: /The Moles/ }).waitFor({ state: 'attached' });
    assert.match(await pages[0].getByLabel('Saved team').innerText(), /The Moles/);
    assert.equal(await pages[0].getByRole('button', { name: 'Create game' }).isDisabled(), false);
    assert.equal(documents.has(accounts[1]), false);
    assert.ok(requests.some(entry => entry.index === 0 && entry.type === 'savedTeam' && entry.operation === 'create'));
    await pages[0].goto(`http://127.0.0.1:${server.address().port}/teambuilder`);
    await pages[0].getByRole('button', { name: 'Load' }).click();
    await pages[0].getByRole('button', { name: 'Delete team' }).waitFor();
    pages[0].once('dialog', dialog => dialog.accept());
    await pages[0].getByRole('button', { name: 'Delete team' }).click();
    await pages[0].getByText('No saved teams yet.').waitFor();
    assert.equal(documents.has(accounts[0]), false);
    assert.ok(requests.some(entry => entry.index === 0 && entry.type === 'savedTeam' && entry.operation === 'delete'));
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
