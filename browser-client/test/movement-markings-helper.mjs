import assert from 'node:assert/strict';

export async function assertNoMovementMarkings(page) {
  assert.equal(await page.locator([
    '.live-route-step', '.live-available-step', '.live-unforecast-move-square',
    '.live-movement-label-layer', '.live-route-legend', '.live-additional-check',
    '.live-check-key', '.live-check-description', '[data-movement-square]',
    '[data-route-square]', '[data-label-square]', '[data-route-band]'
  ].join(',')).count(), 0, 'Movement forecasts and routes have no roll targets or risk grades');
  assert.equal(await page.getByLabel('Available square checks', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Planned square checks', { exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator('.live-pitch').textContent(), /D: Dodge|R: Rush|\b[DR] [2-6]\+/);
}
