// Production presentation acceptance helpers for an already-authenticated,
// suspended /play/match from the isolated real-server acceptance run.
// Native zoom uses Chrome's tabs.setZoom API (https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom)
// through a temporary MV3 extension in a persistent Playwright context
// (https://playwright.dev/docs/chrome-extensions).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const coachSizes = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 900 },
  { width: 1920, height: 820 },
  { width: 1280, height: 660 },
];
const roleNames = ['home', 'away'];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pitch = page => page.getByLabel('Live match pitch');
const scene = page => page.locator('.live-pitch-scene');
const safeFilename = value => String(value).replace(/[^a-z0-9-]+/gi, '-');

async function requireSuspended(page) {
  await pitch(page).waitFor();
  const menu = page.getByRole('button', { name: /^Game Menu/ });
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Game Menu' });
  await dialog.getByText('This match is paused.', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Close Game Menu' }).click();
}

async function frameIntervals(page, count = 60) {
  return page.evaluate(async count => {
    const samples = [];
    let previous = null;
    for (let i = 0; i <= count; i += 1) {
      const frame = await new Promise(requestAnimationFrame);
      if (previous !== null) samples.push(frame - previous);
      previous = frame;
    }
    return {
      userAgent: navigator.userAgent,
      browserFamily: /Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : 'Other Chromium-based browser',
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: navigator.deviceMemory ?? null,
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visibilityState: document.visibilityState,
      intervalsMs: samples,
      meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p95Ms: samples.slice().sort((a, b) => a - b)[Math.floor(samples.length * .95)],
    };
  }, count);
}

async function measureBoundedPan(page) {
  const before = await page.evaluate(() => ({
    heapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    focus: Number(document.querySelector('.live-pitch-scene')?.getAttribute('data-focus')),
  }));
  await page.evaluate(() => {
    const viewport = document.querySelector('.live-pitch-viewport');
    const target = document.querySelector('.live-pitch-scene');
    if (!viewport || !target) throw Error('Presentation camera is unavailable');
    window.__presentationPan = { latencyMs: null, startFocus: target.getAttribute('data-focus') };
    viewport.addEventListener('pointerdown', () => {
      const started = performance.now();
      const observer = new MutationObserver(() => {
        if (target.getAttribute('data-focus') !== window.__presentationPan.startFocus) {
          window.__presentationPan.latencyMs = performance.now() - started;
          observer.disconnect();
        }
      });
      observer.observe(target, { attributes: true, attributeFilter: ['data-focus'] });
    }, { once: true, capture: true });
  });
  const box = await page.locator('.live-pitch-viewport').boundingBox();
  assert.ok(box && box.width > 80 && box.height > 80, 'Pitch viewport must be usable for camera input');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 32, y + 20, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__presentationPan?.latencyMs !== null, null, { timeout: 5000 });
  const latencyMs = await page.evaluate(() => window.__presentationPan.latencyMs);
  const after = await page.evaluate(() => ({ heapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    focus: Number(document.querySelector('.live-pitch-scene')?.getAttribute('data-focus')) }));
  assert.notEqual(after.focus, before.focus, 'Bounded pointer pan must move the camera');
  await page.getByRole('button', { name: 'Midfield', exact: true }).click();
  return { beforeHeapBytes: before.heapUsedBytes, afterHeapBytes: after.heapUsedBytes,
    beforeFocus: before.focus, afterFocus: after.focus, inputToCameraMs: latencyMs };
}

async function revealCameraControls(page) {
  const debug = page.getByRole('button', { name: 'Debug', exact: true });
  if (await debug.count() && await debug.getAttribute('aria-expanded') === 'false') await debug.click();
}

