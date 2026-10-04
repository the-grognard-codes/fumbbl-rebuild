/* Documentation-only renderer. No dependency on the live match client. */
(function () {
  const scene = window.pitchReferenceScene;
  const svg = document.getElementById('pitch');
  const params = new URLSearchParams(location.search);
  const viewSelect = document.getElementById('view');
  // Whole-pitch captures remain internal geometry evidence, outside the review UI.
  const framing = params.get('capture') === '1' && params.get('framing') === 'full' ? 'full' : 'play';
  const panInput = document.getElementById('pan');
  const coordinateInput = document.getElementById('coordinates');
  const NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 1672, HEIGHT = 941;
  // Calibrate the restored illustration's inner rails at (285,0) and (0,941).
  // The rail lies 1.5 squares outside the touchline; both share the same vanishing point.
  const REFERENCE_ELEVATION = 55 * Math.PI / 180;
  const DISTANCE = (1 / Math.tan(REFERENCE_ELEVATION)) / ((836 - 551) / (9 * HEIGHT));
  const REFERENCE_SCALE = 551 / 9 + 445 * (836 - 551) / (9 * HEIGHT);
  const NEAR = 0.5;
  let lastDrag = false, drag, lastPerspectiveView = 'perspective-40-home';
  const imageReady = new Image(); imageReady.src = '../0003-angled-pitch-v2/art/stadium.png';
  const stadiumReady = imageReady.decode();
  for (const view of scene.views) viewSelect.add(new Option(view.label, view.id));
  viewSelect.value = scene.views.some(v => v.id === params.get('view')) ? params.get('view') : scene.views[0].id;
  panInput.value = params.has('pan') ? Math.max(0, Math.min(26, Number(params.get('pan')) || 0)) : 13;
  coordinateInput.checked = params.get('coordinates') === '1';
  if (params.get('capture') === '1') document.body.classList.add('capture');

  function element(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function cameraFor(view, framing, focus) {
    const elevation = view.elevation * Math.PI / 180, yaw = view.yaw * Math.PI / 180;
    const se = Math.sin(elevation), ce = Math.cos(elevation), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const orientation = view.end === 'away' ? -1 : 1;
    const camera = { ...view, framing, focus, se, ce, sy, cy, orientation, scale: 1, cx: 0, cz: 0 };
    // Width fit fixes the lens for a preset, independent of which rows remain on the pitch.
    // Perspective width at screen y is 15 * (scale + (y-cz)*cot(elevation)/distance).
    camera.cx = WIDTH / 2; camera.cz = 445;
    camera.scale = Math.min(REFERENCE_SCALE, (WIDTH - 250) / 15 - (HEIGHT - camera.cz) / Math.tan(elevation) / DISTANCE);
    if (!view.perspective) {
      // A square overhead grid keeps the same north–south axis and HUD headroom.
      camera.scale = Math.min((WIDTH - 460) / 15, 320 / (3.5 * se + 1.08));
    }
    if (framing === 'full') {
      const base = { ...camera, focus: 13, scale: 1, cx: 0, cz: 0 };
      const corners = [[0,0],[26,0],[26,15],[0,15]].map(([x,y]) => project(x,y,base));
      const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
      const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
      camera.scale=Math.min((WIDTH-360)/(maxX-minX),560/(maxY-minY));
      camera.cx=WIDTH/2-(minX+maxX)*camera.scale/2;
      camera.cz=449-(minY+maxY)*camera.scale/2;
    }
    return camera;
  }
  function project(x, y, c) {
    const dx = (x - c.focus) * c.orientation, dy = (y - 7.5) * c.orientation;
    const along = dx * c.cy + dy * c.sy, across = -dx * c.sy + dy * c.cy;
    const depth = DISTANCE + along * c.ce;
    const factor = c.perspective ? DISTANCE / depth : 1;
    return { x: c.cx + across * c.scale * factor, y: c.cz - along * c.se * c.scale * factor, depth, factor };
  }
  function unproject(screenX, screenY, c) {
    const vertical = (c.cz - screenY) / c.scale;
    const along = c.perspective ? vertical * DISTANCE / (c.se * DISTANCE - vertical * c.ce) : vertical / c.se;
    const factor = c.perspective ? DISTANCE / (DISTANCE + along * c.ce) : 1;
    const across = (screenX - c.cx) / c.scale / factor;
    return { x: c.focus + (along * c.cy - across * c.sy) * c.orientation,
      y: 7.5 + (along * c.sy + across * c.cy) * c.orientation };
  }
  function points(world, camera) {
    return clipNear(world, camera).map(([x,y]) => { const p=project(x,y,camera); return [p.x,p.y].join(','); }).join(' ');
  }
  function squareCorners(x, y, inset = 0) {
    return [[x + inset, y + inset], [x + 1 - inset, y + inset], [x + 1 - inset, y + 1 - inset], [x + inset, y + 1 - inset]];
  }
  function path(world, camera, attrs) {
    return element('polyline', { points: points(world, camera), fill: 'none', ...attrs });
  }
  function circle(x, y, radius, camera) {
    return Array.from({ length: 33 }, (_, i) => [x + Math.cos(i * Math.PI / 16) * radius, y + Math.sin(i * Math.PI / 16) * radius]);
  }
  function render() {
    const view = scene.views.find(v => v.id === viewSelect.value);
    if (view.perspective) lastPerspectiveView = view.id;
    const toggle = document.getElementById('toggle-tactical');
    toggle.setAttribute('aria-pressed', String(!view.perspective));
    toggle.textContent = view.perspective ? 'Top-down view' : 'Perspective view';
    panInput.disabled = framing === 'full';
    const focus = framing === 'full' ? 13 : Number(panInput.value);
    const camera = cameraFor(view, framing, focus);
    renderStadium(camera);
    svg.replaceChildren();
    const ground = element('g', { id: 'ground' });
    for (let x = 0; x < scene.length; x++) for (let y = 0; y < scene.width; y++) {
      const zone = x === 0 || x === 25 ? 'end-zone' : y < 4 || y >= 11 ? 'wide' : 'central';
      ground.append(element('polygon', { class: 'square', 'data-x': x, 'data-y': y, 'data-zone': zone,
        points: points(squareCorners(x, y), camera),
        fill: x === 0 ? '#37669166' : x === 25 ? '#874a2d66' : (x + y) % 2 ? '#18392222' : '#b1c46a0b',
        stroke: '#21371e', 'stroke-opacity': 0.50, 'stroke-width': framing === 'full' ? 0.65 : 1.1 }));
    }
    const chalk = { stroke: '#f0eed2', 'stroke-width': framing === 'full' ? 1.8 : 3, 'stroke-opacity': 0.84, 'stroke-linejoin': 'round' };
    ground.append(path([[0, 0], [26, 0], [26, 15], [0, 15], [0, 0]], camera, { ...chalk, 'data-marking': 'boundary' }));
    for (const x of [1, 13, 25]) ground.append(path([[x, 0], [x, 15]], camera, { ...chalk, 'data-marking': x === 13 ? 'midfield' : 'end-zone' }));
    for (const y of [4, 11]) for (let x = 0; x < 26; x += 0.8) {
      ground.append(path([[x, y], [Math.min(26, x + 0.42), y]], camera, { ...chalk, 'stroke-width': framing === 'full' ? 1.4 : 2.5, 'data-marking': 'wide-zone' }));
    }
    const selected = scene.players.find(p => p.id === scene.selected);
    ground.append(element('polygon', { points: points(squareCorners(selected.x, selected.y, 0.06), camera),
      fill: '#36ddff18', stroke: '#36ddff', 'stroke-width': framing === 'full' ? 2.5 : 4, 'data-selection': selected.id }));
    // Invisible registration lines expose the crowd rail geometry to the verifier.
    for (const y of [-1.5,16.5]) ground.append(path([[-30,y],[56,y]],camera,{ 'data-crowd-rail':y, stroke:'none' }));
    svg.append(ground);
    if (coordinateInput.checked) {
      const annotations = element('g', { id: 'square-coordinates', 'font-family': 'monospace', 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#f6f5da' });
      for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) {
        const p = project(x + 0.5, y + 0.5, camera);
        if (p.depth < NEAR) continue;
        annotations.append(element('text', { x: p.x, y: p.y + 3, 'font-size': framing === 'full' ? 7 : 10, stroke: '#102018', 'stroke-width': 1.5, 'paint-order': 'stroke' }, `${x},${y}`));
      }
      svg.append(annotations);
    }
    const bodies = element('g', { id: 'occupants' });
    const occupants = scene.players.map(p => ({ ...p, kind: 'player' })).concat([{ ...scene.ball, id: 'ball', kind: 'ball' }]);
    occupants.sort((a, b) => project(b.x + 0.5, b.y + 0.5, camera).depth - project(a.x + 0.5, a.y + 0.5, camera).depth || a.id.localeCompare(b.id));
    const anchors = [];
    for (const p of occupants) {
      const center = project(p.x + 0.5, p.y + 0.5, camera);
      const group = element('g', { 'data-id': p.id, 'data-x': p.x, 'data-y': p.y, 'data-center-x': center.x, 'data-center-y': center.y, visibility: center.depth < NEAR ? 'hidden' : 'visible' });
      if (p.kind === 'player') {
        group.setAttribute('data-player-id', p.id);
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'img');
        group.setAttribute('aria-label', p.hero ? 'Alden, blitzer' : `${p.team === 'home' ? 'Ironbank' : 'Cinderclaw'} player ${p.number}`);
      }
      const base = circle(p.x + 0.5, p.y + 0.5, p.kind === 'ball' ? 0.15 : 0.28, camera);
      group.append(element('polygon', { points: points(base, camera), fill: '#08120966' }));
      if (p.kind === 'player') {
        const facing = p.team === view.end ? 'back' : 'front';
        const key = `${p.hero ? 'alden' : p.team === 'home' ? 'human' : 'orc'}-${facing}`;
        const asset = window.pitchReferenceSprites.players.find(a => a.id === key);
        const spriteScale = camera.scale * center.factor * 1.08 / asset.tileSize;
        // Perspective grounds the visible feet at the cell center. Tactical overhead
        // centers the artwork's alpha bounds, so the body sits within its own square.
        const anchorX = view.perspective ? asset.anchorX : asset.bounds.x + asset.bounds.width / 2;
        const anchorY = asset.bounds.y + asset.bounds.height * (view.perspective ? 1 : 0.5);
        const anchorMode = view.perspective ? 'feet' : 'visual-center';
        const spriteX = center.x - anchorX * spriteScale;
        const spriteY = center.y - anchorY * spriteScale;
        group.append(element('image', { href: `../0003-angled-pitch-v2/art/sprites/${asset.file}`, x: spriteX, y: spriteY,
          width: asset.width * spriteScale, height: asset.height * spriteScale, 'data-art': key,
          'data-anchor-x': anchorX, 'data-anchor-y': anchorY, 'data-anchor-mode': anchorMode, 'data-sprite-scale': spriteScale }));
        if (coordinateInput.checked) {
          group.append(element('circle', { cx: center.x, cy: center.y, r: 2.4, fill: '#ffe17b' }));
          group.append(element('text', { x: center.x, y: center.y + 14, fill: '#ffe17b', stroke: '#101c2b', 'stroke-width': 3,
            'paint-order': 'stroke', 'font-family': 'monospace', 'font-size': 12, 'text-anchor': 'middle' }, `${p.id} (${p.x},${p.y})`));
        }
        anchors.push({ id: p.id, square: { x: p.x, y: p.y }, worldCenter: { x: p.x + 0.5, y: p.y + 0.5 },
          screenCenter: { x: center.x, y: center.y }, image: { x: spriteX, y: spriteY, scale: spriteScale, anchorX, anchorY, anchorMode }, asset: key });
      } else {
        // A schematic ball marker, anchored independently at the same square center.
        const size = camera.scale * center.factor * 0.24;
        group.append(element('ellipse', { cx: center.x, cy: center.y - size * 0.45, rx: size * 0.34, ry: size * 0.65, fill: '#713d21', stroke: '#1c1713', 'stroke-width': Math.max(1, size * 0.08) }));
        group.append(element('path', { d: `M${center.x - size * 0.18},${center.y - size * 0.75}h${size * 0.36} M${center.x},${center.y - size * 0.98}v${size * 0.45}`,
          stroke: '#efdfb8', 'stroke-width': Math.max(1, size * 0.07), fill: 'none' }));
      }
      bodies.append(group);
    }
    svg.append(bodies);
    window.pitchReference = { scene, camera, anchors, project: (x, y) => project(x, y, camera),
      unproject: (x, y) => unproject(x, y, camera), cameraFor, projectWith: project, unprojectWith: unproject,
      render, sceneryRegistration, export: () => ({ view: view.id, framing, camera: { elevation: view.elevation, yaw: view.yaw, end: view.end, perspective: view.perspective, distance: DISTANCE, height: DISTANCE * camera.se, focalPixels: view.perspective ? DISTANCE * camera.scale : null, vanishingPoint: view.perspective ? { x: camera.cx, y: camera.cz - camera.scale * DISTANCE * Math.tan(view.elevation * Math.PI / 180) } : null, focus, scale: camera.scale, center: { x: camera.cx, y: camera.cz } }, squares: 390, players: anchors, ball: scene.ball }) };
    document.title = `MUTP · ${view.label} · ${framing === 'full' ? '26 × 15' : 'width fit'}`;
    window.pitchReferenceReady = Promise.all([stadiumReady, document.fonts.ready, ...[...document.images].filter(i => i.getAttribute('src')).map(i => i.decode())]).then(() => Promise.all([...new Set([...document.querySelectorAll('svg image')].map(node => node.getAttribute('href')))].map(async source => {
      const img = new Image(); img.src = source; await img.decode();
    })));
    window.dispatchEvent(new Event('pitch-reference-render'));
  }
  for (const control of [viewSelect, coordinateInput]) control.addEventListener('change', render);
  document.getElementById('toggle-tactical').addEventListener('click', () => {
    const current = scene.views.find(v => v.id === viewSelect.value);
    if (current.perspective) viewSelect.value = `top-down-${current.end}`;
    else {
      const previous = scene.views.find(v => v.id === lastPerspectiveView && v.end === current.end);
      viewSelect.value = previous ? previous.id : `perspective-40-${current.end}`;
    }
    render();
  });
  panInput.addEventListener('input', render);
  document.getElementById('center').addEventListener('click', () => { panInput.value = 13; render(); });
  svg.addEventListener('click', event => {
    if(lastDrag){lastDrag=false;return;}
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    const world = window.pitchReference.unproject(local.x, local.y);
    const x = Math.floor(world.x), y = Math.floor(world.y);
    document.getElementById('square-readout').textContent = x >= 0 && x < 26 && y >= 0 && y < 15 ? `Square (${x}, ${y}) · ${x === 0 || x === 25 ? 'end zone' : y < 4 || y >= 11 ? 'wide zone' : 'central zone'}` : 'Outside pitch · 26 × 15 · 390 squares';
  });

  function clipNear(world,c) {
    if (!world.length) return world;
    const output=[];
    for(let i=0;i<world.length;i++) {
      const a=world[i],b=world[(i+1)%world.length];
      const da=project(a[0],a[1],c).depth-NEAR,db=project(b[0],b[1],c).depth-NEAR;
      if(da>=0)output.push(a);
      if((da<0)!==(db<0)){const t=da/(da-db);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
    return output;
  }
  function multiply(a,b) {
    return a.map((row,i)=>b[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*b[k][j],0)));
  }
  function referenceCamera(end) {
    return { ...cameraFor({elevation:55,yaw:0,perspective:true,end},'play',13),scale:REFERENCE_SCALE,cx:836,cz:445 };
  }
  function inversePlateMatrix(c,offset) {
    const w=c.scale*c.se*DISTANCE-c.cz*c.ce, o=c.orientation, f=c.focus+offset;
    return [[0,f*c.ce-o*DISTANCE,f*w+o*DISTANCE*c.cz],
      [o*DISTANCE*c.se,7.5*c.ce,7.5*w-o*DISTANCE*c.se*c.cx],
      [0,c.ce,w]];
  }
  function projectionMatrix(c) {
    if (!c.perspective) {
      const s = c.scale, o = c.orientation;
      return [[0,o*s,c.cx-o*s*7.5],[-o*s*c.se,0,c.cz+o*s*c.se*c.focus],[0,0,1]];
    }
    const o=c.orientation,s=c.scale*DISTANCE,k=DISTANCE-o*c.focus*c.ce;
    return [[c.cx*o*c.ce,o*s,c.cx*k-o*s*7.5],
      [o*(c.cz*c.ce-s*c.se),0,c.cz*k+o*s*c.se*c.focus],
      [o*c.ce,0,k]];
  }
  function cssMatrix(h) {
    const n=Math.abs(h[2][2])||1;
    const m=[h[0][0],h[1][0],0,h[2][0],h[0][1],h[1][1],0,h[2][1],0,0,n,0,h[0][2],h[1][2],0,h[2][2]].map(v=>v/n);
    return { css:'matrix3d('+m.join(',')+')', values:m };
  }
  function sceneryRegistration(sourceX,sourceY,offset,c) {
    const ref=referenceCamera(c.end), p=unproject(sourceX,sourceY,ref);
    const world={x:p.x+offset,y:p.y};
    return {world,screen:project(world.x,world.y,c)};
  }
  function renderStadium(c) {
    const ref=referenceCamera(c.end);
    const a=unproject(0,0,ref).x,b=unproject(0,HEIGHT,ref).x,period=Math.abs(a-b)*0.5;
    const top=unproject(836,0,c).x,bottom=unproject(836,HEIGHT,c).x;
    const lo=Math.min(top,bottom),hi=Math.max(top,bottom);
    const plates=[];
    for(let i=-8;i<=8;i++) {
      const offset=i*period;
      if(Math.max(a,b)+offset<lo || Math.min(a,b)+offset>hi)continue;
      const plate=document.createElement('div');plate.className='stadium-plate';plate.dataset.worldOffset=offset;
      const transform=cssMatrix(multiply(projectionMatrix(c),inversePlateMatrix(ref,offset)));
      if(window.CSSMatrixComponent && plate.attributeStyleMap) {
        plate.attributeStyleMap.set('transform',new CSSTransformValue([new CSSMatrixComponent(new DOMMatrix(transform.values))]));
      } else plate.style.transform=transform.css;
      // Continue the crowd outside the source frame with a native SVG texture crop.
      // The source artwork itself stays unchanged. Overlapping plates soften seams.
      const strip=document.createElement('div');strip.className='stadium-strip';
      for(const side of [-1,0,1]) {
        if(side!==0) {
          const bank=element('svg',{width:WIDTH,height:HEIGHT,viewBox:`0 0 ${WIDTH} ${HEIGHT}`});
          bank.style.position='absolute';bank.style.left=((side+1)*WIDTH)+'px';
          const defs=element('defs'),pattern=element('pattern',{id:`crowd-${i}-${side}`,patternUnits:'userSpaceOnUse',width:128,height:84});
          const crop=element('svg',{width:128,height:84,viewBox:'0 0 180 118',preserveAspectRatio:'none'});
          crop.append(element('image',{href:'../0003-angled-pitch-v2/art/stadium.png',width:WIDTH,height:HEIGHT}));
          pattern.append(crop);defs.append(pattern);bank.append(defs);
          bank.append(element('rect',{width:WIDTH,height:HEIGHT,fill:`url(#crowd-${i}-${side})`}));
          strip.append(bank);continue;
        }
        const img=document.createElement('img');img.src='../0003-angled-pitch-v2/art/stadium.png';img.alt='';
        img.style.left=((side+1)*WIDTH)+'px';
        if(c.end==='away')img.style.transform='scaleX(-1)';
        strip.append(img);
      }
      plate.append(strip);
      plates.push(plate);
    }
    plates.sort((a,b)=>c.orientation*(Number(b.dataset.worldOffset)-Number(a.dataset.worldOffset)));
    const layer=document.getElementById('stadium-world');
    layer.replaceChildren(...plates);
    // The full-pitch companion is a counting/geometry view. Crop its source artwork
    // to the finite playing surface, rather than stretching the illustrated stands
    // across the large empty margins produced by this explicit overview lens.
    layer.style.clipPath=c.framing==='full'?'polygon('+[[0,0],[26,0],[26,15],[0,15]].map(([x,y])=>{
      const p=project(x,y,c);return p.x+'px '+p.y+'px';
    }).join(',')+')':'';
  }
  function resizeFrame() {
    const width=document.getElementById('stage').getBoundingClientRect().width;
    document.getElementById('camera-frame').style.transform='scale('+width/WIDTH+')';
  }
  new ResizeObserver(resizeFrame).observe(document.getElementById('stage'));resizeFrame();
  function setPan(value) {
    if(framing==='full')return;
    panInput.value=Math.max(0,Math.min(26,value));render();
  }
  svg.addEventListener('wheel',event=>{
    if(framing==='full')return;
    event.preventDefault();
    const c=window.pitchReference.camera,cssScale=svg.getBoundingClientRect().height/HEIGHT;
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?HEIGHT:1)/cssScale;
    const target=unproject(c.cx,c.cz+pixels,c);
    setPan(Number(panInput.value)+target.x-c.focus);
  },{passive:false});
  document.getElementById('stage').addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select,button'))return;
    if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
    event.preventDefault();setPan(Number(panInput.value)+(event.key==='ArrowUp'?1:-1)*window.pitchReference.camera.orientation);
  });
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0||framing==='full')return;
    const c=window.pitchReference.camera;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    drag={world:unproject(p.x,p.y,c),focus:c.focus};lastDrag=false;svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove',event=>{
    if(!drag)return;
    const c={...window.pitchReference.camera,focus:drag.focus};
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const world=unproject(p.x,p.y,c),delta=drag.world.x-world.x;
    if(Math.abs(delta)>0.08)lastDrag=true;
    setPan(drag.focus+delta);
  });
  function stopDrag(){drag=undefined;svg.classList.remove('dragging');}
  svg.addEventListener('pointerup',stopDrag);svg.addEventListener('pointercancel',stopDrag);
  render();
}());
