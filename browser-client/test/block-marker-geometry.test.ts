import assert from 'node:assert/strict';
import test from 'node:test';
import { blockMarkerGeometry } from '../src/block-marker-geometry.ts';
import type { BlockMarkerGeometry, MarkerLine } from '../src/block-marker-geometry.ts';
import { PitchProjection } from '../src/pitch-projection.ts';
import type { Point } from '../src/pitch-projection.ts';

const identity = (point: Point) => point;
const points = (line: MarkerLine): Point[] => [...line.path.matchAll(/[ML]([^, ]+),([^ ]+)/g)]
  .map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
const line = (geometry: BlockMarkerGeometry, style: string) => {
  const result = geometry.lines.find(line => line.style === style);
  assert.ok(result, `missing ${style}`);
  return points(result);
};
const close = (actual: Point, expected: Point) => {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-8,
    `expected (${actual.x}, ${actual.y}) to meet (${expected.x}, ${expected.y})`);
};

test('offensive circle has the approved radius and joins the shaft only at its forward boundary', () => {
  const geometry = blockMarkerGeometry('offense', { x: 0, y: 0 }, { x: 1, y: 0 }, identity);
  assert.ok(Math.abs(geometry.radius! - .1725) < 1e-10);
  const origin = line(geometry, 'origin-circle');
  const shaft = line(geometry, 'shaft');
  for (const point of origin) assert.ok(Math.abs(Math.hypot(point.x - .03, point.y) - .1725) < 1e-10);
  close(shaft[0], { x: .2025, y: 0 });
  close(shaft.at(-1)!, line(geometry, 'arrowhead')[1]);
  for (const trace of geometry.lines.filter(line => line.phase === 'origin')) {
    const vertices = points(trace);
    close(vertices[0], { x: -.1425, y: 0 });
    close(vertices.at(-1)!, shaft[0]);
  }
});

test('defensive chasers traverse opposite diamond vertices and converge exactly at the shaft', () => {
  const geometry = blockMarkerGeometry('defense', { x: 0, y: 0 }, { x: 1, y: 0 }, identity);
  const origin = line(geometry, 'origin-diamond');
  assert.equal(new Set(origin.map(point => `${point.x},${point.y}`)).size, 4);
  const expected = [{ x: -.18, y: 0 }, { x: .03, y: -.21 }, { x: .24, y: 0 }, { x: .03, y: .21 }];
  origin.slice(0, 4).forEach((point, index) => close(point, expected[index]));
  const traces = geometry.lines.filter(line => line.phase === 'origin');
  assert.deepEqual(traces.map(line => line.side).sort(), ['lower', 'upper']);
  const shaft = line(geometry, 'shaft');
  for (const trace of traces) {
    const vertices = points(trace);
    assert.equal(vertices.length, 3, 'each chaser follows a diamond vertex, never a shortcut through the symbol');
    close(vertices[0], expected[0]);
    close(vertices.at(-1)!, shaft[0]);
  }
  assert.ok(points(traces.find(line => line.side === 'upper')!)[1].y < 0);
  assert.ok(points(traces.find(line => line.side === 'lower')!)[1].y > 0);
  close(shaft[0], expected[2]);
});

test('defensive chevron and shaft meet the endpoint bar flush in every projection and direction', () => {
  for (const mode of ['top-down', 'perspective'] as const) for (const end of ['home', 'away'] as const) {
    const camera = new PitchProjection({ width: 1280, height: 720, mode, end });
    for (const delta of [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]) {
      const from = { x: 12.5, y: 7.5 }, to = { x: from.x + delta.x, y: from.y + delta.y };
      const project = (point: Point) => camera.project(point)!;
      const geometry = blockMarkerGeometry('defense', from, to, project);
      const head = line(geometry, 'arrowhead'), bar = line(geometry, 'bar'), shaft = line(geometry, 'shaft');
      close(shaft.at(-1)!, head[1]);
      // Perspective need not preserve a midpoint, but must preserve collinearity and incidence.
      const cross = (head[1].x - bar[0].x) * (bar[1].y - bar[0].y)
        - (head[1].y - bar[0].y) * (bar[1].x - bar[0].x);
      assert.ok(Math.abs(cross) < 1e-7, 'the chevron point must touch the endpoint bar');
      const trace = geometry.lines.find(line => line.phase === 'assist-shaft')!;
      assert.deepEqual(points(trace), shaft);
      for (const origin of geometry.lines.filter(line => line.phase === 'origin')) close(points(origin).at(-1)!, shaft[0]);
      for (const vertex of geometry.lines.flatMap(points)) assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y));
    }
  }
});

test('block impact keeps the original burst and joins both glow paths at the brighter flare', () => {
  const geometry = blockMarkerGeometry('block', { x: 0, y: 0 }, { x: 1, y: 0 }, identity);
  const impact = line(geometry, 'impact');
  assert.equal(impact.length, 8);
  [{ x: .83, y: -.19 }, { x: .93, y: -.09 }, { x: 1.05, y: -.18 }, { x: 1.03, y: -.03 },
    { x: 1.18, y: .02 }, { x: 1.03, y: .08 }, { x: 1.09, y: .23 }, { x: .94, y: .14 }]
    .forEach((point, index) => close(impact[index], point));
  const traces = geometry.lines.filter(line => line.phase === 'impact');
  assert.equal(traces.length, 2);
  for (const trace of traces) close(points(trace).at(-1)!, geometry.flare!);
  close(points(traces.find(line => line.side === 'upper')!)[0], impact[0]);
  close(points(traces.find(line => line.side === 'lower')!)[0], impact.at(-1)!);
  assert.deepEqual(points(geometry.lines.find(line => line.phase === 'brighten')!), impact);
  close(line(geometry, 'shaft')[0], { x: .4, y: 0 });
  close(line(geometry, 'shaft').at(-1)!, line(geometry, 'arrowhead')[1]);
});
