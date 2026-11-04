import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '../../../browser-client/node_modules/playwright/index.mjs';
const root='assets/game/team-colors/trials/roster-bust-redesign-v1';
const report=JSON.parse(await readFile(`${root}/validation.json`));
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{const page=await browser.newPage({viewport:{width:940,height:1000}});for(const roster of ['human','orc']){
 let html=`<style>body{background:#17221c;color:white;font:14px sans-serif;margin:20px}.row{display:flex;gap:16px}img{width:160px;height:160px;image-rendering:pixelated}h2{font-size:16px}</style><h1>${roster} — new portraits at native size</h1>`;
 for(const {id}of report.filter(r=>r.id.startsWith(roster))){html+=`<h2>${id}</h2><div class="row">`;for(const [key,label]of [['reference','Existing reference'],['original','New team palette'],['contrast','Magenta / Lime'],['blackwhite','Black / White'],['mask','Material mask']]){const data=await readFile(`${root}/${id}-${key}.png`);html+=`<section><p>${label}</p><img src="data:image/png;base64,${data.toString('base64')}"></section>`;}html+='</div>';}await page.setContent(html);await page.screenshot({path:`${root}/${roster}-overview.png`,fullPage:true});
}}finally{await browser.close()}
