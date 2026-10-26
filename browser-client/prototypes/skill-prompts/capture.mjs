// Visual/interaction evidence for a throwaway prototype, not a production regression suite.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('./review/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
const errors = [], checks = [];
const captures = new Set(['A-wrestle', 'B-wrestle', 'C-wrestle', 'A-urgent', 'B-urgent',
  'B-chooser', 'C-block', 'A-reroll', 'C-long', 'B-edge', 'A-portrait-pickup', 'C-portrait-long', 'top-down-away-contrast']);
const expect = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
async function ready() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    await Promise.all([...new Set([...document.querySelectorAll('svg image')].map(image => image.getAttribute('href')))].map(url => {
      const image = new Image(); image.src = url; return image.decode();
    }));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function capture(name) {
  if (!captures.has(name)) return;
  await ready();
  await page.locator('.match-frame').screenshot({ path: `${output}${name}.png`, style: '.variant-switcher{visibility:hidden}' });
}
async function clearPlacement(label) {
  await ready();
  const geometry = await page.evaluate(() => {
    const prompt = document.querySelector('.decision-position').getBoundingClientRect();
    const stage = document.querySelector('.pitch-stage').getBoundingClientRect();
    const overlap = [...document.querySelectorAll('[data-protected]')].filter(element => {
      const r = element.getBoundingClientRect();
      return prompt.left < r.right && prompt.right > r.left && prompt.top < r.bottom && prompt.bottom > r.top;
    }).map(element => element.getAttribute('data-protected'));
    return { overlap, inside: prompt.left >= stage.left && prompt.right <= stage.right && prompt.top >= stage.top && prompt.bottom <= stage.bottom };
  });
  expect(geometry.inside && !geometry.overlap.length, `${label}: full prompt inside board, protected players/ball/dice clear ${JSON.stringify(geometry)}`);
}
try {
  await page.goto('http://127.0.0.1:5183/pitch-preview?variant=A', { waitUntil: 'networkidle' }); await ready();
  expect(await page.locator('.player-art').count() === 22, 'All 22 existing player sprites load');
  for (const variant of ['A', 'B', 'C']) {
    await page.locator(`[data-variant-choice="${variant}"]`).click();
    await clearPlacement(`${variant} midfield`); await capture(`${variant}-wrestle`);
    await page.getByRole('button', { name: 'Final 20%', exact: true }).click();
    expect(await page.locator('.ribbon-number').textContent() === '6', `${variant}: number is six at 20% of 30 seconds`);
    expect(await page.locator('.ribbon-progress').evaluate(element => getComputedStyle(element).stroke) === 'rgb(255, 98, 107)', `${variant}: ring turns red at 20%`);
    await capture(`${variant}-urgent`);
    await page.getByRole('button', { name: 'Remount prompt · retain time' }).click();
    expect(await page.locator('.ribbon-number').textContent() === '6', `${variant}: remount retains paused countdown`);
    await page.getByRole('button', { name: 'No', exact: true }).click();
    expect((await page.locator('.outcome').textContent()).includes('existing decline'), `${variant}: No declines`);
    await page.getByRole('button', { name: 'Reset scenario', exact: true }).click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    expect(await page.getByRole('button', { name: 'Yes', exact: true }).isDisabled(), `${variant}: pending action disables Yes`);
    await page.locator('.outcome').waitFor();
    for (const [scenario, skill] of [['pickup', 'Sure Hands'], ['pass', 'Pass'], ['catch', 'Catch'], ['dodge', 'Dodge']]) {
      await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption(scenario);
      await clearPlacement(`${variant} ${skill} first`);
      expect(await page.locator('.source-chooser').count() === 0, `${variant}: ${skill} goes directly to its named prompt`);
      expect(await page.locator('.decision-question').textContent() === `Use ${skill}?`, `${variant}: prompt names ${skill}`);
      expect(await page.locator('.ribbon-number').count() === 0, `${variant}: untimed ${skill} does not invent a countdown`);
      if (scenario === 'pickup') await capture(`${variant}-reroll`);
      await page.getByRole('button', { name: 'No', exact: true }).click();
      expect((await page.locator('.outcome').textContent()).includes('without another reroll prompt'), `${variant}: declining ${skill} offers no team/Pro fallback`);
    }
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('dodgeSpent');
    await clearPlacement(`${variant} limited reroll chooser`); await capture(`${variant}-chooser`);
    for (const source of ['Pro', 'Team re-roll']) {
      await page.getByRole('button', { name: source, exact: true }).click();
      expect((await page.locator('.decision-question').textContent()).includes(source), `${variant}: ${source} has explicit confirmation`);
      await clearPlacement(`${variant} ${source} confirmation`);
      await page.getByRole('button', { name: 'Back / change choice' }).click();
      expect(await page.locator('.outcome').count() === 0, `${variant}: Back sends no action`);
    }
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('dodgeSpent');
    expect(await page.getByRole('button', { name: 'Dodge', exact: true }).count() === 0, `${variant}: later roll cannot offer a spent Dodge skill`);
    expect(await page.getByRole('button', { name: 'Pro', exact: true }).count() === 1
      && await page.getByRole('button', { name: 'Team re-roll', exact: true }).count() === 1, `${variant}: later roll offers remaining sources`);
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('block');
    await clearPlacement(`${variant} block chooser`); await capture(`${variant}-block`);
    await page.getByRole('button', { name: 'Brawler · Both Down die', exact: true }).click();
    expect(await page.getByRole('button', { name: 'No', exact: true }).count() === 0, `${variant}: block continuation has no invented No action`);
    await page.getByRole('button', { name: 'Keep original die 1' }).click();
    expect((await page.locator('.outcome').textContent()).includes('BOTH DOWN'), `${variant}: original block die remains selectable`);
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('long'); await capture(`${variant}-long`);
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('wrestle');
    for (const placement of ['sideline', 'edge']) {
      await page.getByRole('combobox', { name: 'Placement', exact: true }).selectOption(placement);
      await clearPlacement(`${variant} ${placement}`); await capture(`${variant}-${placement}`);
    }
    await page.getByRole('combobox', { name: 'Placement', exact: true }).selectOption('center');
  }
  await page.getByRole('combobox', { name: 'Starting allowance', exact: true }).selectOption('15');
  await page.getByRole('button', { name: 'Final 20%', exact: true }).click();
  expect(await page.locator('.ribbon-number').textContent() === '3', 'Future 15-second allowance becomes urgent at three seconds');
  await page.getByRole('combobox', { name: 'Starting allowance', exact: true }).selectOption('60');
  await page.getByRole('button', { name: 'Final 20%', exact: true }).click();
  expect(await page.locator('.ribbon-number').textContent() === '12', 'Future 60-second allowance becomes urgent at twelve seconds');
  await page.getByRole('combobox', { name: 'Starting allowance', exact: true }).selectOption('30');
  await page.getByRole('slider', { name: 'Time remaining', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Run timer', exact: true }).click();
  await page.locator('.outcome').waitFor();
  expect((await page.locator('.outcome').textContent()).includes('Deadline reached'), 'Running preview reaches the illustrated timeout continuation');
  await page.getByRole('button', { name: 'Reset scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Run timer', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('.ribbon-number').textContent) < 30);
  const before = Number(await page.locator('.ribbon-number').textContent());
  await page.getByRole('button', { name: 'Remount prompt · retain time' }).click();
  expect(Number(await page.locator('.ribbon-number').textContent()) <= before, 'Running countdown does not reset on remount');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Replay preview · hide decisions').check();
  expect(await page.locator('.decision-position').count() === 0 && await page.locator('.match-die').count() === 2, 'Replay preview hides decisions and retains dice');
  await capture('replay');
  await page.getByLabel('Replay preview · hide decisions').uncheck();
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('preferences');
  await page.getByRole('button', { name: 'Do not use for this action', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click(); await page.locator('.outcome').waitFor();
  expect((await page.locator('.outcome').textContent()).includes('preference selected'), 'Never-use preference remains an explicit separate choice');
  for (const [name, width, height] of [['portrait',390,844], ['landscape',844,390]]) {
    await page.setViewportSize({ width, height });
    for (const variant of ['A', 'B', 'C']) {
      await page.locator(`[data-variant-choice="${variant}"]`).click();
      for (const scenario of ['wrestle', 'pickup', 'pass', 'catch', 'dodge', 'dodgeSpent', 'block', 'long', 'preferences']) {
        await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption(scenario);
        await clearPlacement(`${name} ${variant} ${scenario}`);
        await capture(`${variant}-${name}-${scenario}`);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal page overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('wrestle');
  await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('top-down');
  await page.getByRole('combobox', { name: 'View from', exact: true }).selectOption('away');
  await page.getByRole('combobox', { name: 'Surface contrast', exact: true }).selectOption('contrast');
  await clearPlacement('Top-down away-end contrast'); await capture('top-down-away-contrast');
  await page.locator('[data-variant-choice="A"]').click();
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  expect(await page.locator('main').getAttribute('data-variant') === 'A', 'Arrow keys in a select do not change mockup');
  await page.locator('h1').click(); await page.keyboard.press('ArrowRight');
  expect(new URL(page.url()).searchParams.get('variant') === 'B', 'Arrow keys switch mockup and update URL');
  await page.reload({ waitUntil: 'networkidle' }); await ready();
  expect(await page.locator('main').getAttribute('data-variant') === 'B', 'Style URL survives reload');
  expect(!errors.length, `No browser, font, image or HTTP errors: ${JSON.stringify(errors)}`);
  await writeFile(`${output}checks.json`, JSON.stringify({ scope: 'Local visual prototype only; no real server/live/replay/recovery assertions', checks, errors }, null, 2));
  console.log(JSON.stringify({ output, checks: checks.length, errors }, null, 2));
} finally { await browser.close(); }