async function verifyCommonHud(page) {
  await revealCameraControls(page);
  await page.getByLabel('Match scoreboard').waitFor();
  await page.locator('.live-chess-clock').first().waitFor();
  await page.getByLabel('Team dugouts').waitFor();
  await page.getByLabel('Match history').waitFor();
  await page.getByLabel('Chat', { exact: true }).waitFor();
  await page.getByLabel('Game log', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Game Menu' }).waitFor();
  const actions = await page.getByRole('group', { name: 'Player actions' }).count() > 0;
  const decisionDialogCount = await page.locator('.match-decision-dialog, .pitch-decision-overlay').count();
  return { scoreboard: true, clock: true, dugouts: true, chat: true, log: true,
    menu: true, actions, visibleDecisionDialogCount: decisionDialogCount };
}

/**
 * Capture production home/away coach views at declared desktop and compact viewports.
 * `pages` order is [home coach, away coach, spectator], all already authenticated and
 * on the same native match. The helper only reads match UI and performs camera changes.
 */
export async function capturePresentation(pages, output) {
  assert.equal(pages?.length, 3, 'Pass the already-authenticated home, away, and spectator pages');
  const evidenceDir = resolve(output);
  await mkdir(evidenceDir, { recursive: true });
  const evidence = { kind: 'real-server-presentation', protocol: '/browser/v2',
    sampledAt: new Date().toISOString(), suspended: true, views: [], pan: null, fallback: null };
  try {
    for (const [index, page] of pages.entries()) {
      const url = new URL(page.url());
      assert.equal(url.pathname, '/play/match', 'Presentation pages must be the production match route');
      await page.bringToFront();
      await pitch(page).waitFor();
      await requireSuspended(page);
      if (index < 2) {
        const end = await scene(page).getAttribute('data-end');
        assert.equal(end, roleNames[index], `Coach page ${roleNames[index]} must retain its own end perspective`);
      }
    }
    const initialPlayerIds = await Promise.all(pages.map(page => page.locator('.live-marker[data-player-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-player-id')).sort())));
    assert.deepEqual(initialPlayerIds[0], initialPlayerIds[1], 'Both coach ends must render the same canonical player IDs');
    assert.deepEqual(initialPlayerIds[0], initialPlayerIds[2], 'Spectator and coach pages must render the same canonical player IDs');

    const hud = await verifyCommonHud(pages[0]);
    await verifyCommonHud(pages[1]);
    await verifyCommonHud(pages[2]);
    const representativeAgent = pages[0];

    for (const [index, page] of pages.slice(0, 2).entries()) {
      const role = roleNames[index];
      for (const viewport of coachSizes) {
        await page.setViewportSize(viewport);
        await page.bringToFront();
        await pitch(page).waitFor();
        await page.waitForFunction(() => document.visibilityState === 'visible');
        const dimensions = await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
          focus: Number(document.querySelector('.live-pitch-scene')?.getAttribute('data-focus')),
          transverseFocus: Number(document.querySelector('.live-pitch-scene')?.getAttribute('data-transverse-focus')),
          playerIds: [...document.querySelectorAll('.live-marker[data-player-id]')].map(node => node.getAttribute('data-player-id')).sort(),
        }));
        assert.ok(dimensions.document.width <= viewport.width + 1 && dimensions.body.width <= viewport.width + 1,
          `${role} ${viewport.width}x${viewport.height} must not overflow horizontally`);
        assert.ok(dimensions.document.height <= viewport.height + 1 && dimensions.body.height <= viewport.height + 1,
          `${role} ${viewport.width}x${viewport.height} must not overflow vertically`);
        const machine = await frameIntervals(page);
        assert.ok(!/HeadlessChrome/i.test(machine.userAgent), 'Presentation evidence must come from a foreground browser, not headless Chromium');
        assert.equal(machine.visibilityState, 'visible');

        const baseName = `${role}-${viewport.width}x${viewport.height}`;
        const initialMode = await scene(page).getAttribute('data-projection');
        const initialFocus = Number(await scene(page).getAttribute('data-focus'));
        const idsBefore = await page.locator('.live-marker[data-player-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-player-id')).sort());
        const toggle = page.getByRole('button', { name: initialMode === 'perspective' ? 'Top-down view' : 'Perspective view' });
        await toggle.click();
        const switchedMode = initialMode === 'perspective' ? 'top-down' : 'perspective';
        await page.waitForFunction(mode => document.querySelector('.live-pitch-scene')?.getAttribute('data-projection') === mode, switchedMode);
        assert.equal(Number(await scene(page).getAttribute('data-focus')), initialFocus, 'Camera mode switch must preserve focus');
        const idsAfter = await page.locator('.live-marker[data-player-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-player-id')).sort());
        assert.deepEqual(idsAfter, idsBefore, 'Camera mode switch must preserve player identity');
        await page.screenshot({ path: join(evidenceDir, `${baseName}-${switchedMode}.png`), fullPage: false });
        await page.getByRole('button', { name: switchedMode === 'top-down' ? 'Perspective view' : 'Top-down view' }).click();
        await page.waitForFunction(mode => document.querySelector('.live-pitch-scene')?.getAttribute('data-projection') === mode, initialMode);
        await page.screenshot({ path: join(evidenceDir, `${baseName}-${initialMode}.png`), fullPage: false });

        const liveViewport = page.locator('.live-pitch-viewport');
        await liveViewport.focus();
        await liveViewport.press('ArrowRight');
        await page.locator('.live-keyboard-square').waitFor();
        const announcement = await page.locator('output[aria-live="polite"]').textContent();
        assert.match(announcement ?? '', /Square/);
        const cameraButtons = page.getByLabel('Pitch camera controls');
        await cameraButtons.getByRole('button', { name: 'Reveal ball / active' }).waitFor();
        evidence.views.push({ role, viewport, cameraEnd: await scene(page).getAttribute('data-end'),
          initialMode, preservedFocus: true, canonicalPlayerIds: idsBefore.length,
          noOverflow: true, keyboardNavigation: true, hud, machine });
      }
    }
    await representativeAgent.setViewportSize({ width: 1280, height: 660 });
    await representativeAgent.bringToFront();
    evidence.pan = await measureBoundedPan(representativeAgent);

    const fallbackPage = pages[0];
    await fallbackPage.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await fallbackPage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await fallbackPage.route('**/assets/game/teams/**', route => route.abort());
    const session = await fallbackPage.context().newCDPSession(fallbackPage);
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await fallbackPage.reload();
    await pitch(fallbackPage).waitFor();
    await fallbackPage.waitForFunction(() => document.querySelector('.live-marker .live-token') !== null, null, { timeout: 15000 });
    const marker = fallbackPage.locator('.live-marker:visible').first();
    await marker.focus();
    await fallbackPage.getByRole('tooltip', { name: /player card$/ }).waitFor();
    await revealCameraControls(fallbackPage);
    await fallbackPage.getByLabel('Pitch camera controls').getByRole('button', { name: 'Top-down view' }).click();
    await fallbackPage.locator('.live-pitch-scene[data-projection="top-down"]').waitFor();
    evidence.fallback = { reducedMotion: true, textPlayerFallback: true, hoverCardReachable: true, cameraReachable: true };
    await fallbackPage.screenshot({ path: join(evidenceDir, 'reduced-motion-blocked-art-fallback.png'), fullPage: false });

    evidence.passed = true;
    await writeFile(join(evidenceDir, 'presentation.json'), JSON.stringify(evidence, null, 2));
    return evidence;
  } catch (failure) {
    evidence.passed = false;
    evidence.failure = failure instanceof Error ? failure.message : 'Presentation capture failed';
    await writeFile(join(evidenceDir, 'presentation-failure.json'), JSON.stringify(evidence, null, 2));
    throw failure;
  }
}

