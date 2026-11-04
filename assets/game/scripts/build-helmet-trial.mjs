import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from '../../../browser-client/node_modules/playwright/index.mjs';
import {readRgbaPng} from './png-art.mjs';
import {recolorTeamImage,teamColorRamps} from '../../../browser-client/src/team-color-art.ts';
const root='assets/game/team-colors/trials/helmet-redesign-v1';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const report=[];
try {
 const page=await browser.newPage({viewport:{width:1060,height:750}});
 for(const roster of ['human','orc']) {
  const id=roster+'-helmet',batch=root+'/sources';
  const path=batch+'/'+roster+'-generated-320.png',data=await readRgbaPng(path);
  assert.equal(data.width,320);assert.equal(data.height,320);
  const indices=new Uint8Array(320*320);
  for(let p=0;p<indices.length;p++) {
   const [r,g,b,a]=data.rgba.subarray(p*4,p*4+4);if(!a)continue;
   const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
   if(!delta||delta/max<.12)continue;
   let hue=max===r?60*((g-b)/delta%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4);if(hue<0)hue+=360;
   const material=hue>=280&&hue<=345&&true?1:hue>=55&&hue<=115&&g>=r*.96?2:0;
   if(material)indices[p]=(material===1?1:17)+Math.min(15,Math.round((max/255)**.8*15));
  }
  // Disconnected key-colored flecks in the fixed interior and fittings are not painted panels.
  const seen=new Set();
  for(let p=0;p<indices.length;p++){
   if(!indices[p]||seen.has(p))continue;
   const material=indices[p]<17?1:2,component=[p];seen.add(p);
   for(let q=0;q<component.length;q++){const at=component[q],x=at%320,y=Math.floor(at/320);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*320+xx;if(xx<0||xx>=320||yy<0||yy>=320||seen.has(n)||!indices[n]||(indices[n]<17?1:2)!==material)continue;seen.add(n);component.push(n);}}
   if(component.length<60)for(const at of component)indices[at]=0;
  }
  const image={rgba:data.rgba,indices};
  const base={version:1,primary:roster==='human'?'navy':'black',secondary:roster==='human'?'ivory':'orange'};
  // Fixed pixels and transparency must be identical for every supported pair.
  for(const p of teamColorRamps)for(const s of teamColorRamps){const rgba=recolorTeamImage(image,{version:1,primary:p.id,secondary:s.id});for(let i=0;i<indices.length;i++){assert.equal(rgba[i*4+3],data.rgba[i*4+3]);if(!indices[i])for(let c=0;c<3;c++)assert.equal(rgba[i*4+c],data.rgba[i*4+c]);}}
  const old=await readRgbaPng(batch+'/'+roster+'-reference-320.png');
  const variants={reference:[...old.rgba],original:[...recolorTeamImage(image,base)],contrast:[...recolorTeamImage(image,{version:1,primary:'magenta',secondary:'lime'})],blackwhite:[...recolorTeamImage(image,{version:1,primary:'black',secondary:'white'})],mask:[...data.rgba].map((v,i)=>i%4===3?v:indices[i>>2]===0?88:(indices[i>>2]<17?[255,0,170]:[120,255,20])[i%4])};
  await writeFile(`${batch}/${roster}-material-indices.json`,JSON.stringify({id,width:320,height:320,sourceSha256:createHash('sha256').update(await readFile(path)).digest('hex'),indices:[...indices]})+'\n');
  const pngs=await page.evaluate(variants=>Object.fromEntries(Object.entries(variants).map(([k,rgba])=>{const c=document.createElement('canvas');c.width=c.height=320;c.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(rgba),320,320),0,0);return[k,c.toDataURL().split(',')[1]]})),variants);
  for(const [name,png]of Object.entries(pngs))await writeFile(`${root}/${id}-${name}.png`,Buffer.from(png,'base64'));
  await page.setContent('<style>body{background:#17221c;color:#eee;font:15px sans-serif;margin:20px}h1{font-size:21px}.row{display:flex;gap:16px}canvas{image-rendering:pixelated}section{width:192px}p{margin:8px 0}</style><h1></h1><p>New helmet trial — primary / secondary shading; gray mask areas preserve original materials</p><main></main>');
  await page.evaluate(({id,variants})=>{document.querySelector('h1').textContent=id;for(const scale of [1,2]){const title=document.createElement('h2');title.textContent=scale===1?'Native 320px':'2× detail';document.querySelector('main').append(title);const row=document.createElement('div');row.className='row';for(const [key,label]of [['reference','Existing reference'],['original','New team palette'],['contrast','Magenta / Lime'],['blackwhite','Black / White'],['mask','Material mask']]){const section=document.createElement('section');section.style.width=`${320*scale}px`;const p=document.createElement('p');p.textContent=label;const c=document.createElement('canvas');c.width=c.height=320;c.style.width=c.style.height=`${320*scale}px`;c.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(variants[key]),320,320),0,0);section.append(p,c);row.append(section)}document.querySelector('main').append(row)}}, {id,variants});
  await page.setViewportSize({width:3330,height:1300});await page.screenshot({path:`${root}/${id}-review.png`,fullPage:true});
  const primary=new Set([...indices].filter(i=>i>0&&i<17)),secondary=new Set([...indices].filter(i=>i>=17));
  report.push({id,width:320,height:320,primaryShadeLevels:primary.size,secondaryShadeLevels:secondary.size,transparentPixels:[...indices].filter((_,i)=>!data.rgba[i*4+3]).length,validation:'All 256 palette pairs preserve fixed RGB and all alpha.'});
 }
 await writeFile(`${root}/validation.json`,JSON.stringify(report,null,2));
 await writeFile(`${root}/index.html`,'<!doctype html><meta charset="utf-8"><title>Helmet redesign v1</title><style>body{background:#17221c;color:white;font:16px sans-serif}img{max-width:100%;image-rendering:pixelated}</style><h1>Helmet redesign — rich shading trial</h1><p>Existing reference / new team palette / magenta-lime / black-white / mask. Native and 2× views. Production helmets are unchanged.</p>'+['human','orc'].map(r=>`<h2>${r}</h2><a href="${r}-helmet-review.png"><img src="${r}-helmet-review.png"></a>`).join(''));
 console.log(report);
}finally{await browser.close()}
