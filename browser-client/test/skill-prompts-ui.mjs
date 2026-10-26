import assert from 'node:assert/strict';
import { setCameraAngle } from './camera-controls.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
base.players = base.players.map(player => ({ ...player, art: { rosterId: player.role === 'home' ? 'human' : 'orc',
  positionId: player.role === 'home' ? 'lineman' : 'orc-lineman' } }));
const home = base.players.find(player => player.role === 'home' && player.x !== null);
const away = base.players.find(player => player.role === 'away' && player.x !== null);
const action = (id, kind, label, actor = 'home', sourcePlayerId = home.id) => ({ id, kind, label, actor, sourcePlayerId, target: null });
const now = 1_800_000_000_000;
const initial = { ...base, callerRole: 'away', actor: 'home', activePlayerId: home.id,
  reaction: { id: 'orbit-live', actor: 'away', title: 'Use Wrestle?', expiresAt: now + 60_000, serverNow: now, allowanceMs: 60_000 },
  actions: [action('1:skill:true', 'skill', 'Use Wrestle', 'away', away.id), action('1:skill:false', 'skill', 'Decline skills', 'away', away.id)] };
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const output = fileURLToPath(new URL('../test-output/skill-prompts-live/', import.meta.url)); mkdirSync(output, { recursive: true });
const publish = async view => {
  await page.evaluate(view => { window.hudState = view; window.hudIntents = []; window.publishHud(view); }, view);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const sent = id => [{ operation: 'action', fields: { actionId: id } }];
async function assertClear() {
  const result = await page.evaluate(() => {
    const circle = document.querySelector('.skill-circle').getBoundingClientRect();
    const viewport = document.querySelector('.live-pitch-viewport').getBoundingClientRect();
    const owner = document.querySelector('.live-marker[data-player-id="' + window.hudState.actions[0].sourcePlayerId + '"]');
    const source = owner?.getBoundingClientRect();
    const art = owner?.querySelector(':scope > img')?.getBoundingClientRect();
    const overlaps = r => r && circle.left < r.right && circle.right > r.left && circle.top < r.bottom && circle.bottom > r.top;
    return { inside: circle.left >= Math.max(0, viewport.left) && circle.right <= Math.min(innerWidth, viewport.right)
      && circle.top >= Math.max(0, viewport.top) && circle.bottom <= Math.min(innerHeight, viewport.bottom), subject: Boolean(overlaps(source) || overlaps(art)), owner: !!owner,
      dice: [...document.querySelectorAll('.pitch-decision-overlay')].some(node => overlaps(node.getBoundingClientRect())) };
  });
  assert.deepEqual(result, { inside: true, subject: false, owner: true, dice: false });
}
async function assertAnswersInsideRibbon() {
  const result = await page.locator('.skill-circle').evaluate(circle => {
    const bounds = circle.getBoundingClientRect(), centerX = bounds.left + bounds.width / 2, centerY = bounds.top + bounds.height / 2;
    const question = circle.querySelector('.skill-question').getBoundingClientRect();
    return [...circle.querySelectorAll('.skill-answer')].map(button => {
      const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
      const radius = Math.min(parseFloat(style.borderRadius), rect.width / 2, rect.height / 2);
      const outline = style.outlineStyle !== 'none' ? parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset) : 0;
      const extent = Math.hypot(Math.abs(rect.x + rect.width / 2 - centerX) + rect.width / 2 - radius,
        Math.abs(rect.y + rect.height / 2 - centerY) + rect.height / 2 - radius) + radius + outline;
      return { shadow: style.boxShadow, clear: extent < bounds.width * .395, compact: rect.height < 30 && rect.height >= 23,
        textClear: rect.bottom + 2 <= question.top || rect.top - 2 >= question.bottom };
    });
  });
  const dividers = await page.locator('.skill-circle').evaluate(circle => {
    const question = circle.querySelector('.skill-question').getBoundingClientRect();
    const answers = [...circle.querySelectorAll('.skill-answer')].map(button => {
      const r = button.getBoundingClientRect();
      return { top: r.top - 3, bottom: r.bottom + 3 };
    });
    return [...circle.querySelectorAll('.skill-divider')].map(line => {
      const r = line.getBoundingClientRect();
      return r.width > 20 && r.height === 1 && getComputedStyle(line).visibility === 'visible'
        && (r.bottom <= question.top || r.top >= question.bottom)
        && answers.every(a => r.bottom <= a.top || r.top >= a.bottom);
    });
  });
  assert.deepEqual(dividers, [true, true], 'Both divider lines remain visible between text and focused answers');
  assert.ok([129, 147].includes(await page.locator('.skill-circle').evaluate(el => el.getBoundingClientRect().width)), 'Circle retains the 25% smaller desktop/narrow diameter');
  assert.ok(result.length > 0);
  for (const button of result) assert.deepEqual(button, { shadow: 'none', clear: true, compact: true, textClear: true }, 'Painted answer and keyboard focus fit inside the timer ribbon without covering the question');
}
try {
  await page.clock.install({ time: now });
  await page.addInitScript(state => { window.hudState = state; window.hudIntents = []; window.hudMessages = []; }, initial);
  await page.route('**/skill-prompts-test', route => route.fulfill({ contentType: 'text/html', body:
    '<meta name="viewport" content="width=device-width,initial-scale=1"><body class="game-match"><div id="game-root"><main id="app" class="play-runtime live-match-page"></main></div><script type="module" src="/test/coach-hud-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/skill-prompts-test`);
  await page.addStyleTag({ content: readFileSync(new URL('../../site/src/assets/play.css', import.meta.url), 'utf8') });
  const circle = page.locator('.circular-skill-prompt'); await circle.waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await circle.getByRole('heading').textContent(), 'Use Wrestle?');
  assert.equal(await page.locator('.skill-circle').evaluate(el => el.getBoundingClientRect().width), 147);
  assert.equal(await circle.locator('.skill-ribbon-progress').evaluate(element => getComputedStyle(element).stroke), 'rgb(69, 231, 255)', 'Circular prompt retains the original Orbit cyan palette');
  const yes = circle.locator('.skill-answer.yes'), no = circle.locator('.skill-answer.no');
  const decoration = button => button.evaluate(el => {
    const s = getComputedStyle(el); return { background: s.backgroundColor, color: s.color, border: s.borderTopColor,
      outline: s.outlineStyle, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
  });
  assert.equal(await yes.evaluate(el => el === document.activeElement), true, 'Initial keyboard access is retained');
  assert.equal((await decoration(yes)).outline, 'none', 'Keyboard focus does not paint an answer outline');
  assert.equal(await no.getAttribute('aria-description'), 'Selected automatically if the timer expires');
  assert.equal((await decoration(no)).outlineColor, 'rgb(246, 238, 213)');
  assert.equal((await decoration(no)).outlineWidth, '2px');
  await no.focus();
  assert.equal((await decoration(yes)).outline, 'none');
  assert.equal((await decoration(no)).outlineWidth, '2px', 'Timeout marker stays on No during keyboard navigation');
  for (const button of [yes, no]) {
    await button.evaluate(el => el.blur()); await page.mouse.move(0, 0);
    const before = await decoration(button);
    await button.hover();
    const after = await decoration(button);
    assert.notEqual(after.background, before.background, 'Hover changes the answer background');
    assert.deepEqual({ ...after, background: before.background }, before, 'Hover changes no border, text color or outline');
  }
  await page.mouse.move(0, 0); await yes.focus();
  await assertAnswersInsideRibbon();
  await assertClear();
  const pointer = await page.locator('.skill-prompt-pointer circle').evaluate(element => ({ x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) }));
  const subject = await page.locator(`.live-marker[data-player-id="${away.id}"]`).evaluate(element => {
    const ground = element.getBoundingClientRect(), art = element.querySelector(':scope > img').getBoundingClientRect();
    return { left: Math.min(ground.left, art.left), right: Math.max(ground.right, art.right),
      top: Math.min(ground.top, art.top), bottom: Math.max(ground.bottom, art.bottom) };
  });
  assert.ok(pointer.x >= subject.left && pointer.x <= subject.right && pointer.y >= subject.top && pointer.y <= subject.bottom,
    'Pointer identifies the skill owner including painted sprite bounds, not the active attacker');
  await page.screenshot({ path: `${output}desktop.png` });
  await page.clock.fastForward(48_000);
  assert.ok(Number(await circle.locator('.skill-ribbon-number').textContent()) <= 12);
  assert.equal(await circle.locator('.skill-ribbon-progress').evaluate(element => getComputedStyle(element).stroke), 'rgb(255, 98, 107)');
  const remaining = Number(await circle.locator('.skill-ribbon-number').textContent());
  await publish({ ...initial, revision: initial.revision + 1 });
  assert.ok(Number(await circle.locator('.skill-ribbon-number').textContent()) <= remaining, 'New render cannot restart deadline');
  await page.clock.fastForward(70_000);
  assert.equal(await circle.locator('.skill-ribbon-number').textContent(), '0');
  assert.equal(await no.getAttribute('class'), 'skill-answer no skill-timeout-default', 'Marker remains on the server decline while awaiting expiry resolution');
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Expiry awaits server; it sends no client decline');
  await circle.getByRole('button', { name: 'Decline skills', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('1:skill:false'));
  assert.equal(await circle.getByRole('button', { name: 'Use Wrestle', exact: true }).isDisabled(), true);
  for (const [skill, suffix] of [['Pass', 'pass'], ['Catch', 'catch'], ['Sure Hands', 'pickup'], ['Dodge', 'dodge'], ['Sure Feet', 'rush']]) {
    const view = { ...base, revision: 20, callerRole: 'home', actions: [action(`20:reroll:${suffix}`, 'reroll', `Use ${skill}`),
      action('20:reroll:none', 'reroll', `Do not re-roll ${skill}`), action('20:reroll:team', 'reroll', 'Use team re-roll'), action('20:reroll:pro', 'reroll', 'Use Pro')] };
    await publish(view);
    assert.equal(await page.locator('.skill-source-chooser').count(), 0, `${skill} is offered first, including old combined checkpoints`);
    assert.equal(await circle.getByRole('timer').count(), 0, 'Untimed rolls have no invented timer');
    assert.equal(await circle.locator('.skill-timeout-default').count(), 0, 'Untimed prompts imply no automatic decision');
    await circle.getByRole('button', { name: `Use ${skill}`, exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(`20:reroll:${suffix}`));
  }
  const alternatives = { ...base, revision: 21, callerRole: 'home', actions: [action('21:reroll:none', 'reroll', 'Do not re-roll Dodge'),
    action('21:reroll:team', 'reroll', 'Use team re-roll'), action('21:reroll:pro', 'reroll', 'Use Pro')] };
  const modifiedPass = { ...base, revision: 21, callerRole: 'home', actions: [action('21:skill:false', 'skill', 'Decline skills'),
    action('21:skill:true', 'skill', 'Use Pass'), action('21:skill:modify', 'skill', 'Use Strong Passing Game')] };
  await publish(modifiedPass);
  assert.equal(await page.locator('.skill-source-chooser').count(), 0, 'Builtin is prompted first even when a modifier is offered');
  assert.equal(await circle.getByRole('button', { name: 'Use Pass', exact: true }).isVisible(), true);
  await circle.getByRole('button', { name: 'Other choices', exact: true }).click();
  await page.getByRole('group', { name: 'Available skill and reroll choices' }).getByRole('button', { name: 'Use Strong Passing Game' }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'A modifying skill is preserved and only staged');
  await assertAnswersInsideRibbon();
  await circle.getByRole('button', { name: 'Use Strong Passing Game', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('21:skill:modify'));
  await publish(alternatives);
  await page.mouse.move(0, 0);
  assert.equal(await circle.locator('.skill-timeout-default').count(), 0);
  assert.equal(await page.locator('.skill-source-chooser').evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(237, 182, 68)', 'Source picker retains the Crest gold edge');
  assert.equal(await page.locator('.skill-source-chooser button').first().evaluate(element => getComputedStyle(element).color), 'rgb(255, 225, 123)', 'Only the source picker uses the Crest gold accent');
  await page.getByRole('group', { name: 'Available skill and reroll choices' }).getByRole('button', { name: 'Use Pro', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Picking source only stages it');
  await circle.getByRole('button', { name: 'Back / change choice' }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Back sends no game action');
  await page.getByRole('group', { name: 'Available skill and reroll choices' }).getByRole('button', { name: 'Use team re-roll', exact: true }).click();
  await circle.getByRole('button', { name: 'Use team re-roll', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.hudIntents), sent('21:reroll:team'));
  for (const [name, width, height] of [['portrait',390,844], ['landscape',844,390]]) {
    await page.setViewportSize({ width, height }); await publish(initial); await assertClear();
    await assertAnswersInsideRibbon();
    const status = await circle.getByRole('status').boundingBox();
    assert.ok(status && status.y >= 0 && status.y + status.height <= height, 'Expired status remains visible in the viewport');
    await page.screenshot({ path: `${output}${name}.png` });
    await publish(alternatives);
    const picker = await page.locator('.skill-source-chooser').boundingBox();
    assert.ok(picker.x >= 0 && picker.x + picker.width <= width);
  }
  const receiver = { ...home, id: 'receiver', name: 'Cline', number: 12, x: home.x + 4, y: home.y + 2 };
  const catchNow = await page.evaluate(() => Date.now());
  const catchView = { ...base, callerRole: 'home', actor: 'home', activePlayerId: home.id,
    players: [...base.players, receiver], revision: 42,
    reaction: { id: 'catch-receiver', actor: 'home', title: 'Re-roll Catch?', detail: 'Cline. ', serverNow: catchNow, expiresAt: catchNow + 30_000 },
    actions: [action('42:reroll:team', 'reroll', 'Use team re-roll for Catch', 'home', receiver.id),
      action('42:reroll:none', 'reroll', 'Do not re-roll Catch', 'home', receiver.id)] };
  for (const [name, width, height] of [['desktop',1440,900], ['portrait',390,844], ['narrow',320,700]]) {
    await page.setViewportSize({ width, height }); await publish(catchView); await assertClear(); await assertAnswersInsideRibbon();
    const endpoint = await page.locator('.skill-prompt-pointer circle').evaluate(element => ({ x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) }));
    const target = await page.locator('.live-marker[data-player-id="receiver"]').boundingBox();
    assert.ok(endpoint.x >= target.x && endpoint.x <= target.x + target.width, 'Catch pointer identifies the receiver rather than the active thrower');
    assert.equal(await circle.locator('.skill-timeout-default').getAttribute('aria-label'), 'Do not re-roll Catch');
    const detail = await circle.locator('.sr-only').boundingBox();
    assert.ok(detail.width <= 1 && detail.height <= 1, 'Receiver name is accessible but has no visible text marker');
    await page.screenshot({ path: `${output}catch-receiver${name === 'desktop' ? '' : '-' + name}.png` });
  }
  let sidestepRevision = 50;
  for (const role of ['home', 'away']) for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const revision = sidestepRevision += 2;
    const owner = { ...(role === 'home' ? home : away), x: 12, y: 7 };
    const attacker = { ...home, id: 'sidestep-attacker', x: 11, y: 7 };
    const sideNow = await page.evaluate(() => Date.now());
    const destinations = [[owner.x, owner.y + 1], [owner.x, owner.y - 1], [owner.x + 1, owner.y + 1]];
    const sideActions = destinations.map(([x, y]) => ({ ...action(`${revision}:reaction-use:${x}:${y}`, 'reactiveSquare',
      `Use Sidestep at ${x}, ${y}`, role, owner.id), target: { x, y } }));
    const sideDecline = action(`${revision}:reaction-decline`, 'reactiveSkill', 'Decline', role, owner.id);
    const sideView = { ...base, players: [attacker, owner], callerRole: role, activePlayerId: attacker.id, revision,
      reaction: { id: `sidestep-${role}-${width}`, actor: role, title: 'Use Sidestep?', detail: 'Hobbo.',
        expiresAt: sideNow + 30_000, serverNow: sideNow, allowanceMs: 30_000 }, actions: [...sideActions, sideDecline] };
    await publish(sideView);
    await setCameraAngle(page, width < 600 ? 90 : 40);
    assert.equal(await circle.getByRole('heading').textContent(), 'Use Sidestep?');
    assert.equal(await page.locator('.match-decision-dialog').count(), 0);
    assert.equal(await page.locator('.live-sidestep-choice, .live-target-square').count(), 0, 'Sidestep waits for local Yes without square boxes');
    assert.equal(await circle.locator('.skill-timeout-default').getAttribute('aria-label'), 'Decline');
    await assertClear(); await assertAnswersInsideRibbon();
    const cameraSquare = await page.locator('[data-cell-x="12"][data-cell-y="7"]').getAttribute('points');
    const seconds = Number(await circle.locator('.skill-ribbon-number').textContent());
    await circle.getByRole('button', { name: 'Use Sidestep', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Yes stages destination selection without committing native skill use');
    assert.equal(await page.locator('[data-cell-x="12"][data-cell-y="7"]').getAttribute('points'), cameraSquare, 'Staging Sidestep does not pan or zoom the camera');
    assert.equal(await page.locator('.live-sidestep-choice').count(), 3);
    assert.equal(await page.locator('.live-target-square, .skill-source-chooser').count(), 0);
    assert.ok(Number(await circle.locator('.skill-ribbon-number').textContent()) <= seconds);
    await assertClear(); await assertAnswersInsideRibbon();
    const clearArrows = await page.evaluate(() => {
      const p = document.querySelector('.skill-circle').getBoundingClientRect();
      return [...document.querySelectorAll('.live-sidestep-choice')].every(el => {
        const r = el.getBoundingClientRect(); return p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom;
      });
    });
    assert.equal(clearArrows, true, 'Circular prompt leaves its destination arrows unobscured');
    await page.screenshot({ path: `${output}sidestep-${role}-${width}.png` });
    await circle.getByRole('button', { name: 'Back to Sidestep choice' }).click();
    assert.equal(await page.locator('.live-sidestep-choice').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Back is local and keeps the native optional decision open');
    await circle.getByRole('button', { name: 'Use Sidestep', exact: true }).click();
    await page.locator('.live-sidestep-choice').first().focus();
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(sideActions[0].id), 'Arrow submits one exact combined native use/destination action');
    assert.equal(await page.locator('.live-sidestep-choice').first().isDisabled(), true);
    await publish(sideView);
    await circle.getByRole('button', { name: 'Decline', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(sideDecline.id));
    await publish({ ...sideView, callerRole: 'spectator' });
    assert.equal(await page.locator('.circular-skill-prompt, .live-sidestep-choice').count(), 0);
    await publish(sideView);
    assert.equal(await page.locator('.live-sidestep-choice').count(), 0, 'Remount resumes the uncommitted choice');
    assert.ok(Number(await circle.locator('.skill-ribbon-number').textContent()) <= seconds, 'Remount preserves the original deadline');
    await circle.getByRole('button', { name: 'Use Sidestep', exact: true }).click();
    await page.clock.fastForward(31_000);
    assert.equal(await circle.locator('.skill-ribbon-number').textContent(), '0');
    assert.deepEqual(await page.evaluate(() => window.hudIntents), [], 'Staged Sidestep expiry awaits the server decline');
    const committed = { ...sideView, revision: revision + 1, reaction: { ...sideView.reaction, title: 'Choose a Sidestep destination' },
      actions: sideActions.map(a => ({ ...a, kind: 'push', id: `${revision + 1}:push:${owner.id}:${a.target.x}:${a.target.y}`, label: `Push to ${a.target.x}, ${a.target.y}` })) };
    await publish(committed);
    assert.equal(await circle.locator('.skill-answer, .skill-timeout-default').count(), 0, 'Recovered committed Sidestep cannot be declined');
    assert.equal(await page.locator('.live-sidestep-choice').count(), 3);
    const geometry = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight],
      pitch: document.querySelector('.live-pitch-viewport').getBoundingClientRect().toJSON(),
      arrows: [...document.querySelectorAll('.live-sidestep-choice')].map(el => el.getBoundingClientRect().toJSON()) }));
    assert.ok(geometry.arrows.every(r => r.width > 1 && r.height > 1 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height), JSON.stringify(geometry));
    await page.locator('.live-sidestep-choice').last().click();
    assert.deepEqual(await page.evaluate(() => window.hudIntents), sent(committed.actions.at(-1).id));
  }
  await publish({ ...base, callerRole: 'home', actions: [action('30:block-reroll:team', 'reroll', 'Use team re-roll'),
    action('30:block-reroll:none', 'reroll', 'Keep original block dice')] });
  assert.equal(await circle.count(), 0, 'Block reroll controls retain legacy overlay');
  assert.equal(await page.locator('.pitch-decision-overlay[role=dialog]').count(), 1);
  await publish({ ...initial, callerRole: 'spectator' });
  assert.equal(await circle.count(), 0, 'Observers do not receive actionable circles');
  const pickup = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8')).find(j => j.count === 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(view => { window.diceInput = { view }; window.diceActions = []; }, pickup.offered);
  await page.route('**/prompt-dice-test', route => route.fulfill({ contentType: 'text/html', body:
    '<meta name="viewport" content="width=device-width,initial-scale=1"><main id="app" class="play-runtime live-match-page"></main><script type="module" src="/test/dice-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/prompt-dice-test`);
  await page.locator('.skill-circle').waitFor();
  await page.evaluate(input => window.publishDice(input), { view: pickup.offered, report: pickup.reports[0] });
  await page.waitForFunction(() => {
    const prompt = document.querySelector('.skill-circle')?.getBoundingClientRect();
    const dice = document.querySelector('.pitch-decision-overlay')?.getBoundingClientRect();
    const pitch = document.querySelector('.live-pitch-viewport')?.getBoundingClientRect();
    if (!prompt || !dice || !pitch) return false;
    const middle = (Math.max(0, pitch.left) + Math.min(innerWidth, pitch.right)) / 2;
    return (prompt.x + prompt.width / 2 < middle) === (dice.x + dice.width / 2 < middle)
      && (prompt.right < dice.left || prompt.left > dice.right || prompt.bottom < dice.top || prompt.top > dice.bottom);
  });
  assert.equal(await page.locator('.pitch-decision-overlay .match-die').getAttribute('data-face'), '1');
  await assertAnswersInsideRibbon();
  await page.screenshot({ path: `${output}dice-affinity.png` });
  assert.deepEqual(errors, []);
  console.log('PASS circular skill prompts: native owner, timer/default answer, Sidestep activation/arrows/Back/decline/committed recovery, source choices, pending commands, desktop/phone, block exclusion and observers');
} finally { await browser.close(); await server.close(); }