function zoomExtensionSource(extensionDir) {
  return Promise.all([
    writeFile(join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'Acceptance native zoom controller', version: '1.0.0',
      permissions: ['tabs'], host_permissions: ['http://localhost:5000/*'], background: { service_worker: 'service-worker.js' },
    }, null, 2)),
    writeFile(join(extensionDir, 'service-worker.js'), "chrome.runtime.onInstalled.addListener(() => {});\n"),
  ]);
}

async function clearFirebaseSession(page) {
  await page.evaluate(async () => {
    try {
      const { authentication } = await import('/assets/auth-client.js');
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signOut(authentication().auth);
    } catch { /* Cleanup must not expose provider details. */ }
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* Best-effort per-origin cleanup. */ }
    await new Promise(resolveDb => {
      try { const request = indexedDB.deleteDatabase('firebaseLocalStorageDb'); request.onsuccess = request.onerror = request.onblocked = resolveDb; }
      catch { resolveDb(); }
    });
  }).catch(() => {});
}

/**
 * Launches only an isolated bundled Chromium profile, signs in the supplied fresh Firebase custom token,
 * and applies real per-tab browser zoom at 100% and 200%. This never substitutes the match transport.
 */
export async function captureNativeZoom({ origin, matchId, token, output, completed = false }) {
  assert.ok(origin && matchId && token && output, 'origin, matchId, custom token, and output are required');
  const evidenceDir = resolve(output);
  await mkdir(evidenceDir, { recursive: true });
  const extensionDir = join(evidenceDir, `zoom-extension-${process.pid}-${randomUUID()}`);
  await mkdir(extensionDir, { recursive: true });
  await zoomExtensionSource(extensionDir);
  const browserExecutable = process.env.COACH_ACCEPTANCE_CHROMIUM ??
    join(repositoryRoot, '.tools', 'coach-oriented-match-ui', 'playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
  const profilePrefix = 'coach-presentation-native-zoom-';
  const userDataDir = await mkdtemp(join(tmpdir(), profilePrefix));
  let context;
  const evidence = { kind: 'real-server-native-browser-zoom', protocol: '/browser/v2',
    browserExecutable: basename(browserExecutable), measurements: [] };
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: browserExecutable, headless: false, viewport: null,
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--window-size=1300,800', '--no-first-run', '--no-default-browser-check'],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
    assert.match(worker.url(), /^chrome-extension:\/\//, 'The dedicated MV3 zoom extension must be loaded');
    const page = context.pages()[0] ?? await context.newPage();
    await page.bringToFront();
    // Resize the real browser window, without device-metrics emulation layered
    // over tabs.setZoom. Native zoom must control the layout and paint together.
    const windowSession = await context.newCDPSession(page);
    const nativeWindow = await windowSession.send('Browser.getWindowForTarget');
    const initialSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await windowSession.send('Browser.setWindowBounds', { windowId: nativeWindow.windowId, bounds: {
      width: nativeWindow.bounds.width + 1280 - initialSize.width,
      height: nativeWindow.bounds.height + 660 - initialSize.height, windowState: 'normal',
    } });
    await page.waitForFunction(() => innerWidth === 1280 && innerHeight === 660);
    await page.goto(new URL('/login', origin).toString());
    await page.evaluate(async customToken => {
      const { authentication } = await import('/assets/auth-client.js');
      const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signInWithCustomToken(authentication().auth, typeof customToken === 'string' ? customToken : customToken.token);
    }, token);
    await page.goto(new URL(`/play/match?matchId=${encodeURIComponent(matchId)}`, origin).toString());
    await pitch(page).waitFor();
    if (completed) await page.getByRole('link', { name: 'Open final result and replay', exact: true }).waitFor();
    else await requireSuspended(page);
    await page.route('**/assets/game/teams/**', route => route.abort());
    const network = await context.newCDPSession(page);
    await network.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.reload();
    await pitch(page).waitFor();
    if (!completed) await page.waitForFunction(() => document.querySelector('.live-marker .live-token') !== null, null, { timeout: 15000 });

    const setZoom = async factor => {
      await page.bringToFront();
      const applied = await worker.evaluate(async factor => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id || !tab.url?.startsWith('http://localhost:5000/')) throw Error('Acceptance tab is not active');
        await chrome.tabs.setZoom(tab.id, factor);
        return chrome.tabs.getZoom(tab.id);
      }, factor);
      assert.equal(applied, factor, `Native browser zoom must be ${factor * 100}%`);
      await page.waitForFunction(factor => Math.abs(window.devicePixelRatio / factor - window.__presentationBaseDpr) < .2, factor);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      return page.evaluate(() => ({
        browser: navigator.userAgent,
        dpr: devicePixelRatio,
        innerWidth,
        innerHeight,
        visualViewportWidth: visualViewport?.width ?? null,
        visualViewportHeight: visualViewport?.height ?? null,
        visualViewportScale: visualViewport?.scale ?? null,
        cameraReachable: !!document.querySelector('[aria-label="Pitch camera controls"] button'),
        playerFallbackCount: document.querySelectorAll('.live-marker .live-token').length,
      }));
    };
    const base = await page.evaluate(() => { window.__presentationBaseDpr = devicePixelRatio; return devicePixelRatio; });
    assert.ok(base > 0);
    const nativeScreenshot = async name => {
      // Capture the real window's content without Playwright's CSS clip, which
      // shrinks the exported image again when per-tab zoom changes native DPR.
      const { data } = await network.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
      const pixels = Buffer.from(data, 'base64');
      const size = { width: pixels.readUInt32BE(16), height: pixels.readUInt32BE(20) };
      await writeFile(join(evidenceDir, name), pixels);
      return size;
    };
    const at100 = await setZoom(1);
    assert.equal(at100.visualViewportScale, 1, 'Browser zoom must not masquerade as pinch zoom');
    await assertNativeControls(page, !completed);
    await page.evaluate(async () => { await document.fonts.ready; for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame); });
    const pixels100 = await nativeScreenshot('native-zoom-100.png');
    const at200 = await setZoom(2);
    assert.equal(at200.visualViewportScale, 1, 'visualViewport.scale remains pinch-zoom only');
    assert.ok(Math.abs(at200.dpr / at100.dpr - 2) < .2, 'Native 200% zoom must double CSS devicePixelRatio');
    assert.ok(Math.abs(at200.innerWidth / at100.innerWidth - .5) < .08, 'Native 200% zoom must halve the CSS layout viewport width');
    if (!completed) assert.ok(at200.playerFallbackCount > 0, 'Blocked body artwork leaves readable player labels');
    await assertNativeControls(page, !completed);
    await page.evaluate(async () => { await document.fonts.ready; for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame); });
    const pixels200 = await nativeScreenshot('native-zoom-200.png');
    assert.deepEqual(pixels200, pixels100, 'Native zoom captures the same physical window at both zoom levels');
    const layout = await page.evaluate(() => ({ viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight,
      scrollY, camera: document.querySelector('[aria-label="Pitch camera controls"]')?.getBoundingClientRect().toJSON() }));
    assert.ok(layout.documentHeight <= layout.viewportHeight + 1, 'Native browser zoom must keep the match inside the viewport');
    const restored = await setZoom(1);
    assert.equal(restored.dpr, at100.dpr, 'Native browser zoom can restore the original 100% size');
    assert.equal(restored.innerWidth, at100.innerWidth);
    evidence.browserFamily = 'Bundled Chromium';
    evidence.measurements = [{ zoom: 1, ...at100, pixels: pixels100 }, { zoom: 2, ...at200, pixels: pixels200 }, { zoom: 1, ...restored, restored: true }];
    evidence.passed = true;
    await writeFile(join(evidenceDir, 'native-zoom.json'), JSON.stringify(evidence, null, 2));
    return evidence;
  } catch (failure) {
    evidence.passed = false;
    evidence.failure = failure instanceof Error ? failure.message : 'Native zoom acceptance failed';
    await writeFile(join(evidenceDir, 'native-zoom-failure.json'), JSON.stringify(evidence, null, 2));
    throw failure;
  } finally {
    const page = context?.pages()[0];
    if (page) await clearFirebaseSession(page);
    if (context) {
      await context.clearCookies().catch(() => {});
      await context.close().catch(() => {});
    }
    const resolvedProfile = resolve(userDataDir), resolvedTemp = resolve(tmpdir());
    if (dirname(resolvedProfile) === resolvedTemp && basename(resolvedProfile).startsWith(profilePrefix)) {
      await rm(resolvedProfile, { recursive: true, force: true });
    }
    if (dirname(resolve(extensionDir)) === resolve(evidenceDir) && basename(extensionDir).startsWith('zoom-extension-')) {
      await rm(extensionDir, { recursive: true, force: true });
    }
  }
}

