import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {readRgbaPng,isolatedBounds} from './png-art.mjs';
import {validateStadiumGeometry} from './stadium-geometry.mjs';
const root=new URL('../pitch/stadiums/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('modular-catalog.json',root),'utf8'));
const roles=['stone','timber','gate','gateTop','crowd','crowdSide','crowdTop','banner','bench','benchTop','pavilion','pavilionTop','mugs','torch','torchTop','pennant','crowdBack','crowdSideReverse','fanRest','fanCheer'];
const profiles={};
for(const entry of catalog.atlases) {
  if(!/^[a-z0-9-]+$/.test(entry.id)||profiles[entry.id]||!/^[a-z0-9-]+\.png$/.test(entry.atlas))throw Error('Invalid modular stadium identity');
  if(JSON.stringify(Object.keys(entry.cells))!==JSON.stringify(roles))throw Error('Incomplete modular stadium roles: '+entry.id);
  const pngUrl=new URL(entry.atlas,root),bytes=await readFile(pngUrl),source=JSON.parse(await readFile(new URL(entry.provenance,root),'utf8'));
  if(source.profile!==entry.id||source.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('Modular stadium provenance mismatch');
  const image=await readRgbaPng(pngUrl),regions={};
  for(const role of roles) {
    const cell=entry.cells[role];
    if(![cell.x,cell.y,cell.width,cell.height].every(Number.isInteger)||cell.x<0||cell.y<0||cell.width<=0||cell.height<=0
      ||cell.x+cell.width>image.width||cell.y+cell.height>image.height)throw Error('Invalid modular stadium region: '+role);
    regions[role]=isolatedBounds(image,cell,entry.id+'/'+role);
  }
  for(let i=0;i<roles.length;i++)for(let j=i+1;j<roles.length;j++){
    const a=entry.cells[roles[i]],b=entry.cells[roles[j]];
    if(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height)throw Error('Overlapping atlas cells');
  }
  profiles[entry.id]={id:entry.id,version:entry.version,atlas:entry.atlas,palette:entry.palette,width:image.width,height:image.height,regions};
}
for(const mapping of [catalog.venues,catalog.teams])if(!mapping||Object.values(mapping).some(id=>!Object.hasOwn(profiles,id)))throw Error('Unknown modular stadium mapping');
const g=catalog.geometry;
validateStadiumGeometry(g);
const output=new URL('../../../browser-client/src/generated-stadium-modules.ts',import.meta.url);
const code='// Generated from modular stadium originals and measured transparent regions. Run assets:sync.\n'
  +'export const stadiumModules = '+JSON.stringify(profiles,null,2)+' as const;\n'
  +'export const stadiumGeometry = '+JSON.stringify(g,null,2)+' as const;\n'
  +'export const modularStadiumVenues: Readonly<Record<string, keyof typeof stadiumModules>> = '+JSON.stringify(catalog.venues)+';\n'
  +'export const modularStadiumTeams: Readonly<Record<string, keyof typeof stadiumModules>> = '+JSON.stringify(catalog.teams)+';\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==code)throw Error('Modular stadium catalog is stale. Run assets:sync.');}
else await writeFile(output,code);
console.log('Validated modular stadiums:',Object.keys(profiles).join(', '));
