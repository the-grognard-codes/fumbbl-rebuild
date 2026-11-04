// Promote approved trial PNGs and explicit material indices without re-inferring masks.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {deflateSync, crc32} from 'node:zlib';
import {recolorTeamImage} from '../../../browser-client/src/team-color-art.ts';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readRgbaPng, visibleBounds} from './png-art.mjs';
const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const provenance=[];
const median=(indices,secondary)=>{const shades=indices.filter(i=>secondary?i>=17:i>0&&i<17).map(i=>(i-1)%16).sort((a,b)=>a-b);return shades[Math.floor(shades.length/2)];};
// Encode straight RGBA without canvas premultiplication changing fixed edge pixels.
function pngBytes(width,height,rgba) {
 const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(new URL('ui/helmets-v1/',root),{recursive:true});
for(const roster of ['human','orc']) {
 const team=await json(`teams/${roster}/team.json`);
 const directory=`teams/${roster}/poses/${team.posePack}/`;
 const catalog=await json(directory+'catalog.json');
 const maps=await json(`team-colors/v1/source/${roster}.json`);
 const items=Object.entries(catalog.positions).map(([role,position])=>{
  const blitzer=role==='blitzer'||role==='orc-blitzer';
  const trial=blitzer?'blitzer-bust-redesign-v3':'roster-bust-redesign-v1';
  const id=blitzer?`${roster}-blitzer-portrait`:`${roster}-${role}-portrait`;
  const batch=`teams/${roster}/batches/${trial}`;
  return {id:`${roster}-${role}-portrait`,trial,idInTrial:id,destination:directory+position.portrait.file,
   original:`${batch}/sprites/${id}.png`,map:`${batch}/${blitzer?'material-indices':id+'-material-indices'}.json`,portrait:position.portrait};
 });
 items.push({id:`${roster}-helmet`,idInTrial:`${roster}-helmet`,trial:'helmet-redesign-v1',destination:`ui/helmets-v1/${roster}.png`,
  original:`team-colors/trials/helmet-redesign-v1/sources/${roster}-generated-320.png`,map:`team-colors/trials/helmet-redesign-v1/sources/${roster}-material-indices.json`});
 for(const item of items) {
  const assignment=await json(item.map);
  assert.equal(assignment.sourceSha256,hash(await readFile(new URL(item.original,root))),'Approved mask source hash');
  const approved=`team-colors/trials/${item.trial}/${item.idInTrial}-original.png`;
  const data=await readRgbaPng(new URL(approved,root));
  assert.equal(assignment.indices.length,data.width*data.height);
  // Calibrate lighting, not material membership. Preserve both ends of the shade
  // ramp and match the median paint tone of the corresponding front-facing body.
  const reference=maps.images.filter(e=>item.id.endsWith('-helmet')?e.id.endsWith('-front'):e.id===item.id.replace('-portrait','-front')).flatMap(e=>e.indices.flat());
  const toneCalibration=[false,true].map(secondary=>{
   const sourceMedian=median(assignment.indices,secondary),targetMedian=median(reference,secondary);
   assert(sourceMedian>0&&sourceMedian<15&&targetMedian>0&&targetMedian<15);
   return {sourceMedian,targetMedian,gamma:Math.log(targetMedian/15)/Math.log(sourceMedian/15)};
  });
  const indices=assignment.indices.map(i=>i===0?0:(i>=17?17:1)+Math.round(15*(((i-1)%16)/15)**toneCalibration[i>=17?1:0].gamma));
  const rgba=recolorTeamImage({rgba:data.rgba,indices:Uint8Array.from(indices)},{version:1,primary:roster==='human'?'navy':'black',secondary:roster==='human'?'ivory':'orange'});
  await writeFile(new URL(item.destination,root),pngBytes(data.width,data.height,rgba));
  const existing=maps.images.find(entry=>entry.id===item.id);assert(existing,item.id);
  Object.assign(existing,{source:item.destination,sourceSha256:hash(await readFile(new URL(item.destination,root))),indices:Array.from({length:data.height},(_,y)=>indices.slice(y*data.width,(y+1)*data.width))});
  delete existing.crop;
  if(item.portrait)Object.assign(item.portrait,{width:data.width,height:data.height,bounds:visibleBounds(data)});
  provenance.push({id:item.id,approved,destination:item.destination,sourceSha256:existing.sourceSha256,materialSource:item.map,toneCalibration});
 }
 await writeFile(new URL(directory+'catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
 await writeFile(new URL(`team-colors/v1/source/${roster}.json`,root),JSON.stringify(maps)+'\n');
}
await writeFile(new URL('team-colors/v1/approved-art.json',root),JSON.stringify({approvalDate:'2026-11-04',images:provenance},null,2)+'\n');
console.log(`Promoted ${provenance.length} approved portraits and helmets; body art and masks retained.`);
