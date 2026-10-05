import { PitchProjection } from '../src/pitch-projection.ts';

/** Exercise camera travel, then address the requested canonical cell. */
export async function squarePosition(page, x, y) {
  const scene = page.locator('.live-pitch-scene').first();
  let options = await scene.evaluate(element => ({ width: parseFloat(element.style.width), height: parseFloat(element.style.height),
    focus: Number(element.dataset.focus), transverseFocus: Number(element.dataset.transverseFocus),
    mode: element.dataset.projection, end: element.dataset.end, zoom: Number(element.dataset.zoom),
    perspectiveElevation: element.dataset.projection === 'perspective' ? Number(element.dataset.elevation) : 40 }));
  let camera = new PitchProjection(options);
  const point = { x: x + .5, y: y + .5 };
  const screen = camera.project(point);
  // Overlay HUDs reserve top/bottom space; exercise camera travel to expose
  // the intended ground cell rather than scrolling a clipped DOM scene.
  if (!camera.isVisible(point, 20) || !screen || screen.y < options.height * .27 || screen.y > options.height * .7) {
    await page.locator('.live-pitch-viewport').first().dispatchEvent('wheel', { deltaY: (options.focus - point.x) * (options.end === 'home' ? 1 : -1) / .012 });
    await page.waitForFunction(focus => Math.abs(Number(document.querySelector('.live-pitch-scene').dataset.focus) - focus) < 1e-6, point.x);
    options = { ...options, focus: point.x }; camera = new PitchProjection(options);
  }
  const projected = camera.project(point);
  if (!projected || !camera.isVisible(point)) throw Error(`Square ${x},${y} is not visible`);
  const bounds = await scene.boundingBox();
  return { x: projected.x * bounds.width / options.width, y: projected.y * bounds.height / options.height };
}

export async function revealPlayer(page, marker) {
  const { x, y } = await marker.evaluate(element => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) }));
  await squarePosition(page, x, y);
}
