import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';
import { configurationScript, resolveEnvironment } from '../../deployment/firebase/scripts/environment.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const output = fileURLToPath(new URL('../../test-output/microsoft-sign-in/', import.meta.url));
const sdk = `
  export function initializeApp(config){return {config};}
  export function getAuth(){return {};}
  export function connectAuthEmulator(){}
  export function onAuthStateChanged(auth, callback){queueMicrotask(()=>callback(null));return()=>{};}
  export async function signOut(){}
  export class GoogleAuthProvider {providerId='google.com';}
  export class OAuthProvider {
    constructor(providerId){this.providerId=providerId;}
    setCustomParameters(parameters){this.parameters=parameters;return this;}
  }
  window.__authCalls=[];
  async function result(){
    if(window.__hold)await new Promise(resolve=>{window.__release=resolve;});
    if(window.__errorCode)throw Object.assign(new Error('fixture-private-message '+(window.__providerError||'')),{code:window.__errorCode,customData:{email:'private@example.test'},credential:{accessToken:'fixture-private-token'}});
  }
  export async function signInWithPopup(auth,provider){
    window.__authCalls.push({type:'popup',provider:provider.providerId,userActivation:navigator.userActivation.isActive});
    sessionStorage.setItem('fixture-provider',provider.providerId);
    sessionStorage.setItem('fixture-provider-tenant',provider.parameters?.tenant||'');
    await result();
  }
  export async function sendSignInLinkToEmail(auth,email,settings){
    window.__authCalls.push({type:'email',email,settings});
    await result();
  }
  export function isSignInWithEmailLink(auth,url){return new URL(url).searchParams.has('oobCode');}
  export async function signInWithEmailLink(auth,email,url){
    window.__authCalls.push({type:'complete',email,url});
    await result();
  }
`;

