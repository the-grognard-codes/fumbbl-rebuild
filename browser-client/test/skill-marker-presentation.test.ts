import assert from 'node:assert/strict';
import { defaultSkillMarkerPreferences } from '../src/skill-marker-preferences.ts';
import type { SetupPlayer } from '../src/setup-protocol.ts';
import { test } from 'node:test';
import { isSkillMarkerVisible, markerStripMetrics, markerStripLayout, playerSkillMarkers } from '../src/skill-marker-presentation.ts';

test('Big Guy toggle hides exactly the six requested traits while preserving Loner and other traits', () => {
  const preferences = { showTraits: true, showBigGuyNegatraits: false };
  for (const id of ['bone-head','really-stupid','always-hungry','animal-savagery','unchannelled-fury','secret-weapon']) {
    assert.equal(isSkillMarkerVisible({ id, category: 'TRAIT' }, preferences), false, id);
  }
  for (const id of ['loner','take-root','animosity','stunty','regeneration']) {
    assert.equal(isSkillMarkerVisible({ id, category: 'TRAIT' }, preferences), true, id);
  }
  assert.equal(isSkillMarkerVisible({ id: 'mighty-blow', category: 'STRENGTH' }, preferences), true);
});

test('Show traits remains the master filter without overwriting the Big Guy preference', () => {
  assert.equal(isSkillMarkerVisible({ id: 'bone-head', category: 'TRAIT' }, { showTraits: true, showBigGuyNegatraits: true }), true);
  for (const showBigGuyNegatraits of [true, false]) {
    assert.equal(isSkillMarkerVisible({ id: 'loner', category: 'TRAIT' }, { showTraits: false, showBigGuyNegatraits }), false);
    assert.equal(isSkillMarkerVisible({ id: 'guard', category: 'STRENGTH' }, { showTraits: false, showBigGuyNegatraits }), true);
  }
});

test('markers grow with projected player size and stop shrinking at the readability floor', () => {
  const baseline = markerStripMetrics(['LO','MB'], 'medium', 64);
  const zoomed = markerStripMetrics(['LO','MB'], 'medium', 128);
  assert.equal(zoomed.height, baseline.height * 2);
  assert.equal(zoomed.widths[0], baseline.widths[0] * 2);
  assert.equal(markerStripMetrics(['B'], 'small', 4).height, 14);
  assert.equal(markerStripMetrics(['BHD','LO'], 'small', 4).height, 20);
  assert.equal(markerStripMetrics(['BHD'], 'small', Number.NaN).height, 20);
});

test('three-letter frames gain horizontal room while staying portrait and aligning the strip height', () => {
  const metrics = markerStripMetrics(['BHD','LO','MB'], 'medium');
  assert.ok(metrics.widths[0] > metrics.widths[1]);
  assert.ok(metrics.widths.every(width => width < metrics.height));
  assert.ok(markerStripMetrics(['MB'], 'large', 64).height > markerStripMetrics(['MB'], 'small', 64).height);
});

test('illustrated markers keep a 20px floor at every size and zoom without changing text geometry', () => {
  for (const size of ['small', 'medium', 'large'] as const) {
    for (const squarePixels of [0, 4, 32, 64]) {
      const illustrated = markerStripMetrics(['B', 'LO', 'BHD'], size, squarePixels, 'illustrated');
      assert.ok(illustrated.height >= 20);
      assert.ok(illustrated.widths.every(width => width === illustrated.height * 72 / 96));
    }
  }
  assert.equal(markerStripMetrics(['B'], 'small', 64, 'illustrated').height, 20);
  assert.equal(markerStripMetrics(['B'], 'medium', 64, 'illustrated').height, 20);
  assert.equal(markerStripMetrics(['B'], 'large', 64, 'illustrated').height, 24);
  assert.equal(markerStripMetrics(['LO'], 'medium', 128, 'illustrated').height, 40);
  assert.equal(markerStripMetrics(['B'], 'small', 4, 'text').height, 14);
  assert.equal(markerStripMetrics(['BHD'], 'small', 4, 'text').widths[0], 20 * 88 / 96);
});

