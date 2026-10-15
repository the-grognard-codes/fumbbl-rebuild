export type DieKind = 'block' | 'd6' | 'd8' | 'd16';
type Vector = [number, number, number];
export type PolyhedronFace = { value: string; transform: string; landing: string; points: string };
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vector, b: Vector) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const minus = (a: Vector, b: Vector): Vector => a.map((value, i) => value - b[i]) as Vector;
const unit = (v: Vector): Vector => v.map(value => value / Math.hypot(...v)) as Vector;
const matrix = (values: number[]) => `matrix3d(${values.map(value => Math.abs(value) < 1e-10 ? 0 : value).join(',')})`;

/** A closed bipyramid: four equatorial edges form D8, eight form D16.
 * Each fixed face carries its inverse rotation, so any result lands head-on. */
export function polyhedronFaces(sides: 8 | 16): PolyhedronFace[] {
  const edges = sides / 2, radius = sides === 8 ? 21 : 23, height = sides === 8 ? 21 : 25;
  return Array.from({ length: sides }, (_, index) => {
    const edge = index % edges, angle = edge * Math.PI * 2 / edges;
    const a: Vector = [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
    const b: Vector = [radius * Math.cos(angle + Math.PI * 2 / edges), 0, radius * Math.sin(angle + Math.PI * 2 / edges)];
    const c: Vector = [0, index < edges ? -height : height, 0];
    const center = a.map((value, i) => (value + b[i] + c[i]) / 3) as Vector;
    const x = unit(minus(b, a));
    let normal = unit(cross(minus(b, a), minus(c, a)));
    if (dot(normal, center) < 0) normal = normal.map(value => -value) as Vector;
    const y = cross(normal, x);
    const points = [a, b, c].map(point => {
      const local = minus(point, center);
      return `${dot(local, x)},${dot(local, y)}`;
    }).join(' ');
    return { value: String(index + 1), points,
      transform: matrix([...x, 0, ...y, 0, ...normal, 0, ...center, 1]),
      landing: matrix([x[0], y[0], normal[0], 0, x[1], y[1], normal[1], 0, x[2], y[2], normal[2], 0, 0, 0, 0, 1]) };
  });
}

export const numericSolids = { d8: polyhedronFaces(8), d16: polyhedronFaces(16) };
