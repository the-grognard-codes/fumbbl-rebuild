import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const root = new URL('../src/', import.meta.url);
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
const authMock = `
  export const getAuth = config => config;
  export const connectAuthEmulator = () => {};
  export class GoogleAuthProvider {}
  export const onAuthStateChanged = (auth, callback) => { queueMicrotask(() => callback(window.__mockUser || (sessionStorage.getItem('mock-signed-in') ? { getIdToken: async () => 'test-token' } : null))); return () => {}; };
  export const signOut = async () => { window.__mockUser = null; sessionStorage.setItem('mock-signout', 'true'); };
  export const signInWithPopup = async () => { window.__popupCalled = true; sessionStorage.setItem('mock-signed-in', 'true'); };
  export const sendSignInLinkToEmail = async () => { window.__emailLinkSent = true; };
  export const isSignInWithEmailLink = () => true;
  export const signInWithEmailLink = async (auth, email) => { if (localStorage.getItem('reject-email') || email !== 'player@example.test') throw new Error('wrong email'); sessionStorage.setItem('mock-completed-email', email); sessionStorage.setItem('mock-signed-in', 'true'); };
`;

async function startSite() {
  const server = createServer(async (request, response) => {
    const route = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    const relative = route.endsWith('/') || !extname(route) ? `${route.replace(/\/$/, '')}/index.html` : route;
    try {
      const content = relative === '/firebase-web-config.js'
        ? "window.MOLES_FIREBASE_CONFIG = { environment: 'test', projectId: 'test', apiKey: 'test', authDomain: 'test', appId: 'test', gameWebSocketUrl: 'wss://game.test/session/v1', emailLinkUrl: 'http://test/login/complete' };"
        : await readFile(new URL(`.${relative}`, root));
      response.writeHead(200, { 'content-type': extname(relative) === '.js' ? 'text/javascript' : extname(relative) === '.css' ? 'text/css' : 'text/html' });
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function mockFirebase(page) {
  await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const initializeApp = config => config;' }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authMock }));
}

const socketMock = () => {
  class WebSocket {
    static OPEN = 1;
    constructor() { this.readyState = 1; window.__lastSocket = this; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.type === 'authenticate') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'authenticated' }) }), 0);
      if (message.type === 'create') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'session', code: '0123456789abcdef0123456789abcdef', selfSlot: 0, slots: [{ occupied: true, connected: true }, { occupied: false, connected: false }], events: [] }) }), 0);
      if (message.type === 'join') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'session', code: message.code, selfSlot: 1, slots: [{ occupied: true, connected: true }, { occupied: true, connected: true }], events: [] }) }), 0);
      if (message.type === 'leave') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'left' }) }), 0);
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  window.WebSocket = WebSocket;
};

test('mocked Firebase play flow renders a session in two browser contexts', { timeout: 15000 }, async () => {
  const site = await startSite();
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const first = await browser.newContext();
    const second = await browser.newContext();
    for (const context of [first, second]) await context.addInitScript(() => { window.__mockUser = { getIdToken: async () => 'test-token' }; });
    const creator = await first.newPage();
    const joiner = await second.newPage();
    creator.setDefaultTimeout(4000);
    joiner.setDefaultTimeout(4000);
    await Promise.all([mockFirebase(creator), mockFirebase(joiner)]);
    await creator.addInitScript(socketMock);
    await joiner.addInitScript(socketMock);
    await creator.goto(`${site.url}/play`);
    await creator.getByText('Connected. Waiting for both players.').waitFor();
    await creator.getByRole('button', { name: 'Create session' }).click();
    await assert.doesNotReject(creator.getByText('Waiting for opponent.').waitFor());
    await assert.doesNotReject(creator.getByRole('link', { name: 'Share invite link' }).waitFor());
    await joiner.goto(`${site.url}/play#0123456789abcdef0123456789abcdef`);
    await assert.doesNotReject(joiner.getByText('Both players joined.').waitFor());
    assert.equal(await joiner.locator('#you-slot').textContent(), 'You: connected');
    assert.ok((await creator.screenshot({ path: process.env.PLAY_SCREENSHOT_PATH })).byteLength > 1000);
    await creator.getByRole('button', { name: 'Leave' }).click();
    await creator.getByText('Connected. Create or join a session.').waitFor();
    assert.equal(await creator.locator('#session-code').textContent(), '');
    await first.close();
    await second.close();
  } finally {
    await browser.close();
    await new Promise(resolve => site.server.close(resolve));
  }
});

test('mocked token expiry signs out before returning to the expired login route', { timeout: 15000 }, async () => {
  const site = await startSite();
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      let tokenAttempts = 0;
      window.__mockUser = { getIdToken: async () => { tokenAttempts += 1; if (tokenAttempts > 1) throw new Error('expired'); return 'test-token'; } };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    await mockFirebase(page);
    await page.addInitScript(socketMock);
    await page.goto(`${site.url}/play`);
    await page.getByText('Connected. Waiting for both players.').waitFor();
    await page.evaluate(() => window.__lastSocket.onmessage({ data: JSON.stringify({ type: 'error', code: 'expired' }) }));
    await page.waitForURL(`${site.url}/login?returnTo=%2Fplay&reason=expired`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mock-signout')), 'true');
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => site.server.close(resolve));
  }
});

test('mocked Google and email flows redirect to play and recover a wrong stored email', { timeout: 15000 }, async () => {
  const site = await startSite();
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    await mockFirebase(page);
    await page.addInitScript(socketMock);
    await page.goto(`${site.url}/play`);
    await page.waitForURL(`${site.url}/login?returnTo=%2Fplay`);
    await page.goto(`${site.url}/login?returnTo=%2Fplay&reason=expired`);
    await assert.doesNotReject(page.getByText('Your sign-in expired. Sign in again to continue.').waitFor());
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.waitForURL(`${site.url}/play`);
    await page.getByText('Connected. Waiting for both players.').waitFor();
    await page.evaluate(() => sessionStorage.removeItem('mock-signed-in'));
    await page.goto(`${site.url}/login/complete`);
    await page.evaluate(() => { localStorage.setItem('moles-email-link-address', 'wrong@example.test'); localStorage.setItem('reject-email', 'true'); });
    await page.reload();
    await assert.doesNotReject(page.getByText('Enter the email address used to request this link.').waitFor());
    assert.equal(await page.locator('#completion-form').isVisible(), true);
    await page.evaluate(() => localStorage.removeItem('reject-email'));
    await page.locator('#completion-email').fill('player@example.test');
    await page.locator('#completion-form button').click();
    await page.waitForURL(`${site.url}/play`);
    await page.getByText('Connected. Waiting for both players.').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('mock-completed-email')), 'player@example.test');
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => site.server.close(resolve));
  }
});
