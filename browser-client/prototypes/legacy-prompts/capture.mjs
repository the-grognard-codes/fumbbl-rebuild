// Reproducible visual review evidence, not a production regression suite.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('./review/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], checks = [], files = [];
const variants = process.argv.includes('--horizontal') ? ['horizontal'] : ['horizontal', 'vertical'];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const expect = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
async function ready() {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function capture(name) {
  await ready();
  expect(await page.locator('.prompt').evaluate(element => element.scrollWidth <= element.clientWidth), `${name}: prompt has no horizontal overflow`);
  await page.locator('.match-frame').screenshot({ path: `${output}${name}.png`, style: '.switcher { visibility: hidden }' });
  if (name.endsWith('-horizontal') && !name.startsWith('narrow-')) await page.locator('.prompt').screenshot({ path: `${output}${name}-detail.png` });
  files.push(name);
}
for (const variant of variants) {
  for (const scenario of ['coin', 'kickoff', 'apothecary', 'multiple', 'argue', 'bribe', 'interception']) {
    await page.goto(`http://127.0.0.1:5187/pitch-preview?variant=${variant}&scenario=${scenario}`);
    await ready();
    if (['multiple', 'interception'].includes(scenario)) await page.getByRole('button', { name: '#7 · Aldric', exact: false }).click();
    await capture(`${scenario}-${variant}`);
  }
  await page.goto(`http://127.0.0.1:5187/pitch-preview?variant=${variant}&scenario=bribe&offPitch=true`);
  await capture(`off-pitch-bribe-${variant}`);
  expect(await page.locator('.connector').count() === 0, `${variant}: off-pitch has no connector`);
  expect(await page.locator('.context').textContent() === 'Player #7', `${variant}: off-pitch subject identified by number`);
}
await page.goto('http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=interception');
await ready();
expect(await page.getByRole('button', { name: 'Confirm interceptor', exact: true }).isDisabled(), 'Interception requires a candidate before confirmation');
expect(await page.locator('h1').textContent() === 'Nominate an interceptor', 'Horizontal interception uses revised heading');
expect(await page.locator('.selection-note,.eyebrow,.context').count() === 0, 'Horizontal interception removes redundant copy');
expect(await page.locator('.option img.portrait').count() === 3, 'Interception uses three player-card portraits');
await page.getByRole('button', { name: '#7 · Aldric', exact: false }).click();
expect(await page.locator('.connector').getAttribute('aria-label') === 'Focus on player 7', 'First selection anchors player 7');
await page.getByRole('button', { name: '#9 · Bram', exact: false }).click();
expect(await page.locator('.connector').getAttribute('aria-label') === 'Focus on player 9', 'Switching candidates moves connector to player 9');
expect((await page.locator('.state').textContent()).includes('Previewing player #9'), 'Candidate switching remains preview-only');
const before = await page.locator('.connector circle').getAttribute('cx');
const stage = await page.locator('.pitch-stage').boundingBox();
await page.mouse.move(stage.x + 50, stage.y + 500); await page.mouse.down(); await page.mouse.move(stage.x + 110, stage.y + 500, { steps: 4 }); await page.mouse.up();
expect(await page.locator('.connector circle').getAttribute('cx') !== before, 'Panning updates subject connector');
await page.getByRole('button', { name: 'Confirm interceptor', exact: true }).click();
expect((await page.locator('.state').textContent()).includes('Confirmed player #9'), 'Confirm uses latest selected candidate');
await page.getByRole('button', { name: 'Decline', exact: true }).click();
expect(await page.locator('.connector').count() === 0, 'Decline clears preview connector');
await page.goto('http://127.0.0.1:5187/pitch-preview?scenario=coin');
expect(await page.getByRole('dialog').getAttribute('aria-modal') === 'true', 'Coin choice is blocking');
expect(await page.locator('.camera-controls').count() === 0, 'Blocking coin choice hides navigation controls');
expect((await page.getByRole('dialog').innerText()).includes('Heads') && (await page.getByRole('dialog').innerText()).includes('Tails'), 'Coin prompt restores visible Heads and Tails labels');
for (const variant of variants) {
  await page.setViewportSize({ width: 390, height: 1000 });
  for (const scenario of ['interception', 'multiple']) {
    await page.goto(`http://127.0.0.1:5187/pitch-preview?variant=${variant}&scenario=${scenario}`);
    await ready();
    await page.getByRole('button', { name: '#7 · Aldric', exact: false }).click();
    await capture(`narrow-${scenario}-${variant}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant}/${scenario}: no page overflow at 390px`);
  }
}
await page.setViewportSize({ width: 1440, height: 1000 });
for (const scenario of ['apothecary', 'argue']) {
  await page.goto(`http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=${scenario}&art=goblin`);
  await ready();
  await page.locator('.prompt').screenshot({ path: `${output}${scenario}-goblin-detail.png` });
  await page.goto(`http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=${scenario}&art=mole`);
  await ready();
  expect(await page.locator('.option img[src*="mole-"]').count() === 1, `${scenario}: mole alternate is loaded`);
  await page.locator('.prompt').screenshot({ path: `${output}${scenario}-mole-detail.png` });
}
await writeFile(`${output}mole-comparison.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mole alternatives</title><style>body{background:#08131f;color:#f4e5c7;font:16px system-ui;margin:24px}a{color:#8fe4ed}.pair{display:flex;gap:24px;flex-wrap:wrap}h1{font-size:24px}h2{font-size:18px}img{max-width:100%}figure{margin:0}figcaption{margin:10px 0;color:#acc6d5}</style><h1>Mole medics and referee · horizontal review</h1><p>Original goblins retained for comparison. Heads/Tails labels restored below the coins.</p><p><a href="http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=apothecary&art=mole">Preview mole medics on pitch</a> · <a href="http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=argue&art=mole">Preview mole referee</a></p>${['apothecary','argue'].map(name=>`<h2>${name === 'argue' ? 'Argue the call' : 'Apothecary'}</h2><div class="pair">${['goblin','mole'].map(kind=>`<figure><img src="${name}-${kind}-detail.png" alt="${name} ${kind} variant"><figcaption>${kind === 'goblin' ? 'Original goblin artwork' : 'New mole artwork'}</figcaption></figure>`).join('')}</div>`).join('')}<h2>Coin toss</h2><img src="coin-horizontal-detail.png" alt="Coin toss with Heads and Tails labels"></html>`);
await page.goto('http://127.0.0.1:5187/prototypes/legacy-prompts/review/mole-comparison.html');
await ready();
await page.screenshot({ path: `${output}mole-comparison.png`, fullPage: true });
expect(errors.length === 0, `No browser or asset errors (${errors.length})`);
await writeFile(`${output}validation.json`, JSON.stringify({ checks, errors, images: files, note: 'Chromium prototype checks only; no production/live-play/replay/recovery or native Android/Linux validation.' }, null, 2));
await writeFile(`${output}index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>MUTP prompt review</title><style>body{background:#08131f;color:#f4e5c7;font:18px system-ui;margin:32px}h1{font-size:28px}section{margin:32px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border:1px solid #58768b}a{color:#8fe4ed}figcaption{margin:8px}figure{margin:0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Decision prompts · horizontal vs vertical</h1><p>Choose one orientation across the tranche. Existing apothecary art is unchanged. All scenes use fixture data.</p><p><a href="http://127.0.0.1:5187/pitch-preview?scenario=interception">Open interactive review</a></p>${['coin','kickoff','apothecary','multiple','argue','bribe','interception','off-pitch-bribe','narrow-interception','narrow-multiple'].map(name => `<section><h2>${name}</h2><div class="pair">${['horizontal','vertical'].map(variant => `<figure><a href="${name}-${variant}.png"><img src="${name}-${variant}.png" alt="${name} ${variant}"></a><figcaption>${variant}</figcaption></figure>`).join('')}</div></section>`).join('')}</html>`);
await writeFile(`${output}horizontal.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Horizontal prompts · revision 2</title><style>body{background:#08131f;color:#f4e5c7;font:16px system-ui;margin:24px}h1{font-size:24px}h2{font-size:16px;color:#acc6d5}a{color:#8fe4ed}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px;max-width:1120px}img{max-width:100%;display:block}p{max-width:800px}</style><h1>Horizontal prompts · revision 2</h1><p>Horizontal selected. Revised artwork and tighter spacing. Click any prompt for its full pitch view. Vertical mockups are retained unchanged.</p><p><a href="http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=coin">Interactive review</a></p><div class="gallery">${['coin','kickoff','apothecary','multiple','argue','bribe','interception','off-pitch-bribe'].map(name => `<section><h2>${name}</h2><a href="${name}-horizontal.png"><img src="${name}-horizontal-detail.png" alt="${name} revised horizontal prompt"></a></section>`).join('')}</div><p>Narrow view: <a href="narrow-interception-horizontal.png">interception</a> · <a href="narrow-multiple-horizontal.png">multiple injuries</a></p></html>`);
await page.setViewportSize({ width: 1140, height: 900 });
await page.goto('http://127.0.0.1:5187/prototypes/legacy-prompts/review/horizontal.html');
await ready();
await page.screenshot({ path: `${output}horizontal-gallery.png`, fullPage: true });
await page.setViewportSize({ width: 1200, height: 900 });
await page.goto('http://127.0.0.1:5187/prototypes/legacy-prompts/review/index.html');
await ready();
await page.addStyleTag({ content: 'body{margin:18px}h1{font-size:24px}h2{font-size:18px;margin:10px 0}section{margin:16px 0}figure{font-size:13px}.pair{gap:12px}' });
await page.screenshot({ path: `${output}comparison-gallery.png`, fullPage: true });
await browser.close();
console.log(JSON.stringify({ images: files.length, checks: checks.length, errors }, null, 2));
