import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readRgbaPng,isolatedBounds} from '../../../scripts/png-art.mjs';
const roles=['stone','timber','gate','gateTop','crowd','crowdSide','crowdTop','banner','bench','benchTop','pavilion','pavilionTop','mugs','torch','torchTop','pennant','crowdBack','crowdSideReverse','fanRest','fanCheer'];
function measure(image){
  const seen=new Uint8Array(image.width*image.height),components=[],mains=new Map();
  const opaque=i=>image.rgba[i*4+3]>=32;
  for(let i=0;i<seen.length;i++){
    if(seen[i]||!opaque(i))continue;
    const todo=[i];seen[i]=1;let x0=image.width,y0=image.height,x1=-1,y1=-1,count=0;
    while(todo.length){
      const q=todo.pop(),x=q%image.width,y=Math.floor(q/image.width);count++;
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const n of [x?q-1:-1,x+1<image.width?q+1:-1,y?q-image.width:-1,y+1<image.height?q+image.width:-1])
        if(n>=0&&!seen[n]&&opaque(n)){seen[n]=1;todo.push(n);}
    }
    const component={x0,y0,x1,y1,count};components.push(component);
    const slot=Math.min(4,Math.floor((y0+y1)/2/image.height*5))*4+Math.min(3,Math.floor((x0+x1)/2/image.width*4));
    if(count>=500&&(!mains.has(slot)||mains.get(slot).count<count))mains.set(slot,component);
  }
  if(mains.size!==20)throw Error('Expected 20 distinct original assets');
  const bounds=new Map([...mains].map(([slot,c])=>[slot,{...c}]));
  for(const c of components){
    const center={x:(c.x0+c.x1)/2,y:(c.y0+c.y1)/2};
    let best=-1,distance=Infinity;
    for(const [slot,main]of mains){
      const d=Math.hypot(Math.max(main.x0-center.x,0,center.x-main.x1),Math.max(main.y0-center.y,0,center.y-main.y1));
      if(d<distance){distance=d;best=slot;}
    }
    const b=bounds.get(best);b.x0=Math.min(b.x0,c.x0);b.y0=Math.min(b.y0,c.y0);b.x1=Math.max(b.x1,c.x1);b.y1=Math.max(b.y1,c.y1);
  }
  const cells={};
  for(let i=0;i<20;i++){
    const b=bounds.get(i),pad=Math.ceil(Math.min(b.x1-b.x0+1,b.y1-b.y0+1)/26)+2;
    const box={x:b.x0-pad,y:b.y0-pad,width:b.x1-b.x0+1+2*pad,height:b.y1-b.y0+1+2*pad};
    if(box.x<0||box.y<0||box.x+box.width>image.width||box.y+box.height>image.height)throw Error('Asset lacks original external gutter');
    const measured=isolatedBounds(image,box,roles[i]);
    if(measured.x!==b.x0||measured.y!==b.y0||measured.width!==b.x1-b.x0+1||measured.height!==b.y1-b.y0+1)
      throw Error('Neighbor pixels enter measured region: '+roles[i]);
    cells[roles[i]]=box;
  }
  return cells;
}
const entries=JSON.parse(process.argv[2]),root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('modular-catalog.json',root),'utf8'));
for(const entry of entries){
  const target=new URL(entry.atlas,root);await copyFile(entry.source,target);
  const image=await readRgbaPng(target),cells=measure(image);
  catalog.atlases.find(p=>p.id===entry.id).cells=cells;
  const bytes=await readFile(target);
  await writeFile(new URL(entry.provenance,root),JSON.stringify({profile:entry.id,tool:'built-in image_gen.imagegen',intent:'Source-faithful modular crowd/structure/prop authoring',prompt:entry.prompt,references:entry.references,
    pixels:image.width+' x '+image.height,sha256:createHash('sha256').update(bytes).digest('hex'),
    regionMethod:'Read-only connected alpha-component measurement of original output; per-asset transparent frames preserve pixels despite nonuniform rows/columns. No pixel cropping, resizing or background editing.'},null,2)+'\n');
  console.log(entry.id,image.width,image.height,'20 original regions validated');
}
await writeFile(new URL('modular-catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
