import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));

async function checkTopicNavigation(page, keyboard = false) {
  const links = await page.getByRole('navigation', { name: 'Support topics' }).getByRole('link').all();
  assert.equal(links.length, 7, 'Every main help/reference topic has an opening shortcut');
  for (const link of links) {
    const fragment = await link.getAttribute('href');
    assert.ok(fragment.startsWith('#'));
    const target = page.locator(fragment);
    assert.equal(await target.count(), 1, `Topic ${fragment} has one destination`);
    if (keyboard) { await link.focus(); await link.press('Enter'); }
    else await link.click();
    assert.equal(new URL(page.url()).hash, fragment);
    await page.waitForFunction(id => document.activeElement?.id === id, fragment.slice(1));
    await page.waitForFunction(id => {
      const box = document.getElementById(id).getBoundingClientRect();
      return box.y >= 0 && box.y < innerHeight;
    }, fragment.slice(1));
  }
}

test('support topics and sign-in help work without scripts while scaling preserves keyboard and touch behavior', async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://local').pathname;
    const file = resolve(root, `.${['/support', '/login', '/login/complete'].includes(path) ? `${path}/index.html` : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    if (!process.env.FFB_VISUAL_FONTS) await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/support`);
    const output = fileURLToPath(new URL('../../test-output/support-page/', import.meta.url));
    await mkdir(output, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, 'desktop-opening.png') });
    await checkTopicNavigation(page, true);
    const sectionOrder = await page.locator('main > section > h2').evaluateAll(headings => headings.map(heading => heading.id));
    assert.ok(sectionOrder.indexOf('sign-in-help') < sectionOrder.indexOf('viewing-heading'));
    assert.ok(sectionOrder.indexOf('contact') < sectionOrder.indexOf('viewing-heading'));
    assert.ok(sectionOrder.indexOf('performance-help') < sectionOrder.indexOf('viewing-heading'));
    const performanceHelp = page.getByRole('region', { name: 'Report stuttering or delays' });
    assert.equal(await performanceHelp.getByRole('link', { name: 'DEV client', exact: true }).getAttribute('href'), 'https://dev.molesunderthepitch.org/play');
    assert.equal(await performanceHelp.getByRole('link', { name: 'support@thegrognardcodes.org', exact: true }).getAttribute('href'), 'mailto:support@thegrognardcodes.org');
    assert.match(await performanceHelp.textContent(), /Debug → Performance & Network/);
    assert.match(await performanceHelp.textContent(), /Pause/);
    assert.match(await performanceHelp.textContent(), /Export JSON/);
    assert.match(await performanceHelp.textContent(), /No file is saved or sent automatically/);
    await performanceHelp.screenshot({ path: resolve(output, 'performance-help-desktop.png') });
    assert.deepEqual(await page.locator('.support-auth-help > summary').allTextContents(),
      ['Google sign-in', 'Microsoft sign-in', 'Email sign-in links']);
    const microsoftHelp = page.locator('.support-auth-help').filter({ has: page.locator('summary', { hasText: 'Microsoft sign-in' }) });
    assert.match(await microsoftHelp.textContent(), /personal Microsoft account/);
    assert.match(await microsoftHelp.textContent(), /Work or school accounts are not supported/);
    assert.match(await microsoftHelp.textContent(), /another sign-in method/);
    for (const help of await page.locator('.support-auth-help').all()) {
      await help.locator('summary').focus();
      await help.locator('summary').press('Enter');
      assert.equal(await help.getAttribute('open'), '', 'Method help opens with the keyboard');
    }
    await page.locator('section[aria-labelledby="sign-in-help"]').screenshot({ path: resolve(output, 'sign-in-help-desktop.png') });
    const slider = page.getByRole('slider', { name: 'OS / display scaling' });
    await page.waitForFunction(() => !document.querySelector('#display-scale').disabled);
    await slider.focus();
    const cssTargets = await page.locator('.support-calculated-sizes dt span').allTextContents();
    const expected = [
      ['1920 × 900', '1366 × 768', '1024 × 600', '1350 × 300', '980 × 320'],
      ['2400 × 1125', '1708 × 960', '1280 × 750', '1688 × 375', '1225 × 400'],
      ['2880 × 1350', '2049 × 1152', '1536 × 900', '2025 × 450', '1470 × 480'],
      ['3360 × 1575', '2391 × 1344', '1792 × 1050', '2363 × 525', '1715 × 560'],
      ['3840 × 1800', '2732 × 1536', '2048 × 1200', '2700 × 600', '1960 × 640'],
    ];
    for (let index = 0; index < expected.length; index++) {
      if (index) await slider.press('ArrowRight');
      const percent = 100 + index * 25;
      assert.equal(await slider.inputValue(), String(percent));
      assert.equal(await slider.getAttribute('aria-valuetext'), `${percent} percent`);
      assert.equal(await page.locator('#scale-value').textContent(), `${percent}%`);
      assert.deepEqual(await page.locator('.physical-size').allTextContents(), expected[index].map(size => `${size} physical px`));
      assert.deepEqual(await page.locator('.support-calculated-sizes dt span').allTextContents(), cssTargets);
      assert.match(await page.locator('#scale-summary').textContent(), /100% browser zoom/);
    }
    await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '200');
    await slider.press('Home');
    await slider.press('ArrowLeft');
    assert.equal(await slider.inputValue(), '100');
    await page.getByText('Layout fit is different from comfortable play', { exact: true }).click();
    assert.equal(await page.getByText('1350 × 300 CSS pixels for live coaching/spectating', { exact: true }).isVisible(), true);
    await page.getByText('Layout fit is different from comfortable play', { exact: true }).click();

    await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
    const geometryEvidence = [];
    for (const width of [1440, 768, 640, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
      const topicBoxes = await page.getByRole('navigation', { name: 'Support topics' }).getByRole('link').evaluateAll(links => links.map(link => {
        const { width, height } = link.getBoundingClientRect();
        return { width, height, fontSize: parseFloat(getComputedStyle(link).fontSize) };
      }));
      assert.ok(topicBoxes.every(box => box.width >= 44 && box.height >= 44), `Topic links retain touch targets at ${width}px`);
      assert.ok(topicBoxes.every(box => box.fontSize >= 11), `Topic links remain legible at ${width}px`);
      geometryEvidence.push({ width, topicBoxes, panelPadding: await page.locator('.panel').evaluateAll(panels => panels.map(panel => {
        const style = getComputedStyle(panel);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      })) });
      if (width === 390) {
        await performanceHelp.screenshot({ path: resolve(output, 'performance-help-mobile.png') });
        await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
        for (const help of await page.locator('.support-auth-help').all()) await help.locator('summary').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(output, 'mobile-opening.png') });
        for (const help of await page.locator('.support-auth-help').all()) await help.locator('summary').click();
        await page.locator('section[aria-labelledby="sign-in-help"]').screenshot({ path: resolve(output, 'sign-in-help-mobile.png') });
      }
    }
    await writeFile(resolve(output, 'geometry.json'), JSON.stringify(geometryEvidence, null, 2));
    assert.deepEqual(errors, []);

    const touch = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    await touch.route('https://fonts.googleapis.com/**', route => route.abort());
    const touchPage = await touch.newPage();
    await touchPage.goto(page.url());
    await touchPage.getByRole('navigation', { name: 'Support topics' }).getByRole('link', { name: 'Contact support', exact: true }).tap();
    assert.equal(new URL(touchPage.url()).hash, '#contact');
    assert.equal(await touchPage.locator('#contact').evaluate(element => document.activeElement === element), true);
    await touchPage.getByRole('navigation', { name: 'Support topics' }).getByRole('link', { name: 'Stuttering & delays', exact: true }).tap();
    assert.equal(new URL(touchPage.url()).hash, '#performance-help');
    assert.equal(await touchPage.locator('#performance-help').evaluate(element => document.activeElement === element), true);
    const touchSlider = touchPage.getByRole('slider');
    await touchSlider.scrollIntoViewIfNeeded();
    await touchPage.waitForFunction(() => !document.querySelector('#display-scale').disabled);
    const bounds = await touchSlider.boundingBox();
    await touchPage.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    assert.equal(await touchSlider.inputValue(), '150');
    assert.equal(await touchPage.locator('.physical-size').first().textContent(), '2880 × 1350 physical px');

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    if (!process.env.FFB_VISUAL_FONTS) await noScript.route('https://fonts.googleapis.com/**', route => route.abort());
    const fallback = await noScript.newPage();
    await fallback.goto(page.url());
    await checkTopicNavigation(fallback, true);
    for (const help of await fallback.locator('.support-auth-help').all()) {
      await help.locator('summary').click();
      assert.equal(await help.getAttribute('open'), '', 'Method help remains available without JavaScript');
    }
    assert.equal(await fallback.getByRole('slider').isDisabled(), true);
    assert.deepEqual(await fallback.locator('.physical-size').allTextContents(), expected[0].map(size => `${size} physical px`));
    assert.equal(await fallback.locator('noscript').isVisible(), true);
    assert.equal(await fallback.getByRole('heading', { name: 'Planning for animated matches' }).isVisible(), true);
    assert.equal(await fallback.getByRole('link', { name: 'support@molesunderthepitch.org', exact: true }).isVisible(), true);
    assert.equal(await fallback.getByRole('link', { name: 'support@thegrognardcodes.org', exact: true }).isVisible(), true);
    assert.equal(await fallback.getByRole('region', { name: 'Report stuttering or delays' }).getByRole('list').getByRole('listitem').count(), 4);
    assert.equal(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const authGeometry = [];
    for (const route of ['/login', '/login/complete']) {
      for (const width of [1280, 390, 320]) {
        await fallback.setViewportSize({ width, height: 900 });
        await fallback.goto(`http://127.0.0.1:${server.address().port}${route}`);
        await fallback.evaluate(() => {
          // Exercise the existing email-confirmation form without requesting a sign-in.
          const form = document.querySelector('#completion-form');
          if (form) form.hidden = false;
        });
        await fallback.evaluate(() => document.fonts.ready);
        const fontSizes = await fallback.locator('main .button').evaluateAll(buttons => buttons.map(button => parseFloat(getComputedStyle(button).fontSize)));
        assert.ok(fontSizes.every(size => size >= 11), `Sign-in controls stay legible on ${route} at ${width}px`);
        assert.equal(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} fits at ${width}px`);
        authGeometry.push({ route, width, fontSizes });
        await fallback.screenshot({ path: resolve(output, `${route === '/login' ? 'login' : 'email-completion'}-${width}.png`), fullPage: true });
      }
      await fallback.getByRole('link', { name: 'Help signing in', exact: true }).click();
      assert.equal(new URL(fallback.url()).pathname, '/support');
      assert.equal(new URL(fallback.url()).hash, '#sign-in-help');
      assert.equal(await fallback.locator('#sign-in-help').evaluate(element => document.activeElement === element), true);
    }
    await writeFile(resolve(output, 'auth-geometry.json'), JSON.stringify(authGeometry, null, 2));
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
