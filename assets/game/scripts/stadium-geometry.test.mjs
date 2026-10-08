import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {validateStadiumGeometry} from './stadium-geometry.mjs';
const {geometry}=JSON.parse(await readFile(new URL('../pitch/stadiums/modular-catalog.json',import.meta.url),'utf8'));
test('approved modular bowl fits its shared apron and locker passages',()=>validateStadiumGeometry(geometry));
for (const [name,change] of [
  ['both portals on one sideline',g=>{g.lockerRooms[1].side='north';}],
  ['portal moved from its approved position',g=>{g.lockerRooms[0].x=13;}],
  ['different outer dimensions',g=>{g.outer.x[1]=33;}],
  ['bench encroaches on the apron',g=>{g.benches[0].y=-2.1;}],
  ['pavilion blocks the locker passage',g=>{g.pavilion.x=6;}],
  ['furniture outside the bowl',g=>{g.benches[0].y=-8;}],
  ['partition crosses the field',g=>{g.partitions[0].y1=3;}],
]) test('rejects '+name,()=>{const value=structuredClone(geometry);change(value);assert.throws(()=>validateStadiumGeometry(value));});
