import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { skillMarkerCatalog } from '../src/generated-skill-markers.ts';

test('delivery contains both approved packs for exactly the 108 core BB2025 identities', () => {
  const root = new URL('../../', import.meta.url);
  const source = readFileSync(new URL('ffb-server/src/main/java/com/fumbbl/ffb/server/team/bb2025/SkillDefinitions.java', root), 'utf8');
  const nativeIds = [...source.matchAll(/add\(data, "([a-z-]+)",/g)].map(match => match[1]).sort();
  assert.equal(nativeIds.length, 108);
  assert.deepEqual(skillMarkerCatalog.map(marker => marker.id).sort(), nativeIds);
  assert.equal(new Set(skillMarkerCatalog.map(marker => marker.label)).size, 108);
  const approved = JSON.parse(readFileSync(new URL('assets/game/ui/player-skill-markers-v1/approved-sha256.json', root), 'utf8'));
  assert.deepEqual(Object.keys(approved).sort(), nativeIds);
  const digest = (path: string) => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
  for (const marker of skillMarkerCatalog) {
    assert.match(marker.label, /^[A-Za-z]{1,3}$/);
    for (const [style, extension] of [['text', 'svg'], ['illustrated', 'png']]) {
      const path = `ui/player-skill-markers-v1/${style}/${marker.id}.${extension}`;
      assert.equal(digest(`assets/game/${path}`), approved[marker.id][style], `${marker.id}: approved ${style} art`);
      assert.equal(digest(`browser-client/public/assets/game/${path}`), digest(`assets/game/${path}`), `${marker.id}: public ${style} delivery`);
    }
  }
});
