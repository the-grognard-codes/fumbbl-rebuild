/* Reference art composition only. Each face is explicit; there is no random roll. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const sets = [
    { id: 'ivory-cyan', name: 'Ivory & cyan', description: 'Bone faces, gold bevels and a cyan seam.', ink: '#14283e', faceColor: '#f4e2bd', center: [56,70] },
    { id: 'navy-steel', name: 'Navy steel', description: 'Navy lacquer, cyan edges and gold corner studs.', ink: '#79e6f4', faceColor: '#0b2146', center: [56,68] },
    { id: 'gilded-brass', name: 'Gilded brass', description: 'Warm gold faces with navy corner insets.', ink: '#11263e', faceColor: '#ebbf5e', center: [56,71] }
  ];
  // Matches the six-face distribution in browser-client/src/dice-presentation.ts.
  const blockFaces = ['SKULL','BOTH DOWN','PUSHBACK','PUSHBACK','POW/PUSH','POW'];
  const labels = ['Skull','Both down','Push','Push','Stumble','Pow'];
  const pips = [ [[8,8]], [[4,4],[12,12]], [[4,4],[8,8],[12,12]],
    [[4,4],[12,4],[4,12],[12,12]], [[4,4],[12,4],[8,8],[4,12],[12,12]],
    [[4,3],[12,3],[4,8],[12,8],[4,13],[12,13]] ];
  const skull = 'M5 2H11V3H13V5H14V10H12V12H11V15H5V12H4V10H2V5H3V3H5Z M4 6V9H7V6Z M9 6V9H12V6Z M7 10V12H9V10Z M6 13V15H7V13Z M9 13V15H10V13Z';
  const burst = 'M7 0H10L11 4L15 2L13 6L16 8L12 10L14 14L10 12L8 16L6 12L2 14L4 10L0 8L4 6L2 2L6 4Z';
  function node(tag, attrs = {}) {
    const result = document.createElementNS(NS, tag);
    for (const [key,value] of Object.entries(attrs)) result.setAttribute(key, value);
    return result;
  }
  function die(setId, kind, value) {
    const set = sets.find(s => s.id === setId);
    const svg = node('svg', { viewBox: '18 18 88 88', role: 'img', class: 'die', 'aria-label': `${set.name} ${kind === 'block' ? 'block die: ' + labels[value-1] : 'd6: ' + value}` });
    svg.dataset.set = setId; svg.dataset.kind = kind; svg.dataset.value = value;
    svg.dataset.face = kind === 'block' ? blockFaces[value-1] : String(value);
    svg.append(node('image', { href: `art/${setId}-v1.png`, width: 128, height: 128 }));
    const mark = node('g', { transform: `translate(${set.center[0]-18} ${set.center[1]-18}) scale(2.25)`, fill: set.ink, 'shape-rendering': 'crispEdges' });
    if (kind === 'd6') {
      for (const [x,y] of pips[value-1]) mark.append(node('path', { d: `M${x-1},${y-1.5}h2l.5,.5v2l-.5,.5h-2l-.5,-.5v-2z`, 'data-pip': '' }));
    } else {
      const face = blockFaces[value-1];
      if (face === 'SKULL') mark.append(node('path', { d: skull, 'fill-rule': 'evenodd' }));
      if (face === 'BOTH DOWN') {
        mark.append(node('path', { d: burst }));
        mark.append(node('path', { d: skull, 'fill-rule': 'evenodd', fill: set.faceColor, transform: 'translate(2 2) scale(.75)' }));
      }
      if (face === 'PUSHBACK') mark.append(node('path', { d: 'M1 6H9V2L16 8L9 14V10H1Z' }));
      if (face === 'POW' || face === 'POW/PUSH') mark.append(node('path', { d: burst }));
      if (face === 'POW/PUSH') mark.append(node('path', { d: 'M4 7H8V4L12 8L8 12V9H4Z', fill: set.faceColor }));
    }
    svg.append(mark); return svg;
  }
  window.mutpDice = { sets, blockFaces, labels, pips, die };
}());
