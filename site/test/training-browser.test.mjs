import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trainingServer } from '../../computer-player/training/ui-server.mjs';
const require = createRequire(process.env.TRAINING_BROWSER_PACKAGE ?? new URL('../../browser-client/package.json',import.meta.url));
const { chromium } = require('playwright');
const launchBrowser = () => chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined)
});
const summary = {schemaVersion:1,config:{home:'bogruk',away:'gobbo',games:2},completed:1,durationMs:60000,failures:{decision_cap:1},records:[{id:'match-0',coaches:['bogruk','gobbo'],seed:42,score:[1,0],completed:true},{id:'match-1',seed:42,score:[0,0],completed:false,failureCode:'decision_cap'}]};

test('built showcase is linked from Development and imports results without contacting an execution API', async t => {
  const output = new URL('../dist/', import.meta.url);
  let apiRequests = 0;
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://local');
    if (pathname.startsWith('/api/training/')) {
      apiRequests += 1;
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ controls: true, token: 'test', runs: [] }));
    }
    try {
      const file = extname(pathname) ? pathname : `${pathname.replace(/\/$/, '')}/index.html`;
      const content = await readFile(new URL(`.${file}`, output));
      response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] ?? 'application/octet-stream');
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/development`);
  assert.match(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundImage), /radial-gradient/);
  await page.getByRole('link', { name: 'Training lab', exact: true }).click();
  await page.getByRole('heading', { name: 'Training lab' }).waitFor();
  assert.equal(await page.locator('#controls').isVisible(), false);
  assert.equal(await page.locator('#refresh').isVisible(), false);
  assert.equal(await page.locator('#connection').innerText(), 'Read-only viewer');
  assert.deepEqual(await page.locator('body').evaluate(body => [
    getComputedStyle(body).backgroundImage, getComputedStyle(body, '::before').content
  ]), ['none', 'none']);
  await page.locator('#import').setInputFiles({name:'summary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(summary))});
  await page.getByRole('cell', { name: 'decision_cap', exact: true }).waitFor();
  assert.equal(apiRequests, 0);
  assert.deepEqual(errors, []);
});

test('desktop and mobile local viewer, results import, bounded form and stop controls', async t => {
  const app = await trainingServer({readOnly:true});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1365,height:1000}});
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const errors = []; page.on('pageerror',error => errors.push(error.message));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const output = new URL('../../.tools/training-ui-validation/',import.meta.url);
  await mkdir(output,{recursive:true});
    await page.goto(`${base}/training`);
    await page.getByText('Read-only viewer',{exact:true}).waitFor();
    assert.equal(await page.locator('#controls').isVisible(),false);
    await page.locator('#import').setInputFiles({name:'summary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(summary))});
    await page.getByRole('cell',{name:'decision_cap',exact:true}).waitFor();
    assert.equal(await page.locator('#metrics').innerText().then(t => t.includes('60.0')),true);
    await page.screenshot({path:fileURLToPath(new URL('viewer-desktop.png',output)),fullPage:true});
    let active = null, started;
    let disconnected = false;
    await page.route('**/api/training/**',route => {
      if (disconnected) return route.fulfill({status:503,json:{error:'offline'}});
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/start')) { started = route.request().postDataJSON(); active = {id:'browser-test',status:'running',config:started,log:'Test progress'}; }
      if (path.endsWith('/stop')) active.status = 'stopped';
      return route.fulfill({json:path.endsWith('/state') ? {controls:true,token:'test',runs:[],active} : {ok:true}});
    });
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Local controls connected',{exact:true}).waitFor();
    disconnected = true;
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Launcher disconnected',{exact:true}).waitFor();
    disconnected = false;
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Local controls connected',{exact:true}).waitFor();
    assert.equal(await page.locator('#viewer-note').innerText(),'Saved results stay on this machine. Nothing is uploaded.');
    await page.screenshot({path:fileURLToPath(new URL('controls-desktop.png',output)),fullPage:true});
    await page.getByRole('button',{name:'Start game test',exact:true}).click();
    await page.getByRole('button',{name:'Stop run',exact:true}).waitFor();
    assert.equal(started.games,'20'); assert.equal(started.budgetSeconds,900);
    assert.equal(await page.locator('[name=games]').isDisabled(),true);
    await page.getByRole('button',{name:'Stop run',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('active-status').textContent.startsWith('stopped'));
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.screenshot({path:fileURLToPath(new URL('controls-mobile.png',output)),fullPage:true});
    assert.deepEqual(errors,[]);
});
