import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readRgbaPng,visibleBounds} from './png-art.mjs';

export const JIGSAW_ROLES = ['north','south','home-north-corner','away-north-corner',
  'home-south-corner','away-south-corner','away','home'];
const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
function region(rect,image,label) {
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isInteger)
    ||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0
    ||rect.x+rect.width>image.width||rect.y+rect.height>image.height)
    throw Error('Invalid jigsaw region: '+label);
}
async function source(entry,root,label) {
  if(!entry||!/^[a-z0-9-]+\.png$/.test(entry.file))throw Error('Invalid jigsaw file: '+label);
  const url=new URL(entry.file,root),bytes=await readFile(url);
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Jigsaw source hash mismatch: '+label);
  const image=await readRgbaPng(url);
  if(entry.width!==image.width||entry.height!==image.height)throw Error('Jigsaw source dimensions mismatch: '+label);
  return image;
}
/** Read-only verification: masters are never cropped, resized or re-encoded. */
export async function validateJigsawCatalog(catalog,root) {
  if(catalog.version!==1||catalog.rise!==1.4||!catalog.families?.human||!catalog.families?.orc||Object.keys(catalog.families).some(id=>!/^[a-z][a-z0-9-]*$/.test(id)))
    throw Error('Invalid jigsaw families or geometry version');
  if(!catalog.profiles||Object.values(catalog.profiles).some(id=>!Object.hasOwn(catalog.families,id)))throw Error('Unknown jigsaw profile mapping');
  let reference;
  for(const [name,family] of Object.entries(catalog.families)) {
    for(const view of ['crowd','overhead']) {
      const art=family[view],image=await source(art,root,name+'/'+view);
      if(JSON.stringify(Object.keys(art.regions))!==JSON.stringify(JIGSAW_ROLES))throw Error('Incomplete jigsaw roles');
      const keys=Object.keys(art.regions);
      for(const key of keys) {
        const rect=art.regions[key];region(rect,image,key);
        if(!visibleBounds(image,rect).width)throw Error('Empty jigsaw region: '+key);
      }
      for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)
        if(overlap(art.regions[keys[i]],art.regions[keys[j]]))throw Error('Overlapping jigsaw regions');
      const layout=JSON.stringify(art.regions);
      reference??=layout;
      if(layout!==reference)throw Error('Jigsaw families must share the same measured piece dimensions');
      const gesture=art.gesture,frame=await source(gesture,root,name+'/'+view+'/gesture');
      if(frame.width!==image.width||frame.height!==image.height
        ||JSON.stringify(Object.keys(gesture.zones))!==JSON.stringify(JIGSAW_ROLES))throw Error('Incompatible jigsaw gesture frame');
      for(const key of keys) {
        const zone=gesture.zones[key],cell=art.regions[key];region(zone,frame,key+'/gesture');
        if(!overlap(zone,cell)||zone.width*zone.height>cell.width*cell.height*.25)
          throw Error('Gesture must remain local to its section: '+key);
      }
    }
    const wall=family.walls,image=await source(wall,root,name+'/walls');
    region(wall.straight,image,'wall');
    region(wall.rim,image,'rim');
    if(wall.rim.height>20)throw Error('Overhead rim must not flatten the wall face');
  }
  return catalog;
}
