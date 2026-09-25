import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = 'test-output/pitch-parity';
const errors = [];
await mkdir(output, { recursive: true });
async function clickPixiSquare(page, x, y) {
  const box = await page.locator('.parity-pixi-scene canvas').boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + (30 + x * 36) * box.width / 960, box.y + (30 + y * 36) * box.height / 564);
}
try {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto('http://127.0.0.1:5173/pitch-parity');
    await page.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
    assert.equal(await page.locator('.parity-marker').count(), 22);
    await page.waitForFunction(() => [...document.querySelectorAll('.parity-marker img')].every(image => image.complete));
    assert.equal(await page.locator('.parity-marker img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth >= 64)), true);
    await page.screenshot({ path: `${output}/${width}x${height}-crowded-100.png`, fullPage: true });
    await page.getByRole('button', { name: 'Crowded 11 v 11' }).click();
    await page.screenshot({ path: `${output}/${width}x${height}-normal-100.png`, fullPage: true });
    await page.getByRole('button', { name: 'Crowded 11 v 11' }).click();
    await page.getByRole('button', { name: '2×' }).click();
    const zoomed = await page.locator('.parity-viewport').first().evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    assert.ok(zoomed.scrollWidth > zoomed.clientWidth, '2× creates a pannable pitch');
    await page.screenshot({ path: `${output}/${width}x${height}-crowded-200.png`, fullPage: true });
    await page.getByRole('button', { name: 'Fit' }).click();
    for (const [button, label] of [['DOM only', 'dom'], ['Pixi only', 'pixi']]) {
      await page.getByRole('button', { name: button }).click();
      if (label === 'pixi') await page.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
      await page.screenshot({ path: `${output}/${width}x${height}-${label}-100.png`, fullPage: true });
      await page.getByRole('button', { name: '2×' }).click();
      await page.screenshot({ path: `${output}/${width}x${height}-${label}-200.png`, fullPage: true });
      await page.getByRole('button', { name: 'Fit' }).click();
    }
    await page.getByRole('button', { name: 'Side by side' }).click();
    await page.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
    await page.locator('.parity-marker[data-player="home-1"]').click();
    await page.locator('.parity-marker[data-player="away-1"]').click();
    await page.getByTestId('parity-path').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Commit blitz' }).isEnabled(), true);
    await page.screenshot({ path: `${output}/${width}x${height}-blitz-preview.png`, fullPage: true });
    await page.getByRole('button', { name: 'Commit blitz' }).click();
    try { await page.getByRole('button', { name: 'Choose defender down' }).waitFor({ timeout: 5000 }); }
    catch (error) { console.log('Blitz state after commit:', { url: page.url(), closed: page.isClosed(), commandCount: await page.locator('.parity-command').count(), errors }); throw error; }
    await page.getByRole('button', { name: 'Choose defender down' }).click();
    assert.match(await page.locator('.parity-command').textContent(), /Mock block result: defender down/);
    await page.getByRole('button', { name: 'Pixi only' }).click();
    await page.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
    await page.getByRole('button', { name: 'Reset fixture' }).click();
    await clickPixiSquare(page, 5, 7);
    await clickPixiSquare(page, 10, 7);
    assert.equal(await page.getByRole('button', { name: 'Commit blitz' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Commit blitz' }).click();
    await page.getByRole('button', { name: 'Choose push' }).waitFor();
    await page.getByRole('button', { name: 'Choose push' }).click();
    assert.match(await page.locator('.parity-command').textContent(), /Mock block result: push/);
    await page.close();
  }
  const failed = await browser.newPage();
  failed.on('pageerror', error => errors.push(error.message));
  await failed.goto('http://127.0.0.1:5173/pitch-parity?parityFault=init');
  await failed.getByRole('grid', { name: 'Pitch fallback grid' }).waitFor();
  assert.equal(await failed.getByRole('gridcell').count(), 390);
  await failed.getByRole('gridcell', { name: /Column 6, row 8, Alden/ }).click();
  await failed.getByRole('gridcell', { name: /Column 11, row 8, Rhea/ }).click();
  assert.equal(await failed.getByRole('button', { name: 'Commit blitz' }).isEnabled(), true);
  await failed.screenshot({ path: `${output}/webgl-init-fallback.png`, fullPage: true });
  await failed.close();
  const contextLoss = await browser.newPage();
  contextLoss.on('pageerror', error => errors.push(error.message));
  await contextLoss.goto('http://127.0.0.1:5173/pitch-parity');
  await contextLoss.locator('.parity-pixi-scene[data-ready="true"] canvas').waitFor();
  await contextLoss.getByRole('button', { name: 'Simulate context loss' }).click();
  await contextLoss.getByRole('grid', { name: 'Pitch fallback grid' }).waitFor();
  assert.equal(await contextLoss.getByRole('gridcell').count(), 390);
  await contextLoss.getByRole('gridcell', { name: /Column 6, row 8, Alden/ }).click();
  await contextLoss.getByRole('gridcell', { name: /Column 11, row 8, Rhea/ }).click();
  assert.equal(await contextLoss.getByRole('button', { name: 'Commit blitz' }).isEnabled(), true);
  await contextLoss.close();
  const missingSprite = await browser.newPage();
  missingSprite.on('pageerror', error => errors.push(error.message));
  await missingSprite.goto('http://127.0.0.1:5173/pitch-parity?parityFault=sprite');
  await missingSprite.locator('.parity-marker[data-player="home-1"] .parity-token').waitFor();
  await missingSprite.getByText(/Sprite unavailable: 02-blitzer-man.png/).waitFor();
  await missingSprite.screenshot({ path: `${output}/sprite-fallback.png`, fullPage: true });
  await missingSprite.close();
  assert.deepEqual(errors, []);
  console.log('PASS M5 parity: shared Blitz interaction, sprites, two viewport captures, startup/context failure grid');
} finally {
  await browser.close();
}