async function assertNativeControls(page, inspectPlayer = true) {
  await revealCameraControls(page);
  const camera = page.getByLabel('Pitch camera controls');
  await camera.getByRole('button', { name: 'Top-down view' }).click();
  await page.locator('.live-pitch-scene[data-projection="top-down"]').waitFor();
  await camera.getByRole('button', { name: 'Perspective view' }).click();
  await page.locator('.live-pitch-scene[data-projection="perspective"]').waitFor();
  if (inspectPlayer) {
    const marker = page.locator('.live-marker:visible').first();
    await marker.focus();
    await page.getByRole('tooltip', { name: /player card$/ }).waitFor();
  }
}

/** A second installed browser subscribes to the same real suspended match. */
export async function captureEdgeSmoke({ origin, matchId, token, output }) {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/login', origin).toString());
    await page.evaluate(async token => {
      const { authentication } = await import('/assets/auth-client.js');
      const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signInWithCustomToken(authentication().auth, token.token ?? token);
    }, token);
    await page.goto(new URL(`/play/match?matchId=${matchId}`, origin).toString());
    await page.bringToFront(); await requireSuspended(page);
    assert.equal(await scene(page).getAttribute('data-end'), 'home');
    assert.equal(await scene(page).locator('polygon[data-cell-x]').count(), 390);
    await assertNativeControls(page);
    assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, 'edge-suspended-match.png') });
    const evidence = { passed: true, browser: browser.version(), channel: 'msedge', protocol: '/browser/v2',
      matchId, viewport: page.viewportSize(), perspectives: ['perspective', 'top-down'], canonicalCells: 390,
      authenticated: true, nativeSuspendedSnapshot: true, playerInspector: true, runtimeErrors: errors };
    await writeFile(join(output, 'edge.json'), JSON.stringify(evidence, null, 2));
    return evidence;
  } finally { await browser.close(); }
}
