import { PitchProjection } from '../src/pitch-projection.ts';

export async function travelToFocus(page, focus) {
  const scene = page.locator('.live-pitch-scene').first();
  const frame = page.locator('.live-pitch-viewport').first();
  for (let attempt = 0; attempt < 30; attempt++) {
    const options = await scene.evaluate(element => ({ width: parseFloat(element.style.width), height: parseFloat(element.style.height),
      focus: Number(element.dataset.focus), transverseFocus: Number(element.dataset.transverseFocus),
      mode: element.dataset.projection, end: element.dataset.end, zoom: Number(element.dataset.zoom),
      perspectiveElevation: element.dataset.projection === 'perspective' ? Number(element.dataset.elevation) : 40 }));
    if (Math.abs(options.focus - focus) < .05) return;
    const camera = new PitchProjection(options);
    const requestedDelta = Math.max(-180, Math.min(180, (focus - camera.focus) * camera.scale
      * Math.sin(camera.elevation * Math.PI / 180) * (camera.end === 'home' ? 1 : -1)));
    const delta = Math.sign(requestedDelta) * Math.max(8, Math.abs(requestedDelta));
    const box = await frame.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x, y + delta, { steps: 3 });
    await page.mouse.up({ button: 'right' });
  }
  throw Error(`Could not travel camera to focus ${focus}`);
}

/** Exercise camera travel, then address the requested canonical cell. */
export async function squarePosition(page, x, y) {
  const scene = page.locator('.live-pitch-scene').first();
  const viewport = page.locator('.live-pitch-viewport').first();
  const readOptions = () => scene.evaluate(element => ({ width: parseFloat(element.style.width), height: parseFloat(element.style.height),
    focus: Number(element.dataset.focus), transverseFocus: Number(element.dataset.transverseFocus),
    mode: element.dataset.projection, end: element.dataset.end, zoom: Number(element.dataset.zoom),
    perspectiveElevation: element.dataset.projection === 'perspective' ? Number(element.dataset.elevation) : 40 }));
  let options = await readOptions();
  let camera = new PitchProjection(options);
  const point = { x: x + .5, y: y + .5 };
  // Overlay HUDs reserve top/bottom space; exercise camera travel to expose
  // the intended ground cell with the same right-button drag as a coach.
  for (let attempt = 0; attempt < 12; attempt++) {
    const screen = camera.project(point);
    if (screen && camera.isVisible(point, 20) && screen.y >= options.height * .27 && screen.y <= options.height * .7) break;
    if (!screen) throw Error(`Square ${x},${y} cannot be projected`);
    await viewport.scrollIntoViewIfNeeded();
    const bounds = await viewport.boundingBox();
    if (!bounds) throw Error('Pitch viewport is unavailable');
    const delta = { x: options.zoom > 1 ? Math.max(-options.width * .3, Math.min(options.width * .3, options.width * .5 - screen.x)) : 0,
      y: Math.max(-options.height * .3, Math.min(options.height * .3, options.height * .48 - screen.y)) };
    const expected = camera.panPixels(delta);
    if (Math.abs(expected.focus - options.focus) < 1e-6 && Math.abs(expected.transverseFocus - options.transverseFocus) < 1e-6)
      throw Error(`Camera cannot reveal square ${x},${y}`);
    const visible = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const left = Math.max(0, bounds.x), right = Math.min(visible.width, bounds.x + bounds.width);
    const top = Math.max(0, bounds.y), bottom = Math.min(visible.height, bounds.y + bounds.height);
    if (right <= left || bottom <= top) throw Error('Pitch viewport is outside the visible page');
    const start = { x: (left + right) / 2, y: (top + bottom) / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(start.x + delta.x * bounds.width / options.width,
      start.y + delta.y * bounds.height / options.height, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(previous => {
      const current = document.querySelector('.live-pitch-scene');
      return Math.abs(Number(current.dataset.focus) - previous.focus) > 1e-6
        || Math.abs(Number(current.dataset.transverseFocus) - previous.transverseFocus) > 1e-6;
    }, { focus: options.focus, transverseFocus: options.transverseFocus }, { timeout: 3000 });
    options = await readOptions(); camera = new PitchProjection(options);
  }
  const projected = camera.project(point);
  if (!projected || !camera.isVisible(point, 20) || projected.y < options.height * .27 || projected.y > options.height * .7)
    throw Error(`Square ${x},${y} is not visible above the pitch HUD`);
  const bounds = await scene.boundingBox();
  return { x: projected.x * bounds.width / options.width, y: projected.y * bounds.height / options.height };
}

export async function revealPlayer(page, marker) {
  const { x, y } = await marker.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) }));
  await squarePosition(page, x, y);
}