const player: SetupPlayer = { id: 'troll', name: 'Troll', slot: 1, role: 'home', x: 7, y: 7, state: 'standing',
  skillMarkers: { version: 1, details: ['Loner (4+)', 'A unique star ability'], entries: [
    { id: 'guard', category: 'STRENGTH', origin: 'base' },
    { id: 'block', category: 'GENERAL', origin: 'acquired' },
    { id: 'loner', category: 'TRAIT', origin: 'base' },
    { id: 'really-stupid', category: 'TRAIT', origin: 'base' },
    { id: 'dodge', category: 'AGILITY', origin: 'acquired' },
  ] } };
const ids = (options = {}, role: 'home' | 'away' | 'spectator' = 'home', replay = false) =>
  playerSkillMarkers(player, role, { ...defaultSkillMarkerPreferences, ...options }, replay).map(marker => marker.id);

test('defaults exclude base skills, retain traits, prioritize negative traits and keep the card unfiltered', () => {
  assert.deepEqual(ids(), ['loner','really-stupid','block','dodge']);
  assert.deepEqual(ids({ showTraits: false }), ['block','dodge']);
  assert.deepEqual(ids({ showBigGuyNegatraits: false }), ['loner','block','dodge']);
  assert.deepEqual(ids({ showAcquired: false }), ['loner','really-stupid']);
  assert.deepEqual(ids({ showAcquired: false, showBase: true }), ['loner','really-stupid','guard']);
  assert.equal(player.skillMarkers?.details[0], 'Loner (4+)');
  const restricted = { ...player, skillMarkers: { ...player.skillMarkers!, entries: [...player.skillMarkers!.entries,
    ...['always-hungry','animosity','secret-weapon'].map(id => ({ id, category: 'TRAIT', origin: 'base' as const }))] } };
  assert.deepEqual(playerSkillMarkers(restricted, 'home', defaultSkillMarkerPreferences).slice(0, 5).map(marker => marker.id),
    ['always-hungry','animosity','loner','really-stupid','secret-weapon']);
});

test('team gates follow coach ownership and use home/away in spectator and replay views', () => {
  assert.deepEqual(ids({ showOwn: false }), []);
  assert.deepEqual(ids({ showOpponent: false }, 'away'), []);
  assert.deepEqual(ids({ showOwn: false }, 'spectator'), []);
  assert.deepEqual(ids({ showOwn: false }, 'away', true), []);
  assert.ok(ids({ showOpponent: false }, 'away', true).length);
});

test('legacy snapshots do not guess origins, and invalid or duplicate core identities never render', () => {
  const settings = { ...defaultSkillMarkerPreferences, showBase: true };
  assert.deepEqual(playerSkillMarkers({ ...player, skillMarkers: undefined, skills: ['Block'] }, 'home', settings), []);
  const data = player.skillMarkers!;
  const malformed = { ...player, skillMarkers: { ...data, entries: [...data.entries, ...data.entries,
    { id: 'star-ability', category: 'TRAIT', origin: 'base' as const },
    { id: 'tackle', category: 'TRAIT', origin: 'acquired' as const }] } };
  assert.equal(playerSkillMarkers(malformed, 'home', settings).length, 5);
});

test('crowded strips reduce capacity before sacrificing the readability floor, with exact overflow counts', () => {
  const labels = ['BHD','LO','B','MB','D'];
  for (const pixels of [24,48,64,128]) {
    const layout = markerStripLayout(labels, 'medium', pixels, 'illustrated');
    assert.ok(layout.count >= 1 && layout.count <= 3);
    assert.equal(layout.remaining, labels.length - layout.count);
    assert.ok(layout.height >= 20);
    assert.ok(layout.width <= pixels - 4 || layout.count === 1);
  }
  assert.equal(markerStripLayout(['B','D','G'], 'medium', 128, 'illustrated').count, 3);
  assert.equal(markerStripLayout(labels, 'large', 48, 'text').count, 1);
});
