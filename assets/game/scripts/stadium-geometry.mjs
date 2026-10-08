/** Shared authoring contract, in canonical pitch squares. */
export function validateStadiumGeometry(g) {
  const require = (ok, message) => { if (!ok) throw Error('Modular stadium geometry: ' + message); };
  require(g.pitch.length === 26 && g.pitch.width === 15 && g.apron === 2, 'pitch and apron differ from approved layout');
  require(JSON.stringify(g.outer) === JSON.stringify({x:[-6,32],y:[-6,21]}), 'outer bowl must be 38 by 27');
  const portals = [
    {id:'home-locker',side:'north',team:'home',x:6,y:-2,span:2.4},
    {id:'away-locker',side:'south',team:'away',x:20,y:17,span:2.4},
  ];
  require(g.lockerRooms.length === 2 && portals.every(expected => g.lockerRooms.some(actual =>
    Object.entries(expected).every(([key,value]) => actual[key] === value))), 'exactly one approved portal per sideline is required');
  require(g.partitions.length === 2 && [[-6,-2],[17,21]].every(([y0,y1]) =>
    g.partitions.some(p => p.x === 13 && p.y0 === y0 && p.y1 === y1)), 'midfield partitions must stay inside both stands');
  require(g.benches.length === 2 && ['home','away'].every(team => g.benches.filter(b => b.team === team).length === 1), 'one bench per team is required');
  for (const item of [...g.benches,g.pavilion]) {
    require([item.x,item.y,item.along,item.across].every(Number.isFinite) && item.along > 0 && item.across > 0, 'furniture footprint must be positive and finite');
    const x0=item.x-item.along/2, x1=item.x+item.along/2, y0=item.y-item.across/2, y1=item.y+item.across/2;
    require(x0 >= -6 && x1 <= 32 && y0 >= -6 && y1 <= 21, 'furniture must fit inside the shared bowl');
    require(item.side === 'north' ? y1 <= -2 : item.side === 'south' && y0 >= 17, 'furniture must leave the two-square apron clear');
    for (const portal of g.lockerRooms) if (portal.side === item.side)
      require(x1 <= portal.x-portal.span/2 || x0 >= portal.x+portal.span/2, 'furniture must leave the locker passage clear');
  }
}
