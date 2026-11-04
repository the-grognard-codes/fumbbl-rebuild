import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '../../../browser-client/node_modules/playwright/index.mjs';
const root='assets/game/team-colors/trials/helmet-redesign-v1';
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
const page=await browser.newPage();
for(const roster of ['human','orc'])for(const kind of ['generated','reference']){
const raw=await readFile(root+'/sources/'+roster+'-'+kind+'.png');
const png=await page.evaluate(async base64=>{
 const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
 const full=document.createElement('canvas');full.width=img.width;full.height=img.height;
 const fc=full.getContext('2d');fc.drawImage(img,0,0);const d=fc.getImageData(0,0,full.width,full.height);
 let left=img.width,top=img.height,right=0,bottom=0;
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;if(d.data[i+3]<=8)d.data.fill(0,i,i+4);else {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}}
 fc.putImageData(d,0,0);
 const c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d');
 const w=right-left+1,h=bottom-top+1,scale=300/Math.max(w,h);ctx.drawImage(full,left,top,w,h,(320-w*scale)/2,(320-h*scale)/2,w*scale,h*scale);
 return c.toDataURL().split(',')[1];
},raw.toString('base64'));
await writeFile(root+'/sources/'+roster+'-'+kind+'-320.png',Buffer.from(png,'base64'));
}
}finally{await browser.close()}
