import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { configurationScript, resolveEnvironment } from '../../deployment/firebase/scripts/environment.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
test('shared account disclosure tracks authentication, signs out, dismisses and fits narrow screens', { timeout: 45000 }, async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return;
    }
    const pagePath = extname(path) ? path : `${path === '/' ? '' : path}/index.html`;
    const file = resolve(root, `.${pagePath}`);
    if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
  try {
    const page = await browser.newPage({ viewport: { width: 1224, height: 800 } });
    page.setDefaultTimeout(5000);
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', route => route.fulfill({ contentType: 'text/javascript', body:
      'export function initializeApp(config){window.__initializations=(window.__initializations||0)+1;return {config};}' }));
    await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      const callbacks=new Set();let user=null;const auth={};
      window.__setAccount=next=>{user=next;callbacks.forEach(callback=>callback(user));};
      export function getAuth(){return auth;}
      export function onAuthStateChanged(auth,callback){callbacks.add(callback);queueMicrotask(()=>callback(user));return()=>callbacks.delete(callback);}
      export async function signOut(){if(window.__rejectSignOut)throw Error('fixture');window.__setAccount(null);}
      export class GoogleAuthProvider{} export function connectAuthEmulator(){}
      export async function signInWithPopup(){} export async function sendSignInLinkToEmail(){}
      export function isSignInWithEmailLink(){return false;} export async function signInWithEmailLink(){}
    ` }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const menu = page.locator('.account-menu');
    const summary = page.getByLabel('My account', { exact: true });
    await summary.waitFor();
    await page.waitForFunction(() => typeof window.__setAccount === 'function');
    await summary.press('Enter');
    await menu.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await menu.getByRole('link').count(), 1, 'placeholders are buttons, never fake navigation links');
    for (const name of ['Account Settings', 'My games', 'My teams', 'Match history', 'Preferences'])
      assert.equal(await menu.getByRole('button', { name, exact: true }).isEnabled(), false);
    await menu.getByRole('link', { name: 'Sign in', exact: true }).press('Escape');
    assert.equal(await menu.getAttribute('open'), null);
    assert.equal(await summary.evaluate(element => element === document.activeElement), true);
    await summary.click(); await page.getByRole('heading', { level: 1 }).click();
    assert.equal(await menu.getAttribute('open'), null);
    await page.evaluate(() => window.__setAccount({ email: 'coach@example.test' }));
    await menu.getByText('coach@example.test', { exact: true }).waitFor();
    assert.equal(await summary.evaluate(element => document.getElementById(element.getAttribute('aria-describedby')).textContent), 'coach@example.test', 'the focusable account control announces its current identity');
    await summary.click();
    await menu.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    assert.equal(await menu.getByRole('link', { name: 'Sign in', exact: true }).isVisible(), false);
    assert.equal(await page.evaluate(async () => { const { authentication } = await import('/assets/auth-client.js'); return authentication() === authentication() && window.__initializations === 1; }), true);
    if (process.env.ACCOUNT_MENU_SCREENSHOT_DIR) {
      await mkdir(process.env.ACCOUNT_MENU_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.ACCOUNT_MENU_SCREENSHOT_DIR, 'account-desktop.png') });
    }
    await page.evaluate(() => { window.__rejectSignOut = true; });
    await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
    await menu.getByText('Could not sign out. Please try again.').waitFor();
    assert.equal(await menu.getByRole('button', { name: 'Sign out', exact: true }).isEnabled(), true);
    await page.evaluate(() => { window.__rejectSignOut = false; });
    await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
    await menu.getByText('Sign in', { exact: true }).first().waitFor();
    assert.equal(await menu.getAttribute('open'), null);
    await page.setViewportSize({ width: 360, height: 800 });
    await summary.click();
    const bounds = await page.locator('.account-options').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 360, 'the open disclosure fits a narrow viewport');
    if (process.env.ACCOUNT_MENU_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.ACCOUNT_MENU_SCREENSHOT_DIR, 'account-mobile.png') });
    for (const route of ['/updates', '/privacy', '/support', '/login', '/login/complete']) {
      await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
      await page.getByLabel('My account', { exact: true }).waitFor();
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
