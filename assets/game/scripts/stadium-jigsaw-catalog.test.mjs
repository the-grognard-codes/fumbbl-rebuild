import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {validateJigsawCatalog} from './stadium-jigsaw-catalog.mjs';
const root=new URL('../pitch/stadiums/jigsaw/',import.meta.url);
const original=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
test('both crowd views and venue masters have compatible, non-overlapping pieces and matching hashes',async()=>{
  assert.equal(await validateJigsawCatalog(original,root),original);
});
for(const [name,modify,match] of [
  ['changed PNG',c=>c.families.human.crowd.sha256='0'.repeat(64),/hash mismatch/],
  ['different slot sizes',c=>c.families.orc.crowd.regions.north.width--,/same measured piece dimensions/],
  ['overlapping pieces',c=>c.families.human.crowd.regions.south={...c.families.human.crowd.regions.north},/Overlapping/],
  ['missing corner',c=>delete c.families.human.crowd.regions['home-north-corner'],/Incomplete/],
  ['wide animated bank',c=>c.families.human.crowd.gesture.zones.north={...c.families.human.crowd.regions.north},/remain local/],
  ['flattened wall',c=>c.families.human.walls.rim.height=90,/flatten/]
])test('rejects '+name,async()=>{
  const catalog=structuredClone(original);modify(catalog);
  await assert.rejects(validateJigsawCatalog(catalog,root),match);
});
