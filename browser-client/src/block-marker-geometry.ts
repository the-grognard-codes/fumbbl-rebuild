import type { Point } from './pitch-projection.ts';

export type BlockMarkerKind = 'block' | 'offense' | 'defense';
export type MarkerLine = { path: string; style: string; phase?: string; side?: string };
export type BlockMarkerGeometry = { lines: MarkerLine[]; flare?: Point; radius?: number };
type Vertex = [number, number];

/** Approved C2 ground geometry. Projection changes coordinates, never shape connectivity. */
export function blockMarkerGeometry(kind: BlockMarkerKind, from: Point, to: Point, project: (point: Point) => Point): BlockMarkerGeometry {
  const angle = Math.atan2(to.y-from.y,to.x-from.x), cos = Math.cos(angle), sin = Math.sin(angle);
  const local = ([x,y]: Vertex) => project({x:from.x+x*cos-y*sin,y:from.y+x*sin+y*cos});
  const path = (vertices: Vertex[], close = false) => vertices.map((vertex,i) => {
    const p = local(vertex); return `${i ? 'L' : 'M'}${p.x},${p.y}`;
  }).join(' ') + (close ? ' Z' : '');
  const lines: MarkerLine[] = [];
  const line = (vertices: Vertex[], style: string, close = false) => lines.push({path:path(vertices,close),style});
  const trace = (vertices: Vertex[], phase: string, side?: string) => lines.push({path:path(vertices),style:'trace',phase,side});
  const pulse = (vertices: Vertex[], phase: string) => lines.push({path:path(vertices),style:'pulse',phase});
  const distance = Math.hypot(to.x-from.x,to.y-from.y), tip = distance-(kind==='defense'?.31:.29);
  const arrow: Vertex[] = [[tip-.17,-.13],[tip,0],[tip-.17,.13]], bar: Vertex[] = [[tip,-.13],[tip,.13]];
  const radius = (kind==='offense'?.23:.28)*.75, originX=.03, front=originX+radius, back=originX-radius;
  const circle = (sign:number):Vertex[] => Array.from({length:25},(_,i)=>{
    const theta=Math.PI*(1-i/24);return [originX+radius*Math.cos(theta),sign*radius*Math.sin(theta)];
  });
  const upper:Vertex[] = kind==='offense'?circle(-1):[[back,0],[originX,-radius],[front,0]];
  const lower:Vertex[] = kind==='offense'?circle(1):[[back,0],[originX,radius],[front,0]];
  const shaft:Vertex[] = [[kind==='block'?.4:front,0],[tip,0]];
  if(kind!=='block') line([...upper,...lower.slice().reverse().slice(1)],`origin-${kind==='offense'?'circle':'diamond'}`,true);
  line(shaft,'shaft'); line(arrow,'arrowhead');
  if(kind==='defense') line(bar,'bar');
  if(kind==='block') {
    const impact:Vertex[] = [[distance-.17,-.19],[distance-.07,-.09],[distance+.05,-.18],[distance+.03,-.03],[distance+.18,.02],
      [distance+.03,.08],[distance+.09,.23],[distance-.06,.14]];
    line(impact,'impact'); trace(shaft,'block-shaft');pulse(arrow,'block-head');
    trace(impact.slice(0,5),'impact','upper');trace(impact.slice(4).reverse(),'impact','lower');pulse(impact,'brighten');
    return {lines,flare:local(impact[4])};
  }
  trace(upper,'origin','upper');trace(lower,'origin','lower');trace(shaft,'assist-shaft');pulse(arrow,'assist-head');
  if(kind==='defense')pulse(bar,'assist-head');
  return {lines,radius};
}