test('sign-in handles providers, return destinations, pending actions, recovery and accessible layouts', { timeout: 90000 }, async () => {
  const config = resolveEnvironment(['--environment', 'local-dev']);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://local');
    if (url.pathname === '/firebase-web-config.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(configurationScript(config)); return;
    }
    if (['/play', '/teambuilder', '/spectate'].includes(url.pathname)) {
      response.setHeader('Content-Type', 'text/html'); response.end('<h1>Signed-in destination</h1>'); return;
    }
    const path = extname(url.pathname) ? url.pathname : url.pathname.replace(/\/$/, '') + '/index.html';
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    if (!process.env.FFB_VISUAL_FONTS) await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://www.gstatic.com/firebasejs/10.12.0/*.js', route => route.fulfill({ contentType: 'text/javascript', body: sdk }));
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    const authWarnings = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', event => {
      const prefix = '[MUTP auth] ';
      if (event.type() === 'warning' && event.text().startsWith(prefix)) authWarnings.push(JSON.parse(event.text().slice(prefix.length)));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const open = async (query = '') => {
      await page.goto(origin + '/login' + query);
      await page.waitForFunction(() => !document.querySelector('#sign-in-methods').disabled);
    };
    const microsoft = page.getByRole('button', { name: 'Continue with Microsoft', exact: true });
    const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
    const email = page.getByRole('textbox', { name: 'Email address', exact: true });
    const send = page.getByRole('button', { name: 'Email a sign-in link', exact: true });
    const message = page.locator('#auth-message');

    for (const [button, provider, query, destination] of [
      [microsoft, 'microsoft.com', '?returnTo=%2Fteambuilder', '/teambuilder'],
      [google, 'google.com', '?returnTo=%2Fspectate', '/spectate'],
      [microsoft, 'microsoft.com', '?returnTo=https%3A%2F%2Funtrusted.invalid', '/play'],
      [microsoft, 'microsoft.com', '', '/play']
    ]) {
      await open(query);
      await button.click();
      await page.waitForURL(origin + destination);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('fixture-provider')), provider);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('fixture-provider-tenant')),
        provider === 'microsoft.com' ? 'consumers' : '', 'Microsoft personal-account apps must use the consumers authority');
    }
    await page.goto(origin + '/signin?returnTo=%2Fteambuilder&reason=expired');
    assert.equal(new URL(page.url()).pathname, '/signin');
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/teambuilder');
    await page.getByText('Your sign-in expired. Sign in again to continue.', { exact: true }).waitFor();
    await microsoft.click();
    await page.waitForURL(origin + '/teambuilder');

    await open();
    await page.evaluate(() => { window.__hold = true; window.__errorCode = 'auth/popup-blocked'; });
    await microsoft.focus();
    await microsoft.press('Enter');
    await page.waitForFunction(() => typeof window.__release === 'function');
    assert.equal(await google.isDisabled(), true);
    assert.equal(await microsoft.isDisabled(), true);
    assert.equal(await send.isDisabled(), true);
    assert.equal(await page.locator('#sign-in-methods').getAttribute('aria-busy'), 'true');
    await page.locator('#google-sign-in').dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.__authCalls.length), 1, 'A second provider cannot open another popup');
    assert.equal(await page.evaluate(() => window.__authCalls[0].userActivation), true, 'Popup begins during the user gesture');
    await page.evaluate(() => window.__release());
    await page.getByText(/Your browser blocked the Microsoft window/).waitFor();
    assert.deepEqual(authWarnings.at(-1), {
      event: 'sign-in-failed', method: 'microsoft', code: 'auth/popup-blocked', environment: 'local-dev'
    }, 'Failure diagnostics include only safe provider, environment and error-code fields');
    assert.match(await message.textContent(), /Error code: auth\/popup-blocked/);
    assert.equal(await microsoft.isEnabled(), true);
    assert.equal(await microsoft.evaluate(button => document.activeElement === button), true, 'Keyboard focus returns after popup failure');
    assert.equal(await page.locator('#sign-in-methods').getAttribute('aria-busy'), null);

    for (const [code, expected] of [
      ['auth/popup-closed-by-user', /Microsoft sign-in was cancelled/],
      ['auth/account-exists-with-different-credential', /Use the method you chose before/],
      ['auth/network-request-failed', /Check your internet connection/],
      ['auth/too-many-requests', /Wait a few minutes/],
      ['auth/operation-not-allowed', /Try another method or contact support/],
      ['auth/unknown', /Try again or see Help signing in/]
    ]) {
      await page.evaluate(code => { window.__hold = false; window.__errorCode = code; }, code);
      await microsoft.click();
      await message.filter({ hasText: expected }).waitFor();
      assert.equal(await microsoft.isEnabled(), true, 'Provider can be retried after ' + code);
    }
    await page.evaluate(() => { window.__errorCode = 'fixture-private-token'; });
    await microsoft.click();
    await message.filter({ hasText: /Try again or see Help signing in/ }).waitFor();
    assert.equal(authWarnings.at(-1).code, 'unknown', 'Untrusted error-code text is not logged');
    assert.equal(JSON.stringify(authWarnings).includes('fixture-private'), false, 'Raw messages and credentials never enter diagnostics');
    assert.equal(JSON.stringify(authWarnings).includes('private@example.test'), false, 'Email addresses are not logged');
    await page.evaluate(() => { window.__errorCode = 'auth/invalid-credential'; window.__providerError = 'AADSTS7000215: fixture-private-token private@example.test'; });
    await microsoft.click();
    await message.filter({ hasText: /auth\/invalid-credential/ }).waitFor();
    assert.deepEqual(authWarnings.at(-1).providerCodes, ['AADSTS7000215'], 'Detailed provider responses expose only the Microsoft error identifier');
    assert.match(await message.textContent(), /Provider code: AADSTS7000215/);
    assert.equal(JSON.stringify(authWarnings).includes('fixture-private'), false);
    assert.equal(JSON.stringify(authWarnings).includes('private@example.test'), false);

    await open('?returnTo=%2Fteambuilder');
    await email.fill('coach@example.test');
    await page.evaluate(() => { window.__hold = true; });
    await send.click();
    await page.waitForFunction(() => typeof window.__release === 'function');
    assert.equal(await email.isDisabled(), true);
    await page.locator('#email-link-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => window.__authCalls.length), 1, 'Duplicate email submission is ignored');
    assert.deepEqual(await page.evaluate(() => window.__authCalls[0]), {
      type: 'email', email: 'coach@example.test', settings: { url: config.emailLinkUrl, handleCodeInApp: true }
    });
    await page.evaluate(() => window.__release());
    await message.filter({ hasText: /Check your inbox/ }).waitFor();
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('moles-email-link-address'), sessionStorage.getItem('moles-login-return-to')]),
      ['coach@example.test', '/teambuilder']);
    await page.evaluate(() => { window.__hold = false; window.__errorCode = 'auth/network-request-failed'; });
    await send.click();
    await message.filter({ hasText: /Check your internet connection/ }).waitFor();
    assert.equal(await send.isEnabled(), true);

    await open('?returnTo=%2Fteambuilder');
    await email.fill('coach@example.test');
    await page.evaluate(() => {
      sessionStorage.removeItem('moles-login-return-to');
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    await send.click();
    await message.filter({ hasText: /Check your inbox/ }).waitFor();
    assert.equal(await send.isEnabled(), true, 'Successful email is not reported as failed when storage is blocked');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('moles-login-return-to')), '/teambuilder', 'Local storage restrictions do not discard a usable session return path');

    await mkdir(output, { recursive: true });
    await open();
    await page.evaluate(() => document.fonts.ready);
    for (const button of [google, microsoft]) {
      const icon = button.locator('img');
      assert.equal(await icon.getAttribute('alt'), '', 'Decorative provider marks do not repeat the accessible name');
      assert.equal(await icon.evaluate(image => image.complete && image.naturalWidth > 0), true, 'Provider icon loads locally');
    }
    assert.equal(await page.locator('link[rel="icon"]').count(), 3, 'Sign-in includes SVG, PNG and ICO favicon choices');
    const favicons = await page.locator('link[rel="icon"]').evaluateAll(links => Promise.all(links.map(link => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Favicon could not be decoded: ' + link.href));
      image.src = link.href;
    }))));
    assert.ok(favicons.every(icon => icon.width > 0 && icon.height > 0), 'Browser decodes every SVG, PNG and ICO favicon');
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No overflow at ' + width);
      const boxes = await page.locator('.auth-panel button, .auth-panel input, .auth-help a').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect(); return { width: box.width, height: box.height };
      }));
      assert.ok(boxes.every(box => box.width >= 44 && box.height >= 44), 'Usable touch targets at ' + width);
      const providers = await page.locator('.auth-provider').evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect(); const style = getComputedStyle(button);
        return { width: box.width, height: box.height, background: style.backgroundColor, font: style.fontSize };
      }));
      assert.deepEqual(providers[0], providers[1], 'Equal provider prominence at ' + width);
      await microsoft.focus();
      assert.equal(await microsoft.evaluate(button => getComputedStyle(button).outlineWidth), '3px');
      await page.screenshot({ path: resolve(output, 'signin-' + width + '.png'), fullPage: true });
    }
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await touch.route('https://fonts.googleapis.com/**', route => route.abort());
    await touch.route('https://www.gstatic.com/firebasejs/10.12.0/*.js', route => route.fulfill({ contentType: 'text/javascript', body: sdk }));
    const touchPage = await touch.newPage();
    await touchPage.goto(origin + '/login');
    await touchPage.getByRole('button', { name: 'Continue with Microsoft' }).tap();
    await touchPage.waitForURL(origin + '/play');
    await touch.close();

    const production = await context.newPage();
    await production.route('https://molesunderthepitch.org/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/firebase-web-config.js') {
        await route.fulfill({ contentType: 'text/javascript', body: configurationScript(resolveEnvironment(['--environment', 'prod'])) });
        return;
      }
      const file = resolve(root, '.' + (extname(url.pathname) ? url.pathname : url.pathname + '/index.html'));
      try {
        await route.fulfill({ contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await production.goto('https://molesunderthepitch.org/login');
    await production.waitForFunction(() => !document.querySelector('#sign-in-methods').disabled);
    assert.equal(await production.locator('#auth-environment').isHidden(), true, 'Live sign-in omits development configuration details');
    await production.evaluate(() => document.fonts.ready);
    for (const width of [1280, 390]) {
      await production.setViewportSize({ width, height: 1000 });
      await production.screenshot({ path: resolve(output, 'signin-prod-' + width + '.png'), fullPage: true });
    }
    await production.close();

    await open();
    await page.evaluate(() => {
      localStorage.removeItem('moles-email-link-address');
      sessionStorage.setItem('moles-login-return-to', '/teambuilder');
    });
    await page.goto(origin + '/login/complete?oobCode=fixture');
    const completeEmail = page.getByRole('textbox', { name: 'Email address', exact: true });
    const complete = page.getByRole('button', { name: 'Complete sign-in', exact: true });
    await completeEmail.fill('coach@example.test');
    await page.evaluate(() => { window.__hold = true; window.__errorCode = 'auth/network-request-failed'; });
    await complete.click();
    await page.waitForFunction(() => typeof window.__release === 'function');
    assert.equal(await complete.isDisabled(), true);
    await page.locator('#completion-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(await page.evaluate(() => window.__authCalls.length), 1);
    await page.evaluate(() => window.__release());
    await page.locator('#completion-message').filter({ hasText: /Check your internet connection/ }).waitFor();
    assert.equal(await complete.isEnabled(), true);
    await page.evaluate(() => { window.__hold = false; window.__errorCode = null; });
    await complete.click();
    await page.waitForURL(origin + '/teambuilder');

    const blockedStorage = await context.newPage();
    await blockedStorage.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, name, { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      }
    });
    await blockedStorage.goto(origin + '/login/complete?oobCode=fixture');
    await blockedStorage.getByRole('textbox', { name: 'Email address' }).fill('coach@example.test');
    await blockedStorage.getByRole('button', { name: 'Complete sign-in' }).click();
    await blockedStorage.waitForURL(origin + '/play');
    await blockedStorage.close();

    await page.goto(origin + '/login/complete?oobCode=fixture');
    await completeEmail.fill('coach@example.test');
    await page.evaluate(() => { window.__errorCode = 'auth/expired-action-code'; });
    await complete.click();
    await page.locator('#completion-message').filter({ hasText: /expired or has already been used/ }).waitFor();
    assert.equal(await page.locator('#completion-form').isHidden(), true);
    assert.equal(await page.getByRole('link', { name: 'Request another sign-in link' }).getAttribute('href'), '/login');

    await context.route('**/firebase-web-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.MOLES_FIREBASE_CONFIG={};' }));
    await page.goto(origin + '/login');
    await message.filter({ hasText: /Sign-in could not load/ }).waitFor();
    assert.equal(await microsoft.isDisabled(), true);
    assert.equal(await page.getByRole('link', { name: 'Help signing in', exact: true }).isEnabled(), true);
    await context.unroute('**/firebase-web-config.js');
    await context.route('https://www.gstatic.com/firebasejs/10.12.0/*.js', route => route.abort());
    await page.goto(origin + '/login');
    await message.filter({ hasText: /Sign-in could not load/ }).waitFor();
    assert.equal(await microsoft.isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
