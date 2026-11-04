import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { decodeTeamColors, defaultTeamColors, teamColorIds } from '../src/team-colors.ts';
import { decodeColorPack, recolorTeamImage, teamColorRamps, TeamColorArt } from '../src/team-color-art.ts';
import { decodeSavedDocument } from '../src/saved-team-protocol.ts';

test('approved IDs, defaults and invalid pairs have one stable meaning', () => {
  assert.deepEqual([...teamColorIds].sort(), teamColorRamps.map(ramp => ramp.id).sort());
  assert.deepEqual(defaultTeamColors('human'), { version: 1, primary: 'navy', secondary: 'ivory' });
  assert.deepEqual(defaultTeamColors('orc'), { version: 1, primary: 'black', secondary: 'orange' });
  for (const primary of teamColorIds) for (const secondary of teamColorIds) assert.deepEqual(decodeTeamColors({ version: 1, primary, secondary }), { version: 1, primary, secondary });
  for (const value of [null, {}, { version: 1, primary: 'navy' }, { version: 2, primary: 'navy', secondary: 'ivory' },
    { version: 1, primary: 'unknown', secondary: 'ivory' }, { version: 1, primary: 'navy', secondary: 'ivory', injected: true }]) assert.throws(() => decodeTeamColors(value));
});

