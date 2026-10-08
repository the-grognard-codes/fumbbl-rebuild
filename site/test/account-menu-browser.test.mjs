import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { configurationScript, resolveEnvironment } from '../../deployment/firebase/scripts/environment.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
test('shared navigation and account disclosure stay consistent on site pages, with game displays excluded', { timeout: 90000 }, async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    if (path === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(resolveEnvironment(['--environment', 'local-dev']))); return;
    }
    const pagePath = ['/play/match', '/play/result'].includes(path) ? '/play/index.html'
      : extname(path) ? path : `${path === '/' ? '' : path}/index.html`;
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
      const callbacks=new Set();let user=window.__initialAccount??null;const auth={};
      window.__setAccount=next=>{user=next;callbacks.forEach(callback=>callback(user));};
      export function getAuth(){return auth;}
      export function onAuthStateChanged(auth,callback){callbacks.add(callback);queueMicrotask(()=>callback(user));return()=>callbacks.delete(callback);}
      export async function signOut(){if(window.__rejectSignOut)throw Error('fixture');window.__setAccount(null);}
      export class GoogleAuthProvider{} export function connectAuthEmulator(){}
      export async function signInWithPopup(){} export async function sendSignInLinkToEmail(){}
      export function isSignInWithEmailLink(){return false;} export async function signInWithEmailLink(){}
    ` }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => document.fonts.ready);
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
    const highlight = locator => locator.evaluate(element => {
      const style = getComputedStyle(element); return { color: style.color, background: style.backgroundColor };
    });
    const signOut = menu.getByRole('button', { name: 'Sign out', exact: true });
    await signOut.hover();
    const expectedHighlight = await highlight(signOut);
    assert.deepEqual(expectedHighlight, { color: 'rgb(255, 225, 123)', background: 'rgb(36, 57, 78)' });
    await summary.hover();
    assert.deepEqual(await highlight(summary), expectedHighlight);
    for (const name of ['Account Settings', 'My games', 'My teams', 'Match history', 'Preferences']) {
      const row = menu.getByRole('button', { name, exact: true });
      await row.hover();
      assert.deepEqual(await highlight(row), expectedHighlight, `${name} highlights like Sign out`);
      assert.equal(await row.isEnabled(), false, 'highlighting does not activate placeholders');
    }
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
    await page.addInitScript(() => { window.__initialAccount = { email: 'coach@example.test', getIdToken: async () => 'fixture' }; });
    await page.routeWebSocket('**/browser/v2', socket => socket.close({ code: 1000, reason: 'Header-only fixture' }));
    const gameDisplays = ['/play/match', '/play/match?watch=1', '/play/result'];
    const routes = ['/', '/teambuilder', '/play', '/spectate', '/updates', '/privacy', '/support', '/login', '/login/complete', ...gameDisplays];
    for (const width of [1224, 360]) {
      await page.setViewportSize({ width, height: 800 });
      let reference;
      for (const route of routes) {
        await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
        const header = page.locator('.site-header');
        if (gameDisplays.includes(route)) {
          await page.locator('body.game-focused').waitFor();
          assert.equal(await header.isVisible(), false, `${route} hides the site bar for the game display at ${width}px`);
          continue;
        }
        await page.getByLabel('My account', { exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await header.isVisible(), true, `${route} shows the shared bar`);
        const logo = header.getByRole('img', { name: 'Moles Under the Pitch', exact: true });
        await logo.waitFor();
        assert.equal(await logo.getAttribute('src'), '/assets/brand-package-v4/moles-under-the-pitch-logo.svg');
        await page.waitForFunction(() => {
          const image = document.querySelector('.site-header .brand img');
          return image?.complete && image.naturalWidth > 0;
        });
        const logoBounds = await logo.boundingBox();
        assert.ok(logoBounds.width <= 240 && logoBounds.height <= 70, 'The existing logo is scaled down for navigation');
        const navigation = header.getByRole('navigation', { name: 'Primary navigation' });
        assert.deepEqual(await navigation.locator(':scope > a').evaluateAll(links => links.map(link => [link.getAttribute('href'), link.textContent])),
          [['/teambuilder', 'Team Builder'], ['/play', 'Play'], ['/spectate', 'Spectate'], ['/updates', 'Updates']]);
        const active = ['/teambuilder', '/play', '/spectate', '/updates'].find(path => route === path || route.startsWith(path + '/'));
        assert.deepEqual(await navigation.locator('[aria-current="page"]').evaluateAll(links => links.map(link => link.getAttribute('href'))), active ? [active] : []);
        const styles = await header.evaluate(element => {
          const h = getComputedStyle(element), nav = getComputedStyle(element.querySelector('nav')), brand = getComputedStyle(element.querySelector('.brand'));
          const image = getComputedStyle(element.querySelector('.brand img'));
          return [h.width, h.height, h.padding, h.border, h.marginTop, brand.font, image.width, image.height, nav.gap];
        });
        if (!reference) reference = styles;
        assert.deepEqual(styles, reference, `${route} uses the same header layout at ${width}px`);
        const bounds = await header.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        assert.ok(logoBounds.x >= bounds.x && logoBounds.x + logoBounds.width <= bounds.x + bounds.width);
        assert.equal(await header.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'Logo and navigation fit the shared header');
        if (process.env.ACCOUNT_MENU_SCREENSHOT_DIR && ['/', '/play'].includes(route))
          await header.screenshot({ path: resolve(process.env.ACCOUNT_MENU_SCREENSHOT_DIR, `header-${route === '/' ? 'home' : 'play'}-${width}.png`) });
        await page.getByLabel('My account', { exact: true }).click();
        const options = await page.locator('.account-options').boundingBox();
        assert.ok(options.x >= 0 && options.x + options.width <= width, `${route} keeps account options within the screen`);
      }
    }
    for (const width of [1224, 360]) {
      await page.setViewportSize({ width, height: 330 });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.getByLabel('My account', { exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      const options = await page.locator('.account-options').boundingBox();
      assert.ok(options.y >= 0 && options.y + options.height <= 330, `account options fit a short ${width}px viewport: ${JSON.stringify(options)}`);
      const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
      await signOut.scrollIntoViewIfNeeded();
      const action = await signOut.boundingBox();
      assert.ok(action.y >= options.y && action.y + action.height <= options.y + options.height, 'Sign out scrolls into view inside the disclosure');
      assert.equal(await page.evaluate(() => scrollY), 0, 'reaching Sign out leaves the page and top bar in place');
      if (process.env.ACCOUNT_MENU_SCREENSHOT_DIR)
        await page.screenshot({ path: resolve(process.env.ACCOUNT_MENU_SCREENSHOT_DIR, `account-short-${width}.png`) });
      await signOut.click();
      assert.equal(await page.locator('.account-menu').getAttribute('open'), null);
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => scrollTo(0, 64));
    await page.getByLabel('My account', { exact: true }).click();
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const scrolledOptions = await page.locator('.account-options').boundingBox();
    assert.ok(scrolledOptions.y >= 0 && scrolledOptions.y + scrolledOptions.height <= 330,
      `account options still fit after scrolling the open menu: ${JSON.stringify(scrolledOptions)}`);
    for (const width of [400, 1224, 360]) {
      await page.setViewportSize({ width, height: 330 });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const resizedOptions = await page.locator('.account-options').boundingBox();
      assert.ok(resizedOptions.y >= 0 && resizedOptions.y + resizedOptions.height <= 330,
        `account options fit after resizing the open menu to ${width}px: ${JSON.stringify(resizedOptions)}`);
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
