import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {validateJigsawCatalog} from './stadium-jigsaw-catalog.mjs';
const root=new URL('../pitch/stadiums/jigsaw/',import.meta.url);
const original=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
const intermediate=(({file,width,height,sha256})=>({file,width,height,sha256}))(original.families.human.overhead.gesture);
test('both crowd views and venue masters have compatible, non-overlapping pieces and matching hashes',async()=>{
  assert.equal(await validateJigsawCatalog(original,root),original);
});
test('accepts an optional intermediate gesture frame with matching atlas geometry',async()=>{
  const catalog=structuredClone(original);
  catalog.families.human.crowd.gesture.frames=[intermediate];
  assert.equal(await validateJigsawCatalog(catalog,root),catalog);
});
for(const [name,modify,match] of [
  ['changed PNG',c=>c.families.human.crowd.sha256='0'.repeat(64),/hash mismatch/],
  ['different slot sizes',c=>c.families.orc.crowd.regions.north.width--,/same measured piece dimensions/],
  ['overlapping pieces',c=>c.families.human.crowd.regions.south={...c.families.human.crowd.regions.north},/Overlapping/],
  ['missing corner',c=>delete c.families.human.crowd.regions['home-north-corner'],/Incomplete/],
  ['wide animated bank',c=>c.families.human.crowd.gesture.zones.north={...c.families.human.crowd.regions.north},/remain local/],
  ['non-array gesture frames',c=>c.families.human.crowd.gesture.frames={},/Invalid jigsaw gesture frames/],
  ['too many gesture frames',c=>c.families.human.crowd.gesture.frames=Array(4).fill({}),/Invalid jigsaw gesture frames/],
  ['duplicate gesture frame',c=>c.families.human.crowd.gesture.frames=[structuredClone(c.families.human.crowd.gesture)],/Duplicate or invalid/],
  ['gesture frame dimensions',c=>c.families.human.crowd.gesture.frames=[{...intermediate,width:1}],/dimensions mismatch/],
  ['gesture frame hash',c=>c.families.human.crowd.gesture.frames=[{...intermediate,sha256:'0'.repeat(64)}],/hash mismatch/],
  ['missing overhead accessories',c=>delete c.accessories.regions.orc.overhead,/Invalid jigsaw region/],
  ['overlapping accessory views',c=>c.accessories.regions.orc.overhead={...c.accessories.regions.human.overhead},/Overlapping accessory/],
  ['changed accessories',c=>c.accessories.sha256='0'.repeat(64),/hash mismatch/],
  ['flattened wall',c=>c.families.human.walls.rim.height=90,/flatten/]
])test('rejects '+name,async()=>{
  const catalog=structuredClone(original);modify(catalog);
  await assert.rejects(validateJigsawCatalog(catalog,root),match);
});
