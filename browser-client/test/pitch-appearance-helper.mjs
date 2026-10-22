import assert from 'node:assert/strict';

/** The shared match pitch keeps its field and gameplay layers without the old bowl. */
export async function assertPitchWithoutStadium(page) {
  assert.equal(await page.locator('[data-cell-x]').count(), 390, 'all playable squares remain');
  assert.ok(await page.locator('.pitch-stadium-turf').count() > 0, 'existing turf remains');
  assert.equal(await page.locator('.pitch-stadium-structure, .pitch-stadium-crowd, [data-jigsaw-piece], [data-stadium-role], .stadium-gesture, .stadium-ambient').count(), 0,
    'stadium architecture, props and animated crowd are not mounted');
  assert.equal(await page.locator('img[src*="/pitch/stadiums/"], image[href*="/pitch/stadiums/"]').count(), 0,
    'stadium and crowd atlases are not used');
}
