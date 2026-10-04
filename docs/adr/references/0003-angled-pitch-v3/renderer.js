/* Documentation-only renderer. No dependency on the live match client. */
(function () {
  const scene = window.pitchReferenceScene;
  const svg = document.getElementById('pitch');
  const params = new URLSearchParams(location.search);
  const viewSelect = document.getElementById('view');
  const framingSelect = document.getElementById('framing');
  const panInput = document.getElementById('pan');
  const coordinateInput = document.getElementById('coordinates');
  const NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 1672, HEIGHT = 941, DISTANCE = 60;
  let baseAnchors = [], activeView, activeFraming, baseCamera, lastDrag = false;
  const scenery = window.pitchReferenceScenery;
  for (const view of scene.views) viewSelect.add(new Option(view.label, view.id));
  viewSelect.value = scene.views.some(v => v.id === params.get('view')) ? params.get('view') : scene.views[0].id;
  framingSelect.value = params.get('framing') === 'full' ? 'full' : 'play';
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
    const corners = [[0, 0], [26, 0], [26, 15], [0, 15]].map(([x, y]) => project(x, y, camera));
    const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
    if (framing === 'full') {
      // Keep every square and standing-sprite overhang between the approved HUD panels.
      camera.scale = Math.min((WIDTH - 360) / (maxX - minX), 560 / (maxY - minY));
      camera.cx = WIDTH / 2 - (minX + maxX) * camera.scale / 2;
      camera.cz = 449 - (minY + maxY) * camera.scale / 2;
    } else {
      // Fit all 15 columns with the same scenery margin at both pan extremes.
      // Reserve upright-sprite headroom for the shared midfield formation.
      const formationHeadroomScale = 320 / (3.5 * se + 1.08);
      camera.scale = Math.min((WIDTH - 460) / (maxX - minX), formationHeadroomScale);
      camera.cx = WIDTH / 2 - (minX + maxX) * camera.scale / 2;
      camera.cz = 445;
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
    return world.map(([x, y]) => { const p = project(x, y, camera); return `${p.x},${p.y}`; }).join(' ');
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
    const framing = framingSelect.value;
    panInput.disabled = framing === 'full';
    const focus = 13; // Build at midfield; one parent transform pans the whole world.
    const camera = cameraFor(view, framing, focus);
    document.getElementById('away-label').hidden = view.end !== 'away';
    svg.replaceChildren();
    const world = element('g', { id: 'world' });
    svg.append(world);
    world.append(makeTerrain(camera));
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
    world.append(ground);
    if (coordinateInput.checked) {
      const annotations = element('g', { id: 'square-coordinates', 'font-family': 'monospace', 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#f6f5da' });
      for (let x = 0; x < 26; x++) for (let y = 0; y < 15; y++) {
        const p = project(x + 0.5, y + 0.5, camera);
        annotations.append(element('text', { x: p.x, y: p.y + 3, 'font-size': framing === 'full' ? 7 : 10, stroke: '#102018', 'stroke-width': 1.5, 'paint-order': 'stroke' }, `${x},${y}`));
      }
      world.append(annotations);
    }
    const bodies = element('g', { id: 'occupants' });
    const occupants = scene.players.map(p => ({ ...p, kind: 'player' })).concat([{ ...scene.ball, id: 'ball', kind: 'ball' }]);
    for (let x = -12; x <= 38; x += 3) for (const side of ['blue', 'rust']) {
      occupants.push({ id: `stand-${side}-${x}`, kind: 'stand', x, y: side === 'blue' ? -2 : 16, side });
    }
    occupants.sort((a, b) => project(b.x + 0.5, b.y + 0.5, camera).depth - project(a.x + 0.5, a.y + 0.5, camera).depth || a.id.localeCompare(b.id));
    const anchors = [];
    for (const p of occupants) {
      const foot = project(p.x + 0.5, p.y + 0.5, camera);
      const group = element('g', { 'data-id': p.id, 'data-x': p.x, 'data-y': p.y, 'data-foot-x': foot.x, 'data-foot-y': foot.y });
      if (p.kind === 'stand') {
        addStand(group, p, foot, camera);
        bodies.append(group);
        continue;
      }
      const base = circle(p.x + 0.5, p.y + 0.5, p.kind === 'ball' ? 0.15 : 0.28, camera);
      group.append(element('polygon', { points: points(base, camera), fill: '#08120966' }));
      if (p.kind === 'player') {
        const facing = p.team === view.end ? 'back' : 'front';
        const key = `${p.hero ? 'alden' : p.team === 'home' ? 'human' : 'orc'}-${facing}`;
        const asset = window.pitchReferenceSprites.players.find(a => a.id === key);
        const spriteScale = camera.scale * foot.factor * 1.08 / asset.tileSize;
        // Reduction may drop faint source-alpha pixels. Align the visible artwork's
        // bottom edge, rather than leaving a blank gap above the export's baseline.
        const groundAnchorY = asset.bounds.y + asset.bounds.height;
        const spriteX = foot.x - asset.anchorX * spriteScale;
        const spriteY = foot.y - groundAnchorY * spriteScale;
        group.append(element('image', { href: `../0003-angled-pitch-v2/art/sprites/${asset.file}`, x: spriteX, y: spriteY,
          width: asset.width * spriteScale, height: asset.height * spriteScale, 'data-art': key,
          'data-anchor-x': asset.anchorX, 'data-anchor-y': groundAnchorY, 'data-sprite-scale': spriteScale }));
        if (coordinateInput.checked) {
          group.append(element('circle', { cx: foot.x, cy: foot.y, r: 2.4, fill: '#ffe17b' }));
          group.append(element('text', { x: foot.x, y: foot.y + 14, fill: '#ffe17b', stroke: '#101c2b', 'stroke-width': 3,
            'paint-order': 'stroke', 'font-family': 'monospace', 'font-size': 12, 'text-anchor': 'middle' }, `${p.id} (${p.x},${p.y})`));
        }
        anchors.push({ id: p.id, square: { x: p.x, y: p.y }, worldFeet: { x: p.x + 0.5, y: p.y + 0.5 },
          screenFeet: { x: foot.x, y: foot.y }, image: { x: spriteX, y: spriteY, scale: spriteScale, anchorX: asset.anchorX, anchorY: groundAnchorY }, asset: key });
      } else {
        // A schematic ball marker, anchored independently at the same square center.
        const size = camera.scale * foot.factor * 0.24;
        group.append(element('ellipse', { cx: foot.x, cy: foot.y - size * 0.45, rx: size * 0.34, ry: size * 0.65, fill: '#713d21', stroke: '#1c1713', 'stroke-width': Math.max(1, size * 0.08) }));
        group.append(element('path', { d: `M${foot.x - size * 0.18},${foot.y - size * 0.75}h${size * 0.36} M${foot.x},${foot.y - size * 0.98}v${size * 0.45}`,
          stroke: '#efdfb8', 'stroke-width': Math.max(1, size * 0.07), fill: 'none' }));
      }
      bodies.append(group);
    }
    world.append(bodies);
    baseAnchors = anchors; activeView = view; activeFraming = framing; baseCamera = camera;
    window.pitchReference = { scene, camera, anchors, project: (x, y) => project(x, y, camera),
      unproject: (x, y) => unproject(x, y, camera), cameraFor, projectWith: project, unprojectWith: unproject,
      render, export: () => ({ view: view.id, framing, camera: { elevation: view.elevation, yaw: view.yaw, end: view.end, perspective: view.perspective, distance: DISTANCE, focus: window.pitchReference.camera.focus, scale: camera.scale, center: { x: camera.cx, y: camera.cz }, worldPanY: Number(document.getElementById('world').dataset.panY) }, squares: 390, players: window.pitchReference.anchors, ball: scene.ball }) };
    document.title = `MUTP · ${view.label} · ${framing === 'full' ? '26 × 15' : 'width fit'}`;
    updatePan();
    window.pitchReferenceReady = Promise.all([...document.images].map(i => i.decode())).then(() => Promise.all([...svg.querySelectorAll('image')].map(async node => {
      const img = new Image(); img.src = node.getAttribute('href'); await img.decode();
    })));
  }
  for (const control of [viewSelect, framingSelect, coordinateInput]) control.addEventListener('change', render);
  panInput.addEventListener('input', updatePan);
  document.getElementById('center').addEventListener('click', () => { panInput.value = 13; updatePan(); });
  svg.addEventListener('click', event => {
    if (lastDrag) { lastDrag = false; return; }
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    const world = window.pitchReference.unproject(local.x, local.y);
    const x = Math.floor(world.x), y = Math.floor(world.y);
    document.getElementById('square-readout').textContent = x >= 0 && x < 26 && y >= 0 && y < 15 ? `Square (${x}, ${y}) · ${x === 0 || x === 25 ? 'end zone' : y < 4 || y >= 11 ? 'wide zone' : 'central zone'}` : 'Outside pitch · 26 × 15 · 390 squares';
  });

  function makeTerrain(c) {
    const group = element('g', { id: 'terrain', 'data-world-surface': 'turf-and-sidelines' });
    const matrix = `matrix(${c.orientation * c.scale} 0 0 ${-c.orientation * c.se * c.scale} ${c.cx - 7.5 * c.orientation * c.scale} ${c.cz + 13 * c.orientation * c.se * c.scale})`;
    group.setAttribute('transform', matrix);
    const defs = element('defs');
    const pattern = element('pattern', { id: 'turf-pattern', patternUnits: 'userSpaceOnUse', width: 6, height: 6 });
    pattern.append(element('image', { href: 'art/turf.png', width: 6, height: 6, preserveAspectRatio: 'none' }));
    defs.append(pattern); group.append(defs);
    // Scenery apron has no extra playing squares. It fills the viewport at both ends.
    group.append(element('rect', { x: -18, y: -18, width: 51, height: 62, fill: 'url(#turf-pattern)' }));
    for (const y of [-3, 15]) group.append(element('rect', { x: y, y: -12, width: 3, height: 53, fill: '#5e492b', opacity: 0.42 }));
    for (const y of [-0.16, 15.08]) {
      group.append(element('rect', { x: y, y: -12, width: 0.08, height: 53, fill: '#aca589', 'data-world-rail': y < 0 ? 'blue' : 'rust' }));
      group.append(element('rect', { x: y - 0.025, y: -12, width: 0.025, height: 53, fill: '#18231f' }));
    }
    return group;
  }
  function addStand(group, p, foot, c) {
    const asset = scenery[p.side + '-stand'];
    const imageScale = c.scale * 2.8 / asset.bounds.width;
    const anchorX = asset.bounds.x + asset.bounds.width / 2;
    const anchorY = asset.bounds.y + asset.bounds.height;
    const x = foot.x - anchorX * imageScale, y = foot.y - anchorY * imageScale;
    // The opposite end sees the same canonical team rail on the opposite screen side.
    const flip = c.end === 'away';
    const art = element('image', { href: 'art/' + p.side + '-stand.png', x, y,
      width: asset.width * imageScale, height: asset.height * imageScale,
      'data-world-scenery': p.id });
    if (flip) art.setAttribute('transform', `translate(${2 * foot.x} 0) scale(-1 1)`);
    group.append(art);
  }
  function updatePan() {
    if (!baseCamera || !window.pitchReference) return;
    const focus = activeFraming === 'full' ? 13 : Number(panInput.value);
    const dy = (focus - 13) * baseCamera.orientation * baseCamera.se * baseCamera.scale;
    const world = document.getElementById('world');
    world.setAttribute('transform', `translate(0 ${dy})`); world.dataset.panY = dy;
    const c = { ...baseCamera, focus };
    const api = window.pitchReference;
    api.camera = c;
    api.project = (x, y) => project(x, y, c);
    api.unproject = (x, y) => unproject(x, y, c);
    api.anchors = baseAnchors.map(a => ({ ...a, screenFeet: { x: a.screenFeet.x, y: a.screenFeet.y + dy },
      image: { ...a.image, y: a.image.y + dy } }));
  }
  function setPan(value) {
    if (activeFraming === 'full') return;
    panInput.value = Math.max(0, Math.min(26, value)); updatePan();
  }
  svg.addEventListener('wheel', event => {
    if (activeFraming === 'full') return;
    event.preventDefault();
    const cssScale = svg.getBoundingClientRect().height / HEIGHT;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? HEIGHT : 1);
    setPan(Number(panInput.value) - pixels / cssScale / (baseCamera.orientation * baseCamera.se * baseCamera.scale));
  }, { passive: false });
  document.getElementById('stage').addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setPan(Number(panInput.value) + (event.key === 'ArrowUp' ? 1 : -1) * baseCamera.orientation);
  });
  let drag;
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 || activeFraming === 'full') return;
    drag = { y: event.clientY, focus: Number(panInput.value) }; lastDrag = false;
    svg.setPointerCapture(event.pointerId); svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', event => {
    if (!drag) return;
    const delta = event.clientY - drag.y;
    if (Math.abs(delta) > 4) lastDrag = true;
    const cssScale = svg.getBoundingClientRect().height / HEIGHT;
    setPan(drag.focus + delta / cssScale / (baseCamera.orientation * baseCamera.se * baseCamera.scale));
  });
  function stopDrag() { drag = undefined; svg.classList.remove('dragging'); }
  svg.addEventListener('pointerup', stopDrag); svg.addEventListener('pointercancel', stopDrag);

  render();
}());