test('new saved documents require colors; legacy documents retain absence without mutation', () => {
  const document = { formatVersion: 3, teamId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', documentVersion: 1, ruleset: 'BB2025', catalogVersion: 'test',
    owner: { namespace: 'account', subject: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
    draft: { draftVersion: 2, teamName: 'Test', catalogVersion: 'test', ruleset: 'BB2025', rosterId: 'human', presetId: 'test', captainId: null, players: [],
      resources: { rerolls: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: 0, dedicatedFans: 0 } },
    validation: { valid: true, total: 0, budget: 0, skillPoints: 0, messages: [] } };
  assert.equal(decodeSavedDocument(document).draft.colors, undefined);
  assert.throws(() => decodeSavedDocument({ ...document, formatVersion: 4 }));
  const colors = defaultTeamColors('human');
  assert.deepEqual(decodeSavedDocument({ ...document, formatVersion: 4, draft: { ...document.draft, colors } }).draft.colors, colors);
  assert.equal(Object.hasOwn(document.draft, 'colors'), false);
});

test('both complete rosters retain every fixed pixel and alpha across all 256 pairs', async () => {
  for (const roster of ['human', 'orc'] as const) {
    const raw = gunzipSync(await readFile(new URL(`../../assets/game/team-colors/v1/delivery/${roster}.bin.gz`, import.meta.url)));
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const pack = await decodeColorPack(roster, buffer);
    assert.equal(pack.size, 49);
    assert.equal([...pack.values()].filter(image => image.entry.kind === 'body').length, 42);
    assert.equal([...pack.values()].filter(image => image.entry.kind === 'bust').length, 6);
    for (const image of pack.values()) {
      const before = new Uint8Array(image.rgba);
      assert(image.indices.some(index => index > 0), image.entry.id);
      for (const primary of teamColorIds) for (const secondary of teamColorIds) {
        const output = recolorTeamImage(image, { version: 1, primary, secondary });
        for (let pixel = 0; pixel < image.indices.length; pixel++) {
          const at = pixel * 4;
          if (output[at + 3] !== before[at + 3]) assert.fail(`Alpha changed: ${image.entry.id}`);
          if (!image.indices[pixel] && (output[at] !== before[at] || output[at + 1] !== before[at + 1] || output[at + 2] !== before[at + 2])) assert.fail(`Fixed material changed: ${image.entry.id}`);
        }
      }
      assert.deepEqual(image.rgba, before);
    }
    const corrupt = buffer.slice(0); new Uint8Array(corrupt)[0] ^= 1;
    await assert.rejects(decodeColorPack(roster, corrupt));
    await assert.rejects(decodeColorPack(roster, buffer.slice(0, -1)));
  }
});

test('unavailable packs and historical absence preserve static art; release clears owned state', () => {
  const art = new TeamColorArt(), release = art.retain();
  const url = '/assets/game/teams/human/poses/coach-oriented-v1/master/lineman-front.png';
  assert.equal(art.resolve(url), url);
  assert.equal(art.resolve(url, defaultTeamColors('human')), url);
  release(); assert.deepEqual(art.diagnostics, { images: 0, cached: 0, limit: 128, owners: 0 });
});

test('reviewed kit details recolor while nearby eyes, skin and helmet hardware stay fixed', async () => {
  // Coordinates are visual review landmarks, independent of authoring selectors.
  const landmarks: [string, number, number, 'primary' | 'secondary' | 'fixed'][] = [
    ['human-helmet', 100, 80, 'primary'],
    ['human-helmet', 180, 40, 'secondary'],
    ['human-helmet', 200, 150, 'fixed'],
    ['orc-helmet', 120, 100, 'primary'],
    ['orc-helmet', 190, 110, 'secondary'],
    ['orc-helmet', 210, 145, 'fixed'],
    ['human-blitzer-side', 37, 12, 'primary'],
    ['human-blitzer-front', 28, 16, 'secondary'],
    ['human-ogre-front45', 31, 14, 'primary'],
    ['human-ogre-front', 30, 21, 'secondary'],
    ['human-ogre-front45', 38, 22, 'secondary'],
    ['human-ogre-side', 46, 23, 'secondary'],
    ['orc-big-un-blocker-front', 16, 55, 'secondary'],
    ['orc-big-un-blocker-front', 30, 8, 'secondary'],
    ['orc-big-un-blocker-prone', 27, 32, 'secondary'],
    ['orc-troll-side', 39, 17, 'primary'],
    ['orc-troll-side', 34, 29, 'fixed'],
  ];
  for (const roster of ['human', 'orc'] as const) {
    const raw = gunzipSync(await readFile(new URL(`../../assets/game/team-colors/v1/delivery/${roster}.bin.gz`, import.meta.url)));
    const pack = await decodeColorPack(roster, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    for (const [id, x, y, expected] of landmarks.filter(([id]) => id.startsWith(roster))) {
      const image = [...pack.values()].find(image => image.entry.id === id);
      assert(image, id);
      const index = image.indices[y * image.entry.width + x];
      assert.equal(index === 0 ? 'fixed' : index < 17 ? 'primary' : 'secondary', expected, `${id} (${x}, ${y})`);
      assert(image.rgba[(y * image.entry.width + x) * 4 + 3] > 0, 'Landmark must be visible');
    }
  }
});

test('production portraits and helmets retain approved materials and fixed pixels', async () => {
  const { readRgbaPng } = await import('../../assets/game/scripts/png-art.mjs');
  const root = new URL('../../assets/game/', import.meta.url);
  const approval = JSON.parse(await readFile(new URL('team-colors/v1/approved-art.json', root), 'utf8'));
  assert.equal(approval.images.length, 14);
  for (const roster of ['human', 'orc'] as const) {
    const raw = gunzipSync(await readFile(new URL(`team-colors/v1/delivery/${roster}.bin.gz`, root)));
    const pack = await decodeColorPack(roster, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    for (const entry of approval.images.filter((entry: { id: string }) => entry.id.startsWith(roster))) {
      const image = [...pack.values()].find(image => image.entry.id === entry.id);
      assert(image, entry.id);
      const approved = await readRgbaPng(new URL(entry.approved, root));
      const material = JSON.parse(await readFile(new URL(entry.materialSource, root), 'utf8'));
      const group = (i: number) => i === 0 ? 0 : i < 17 ? 1 : 2;
      for (let p=0;p<image.indices.length;p++) {
        assert.equal(group(image.indices[p]),group(material.indices[p]),entry.id);
        assert.equal(image.rgba[p*4+3],approved.rgba[p*4+3],entry.id);
        if (!material.indices[p]) assert.deepEqual([...image.rgba.slice(p*4,p*4+4)],[...approved.rgba.slice(p*4,p*4+4)],entry.id);
      }
      const colors = defaultTeamColors(roster);
      assert.deepEqual([...recolorTeamImage(image,colors)],[...image.rgba],entry.id);
      assert.equal(image.entry.width, approved.width);
      assert.equal(image.entry.height, approved.height);
      assert.deepEqual([...(await readRgbaPng(new URL(entry.destination, root))).rgba],[...image.rgba]);
    }
  }
});

test('portrait and helmet base tones match the player kit for both materials', async () => {
  const median = (indices: number[], secondary: boolean) => {
    const shades = indices.filter(i => secondary ? i >= 17 : i > 0 && i < 17).map(i => (i - 1) % 16).sort((a,b) => a-b);
    return shades[Math.floor(shades.length / 2)];
  };
  for (const roster of ['human','orc']) {
    const maps = JSON.parse(await readFile(new URL(`../../assets/game/team-colors/v1/source/${roster}.json`, import.meta.url), 'utf8'));
    for (const art of maps.images.filter((e: {id:string}) => /-(portrait|helmet)$/.test(e.id))) {
      const bodies = maps.images.filter((e: {id:string}) => art.id.endsWith('-helmet') ? e.id.endsWith('-front') : e.id === art.id.replace('-portrait','-front'));
      for (const secondary of [false,true]) {
        const expected = median(bodies.flatMap((e: {indices:number[][]}) => e.indices.flat()),secondary);
        const actual = median(art.indices.flat(),secondary);
        assert(Math.abs(actual-expected)<=1, `${art.id} ${secondary?'secondary':'primary'} median ${actual}, player ${expected}`);
      }
    }
  }
});

test('same-color helmets keep the secondary band lighter than primary paint highlights', () => {
  const indices = Uint8Array.from(Array.from({length:32},(_,i)=>i+1));
  const rgba = Uint8Array.from(Array.from({length:32},()=>[24,32,40,255]).flat());
  for (const color of ['navy','red','magenta'] as const) {
    const output = recolorTeamImage({rgba,indices,entry:{kind:'helmet'}},{version:1,primary:color,secondary:color});
    const brightness = (pixel:number) => .2126*output[pixel*4]+.7152*output[pixel*4+1]+.0722*output[pixel*4+2];
    assert(brightness(16+8)>brightness(12),`${color}: secondary midtone must exceed primary highlight`);
  }
});

test('helmet equal-color treatment leaves busts, bodies and different-color kits unchanged', () => {
  const indices=Uint8Array.from(Array.from({length:32},(_,i)=>i+1));
  const rgba=new Uint8Array(32*4).fill(255);
  for(const kind of ['bust','body','helmet']) {
    const colors={version:1 as const,primary:'red' as const,secondary:kind==='helmet'?'navy' as const:'red' as const};
    assert.deepEqual(recolorTeamImage({rgba,indices,entry:{kind}},colors),recolorTeamImage({rgba,indices},colors));
  }
});
