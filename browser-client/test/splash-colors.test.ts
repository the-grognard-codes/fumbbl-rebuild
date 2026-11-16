import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splashOutline } from '../src/splash-colors.ts';
import { teamColorManifest } from '../src/generated-team-colors.ts';
function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
test('every saved primary/secondary pair has a legible neutral ribbon edge', () => {
  for (const primary of teamColorManifest.ramps) for (const secondary of teamColorManifest.ramps) {
    for (const color of [primary.colors[9], secondary.colors[12]]) {
      const values = [luminance(color), luminance(splashOutline(color))].sort((a,b) => a-b);
      assert.ok((values[1] + .05) / (values[0] + .05) >= 4.5, `${primary.id}/${secondary.id} ${color}`);
    }
  }
});
