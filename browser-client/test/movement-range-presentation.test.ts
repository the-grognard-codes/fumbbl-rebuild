import assert from 'node:assert/strict';
import test from 'node:test';
import { outerRangeEdges, movementRangePresentation, projectRangeEdges } from '../src/movement-range-presentation.ts';
import { PitchProjection } from '../src/pitch-projection.ts';

const camera = (end: 'home' | 'away' = 'home', mode: 'perspective' | 'top-down' = 'perspective',
  perspectiveElevation: 30 | 40 | 50 = 40, focus = 13) =>
  new PitchProjection({ width: 1280, height: 660, end, mode, perspectiveElevation, focus });

test('outer edges omit enclosed holes and retain the pitch boundary and origin', () => {
  const origin = { x: 13, y: 7 };
  const ring = [{ x: 12, y: 6 }, { x: 13, y: 6 }, { x: 14, y: 6 },
    { x: 12, y: 7 }, { x: 14, y: 7 }, { x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }];
  const edges = outerRangeEdges(ring);
  assert.equal(edges.length, 12, 'Only the outer border is drawn');
  assert.ok(!edges.some(edge => edge.key === '13,7|14,7'));
  assert.equal(new Set(edges.map(edge => edge.key)).size, edges.length);
  assert.equal(outerRangeEdges([{ x: 0, y: 0 }]).length, 4, 'pitch boundary is an outline');
  assert.equal(outerRangeEdges([], origin).length, 0, 'origin alone has no movement perimeter');
  assert.equal(outerRangeEdges([{ x: 13, y: 8 }], origin).length, 6, 'origin connects to a reachable square');
});

test('occupied holes, corner notches and adjacent boundary players do not break the outer perimeter', () => {
  const rectangle = Array.from({ length: 20 }, (_, index) => ({ x: 10 + index % 5, y: 5 + Math.floor(index / 5) }));
  const occupied = [{ x: 12, y: 8 }, { x: 13, y: 8 }, { x: 10, y: 5 }, { x: 13, y: 6 }];
  const squares = Object.freeze(rectangle.filter(square => !occupied.some(player => player.x === square.x && player.y === square.y)));
  const before = JSON.stringify(squares);
  const expected = outerRangeEdges(rectangle).map(edge => edge.key).sort();
  assert.deepEqual(outerRangeEdges(squares, undefined, [...occupied, { x: 15, y: 6 }]).map(edge => edge.key).sort(), expected,
    'Bridge the occupied notches, without extending to a player beyond the range');
  assert.equal(JSON.stringify(squares), before, 'Presentation cannot add legal destinations');
  const range = movementRangePresentation([], squares, { x: 11, y: 6 }, camera(), occupied);
  assert.deepEqual(range.warnings.map(warning => warning.square), squares,
    'Only original reachable rush destinations receive warnings');
});

test('unreachable exterior concavities and separate reachable regions retain their native extent', () => {
  const concave = outerRangeEdges([{ x: 13, y: 7 }, { x: 14, y: 7 }, { x: 13, y: 8 }]);
  assert.equal(concave.length, 8);
  assert.ok(concave.some(edge => edge.key === '14,8|15,8'));
  assert.ok(concave.some(edge => edge.key === '14,8|14,9'));
  assert.equal(outerRangeEdges([{ x: 10, y: 7 }, { x: 13, y: 7 }]).length, 8,
    'Do not bridge empty, unreachable ground between separate regions');
});

test('shared full and normal boundary segments are blue only and equal sets have no yellow', () => {
  const origin = { x: 13, y: 7 }, normal = [{ x: 13, y: 8 }];
  const equal = movementRangePresentation(normal, normal, origin, camera());
  assert.equal(equal.normal.length, 6);
  assert.equal(equal.full.length, 0);
  assert.equal(equal.warnings.length, 0);
  const expanded = movementRangePresentation(normal, [...normal, { x: 14, y: 8 }], origin, camera());
  const blue = new Set(expanded.normal.map(edge => edge.key));
  assert.ok(expanded.full.length > 0);
  assert.ok(expanded.full.every(edge => !blue.has(edge.key)));
  assert.deepEqual(expanded.warnings.map(warning => warning.square), [{ x: 14, y: 8 }]);
  const rushOnly = movementRangePresentation([], [{ x: 13, y: 8 }], origin, camera());
  assert.equal(rushOnly.normal.length, 0);
  assert.equal(rushOnly.full.length, 6);
  assert.equal(rushOnly.warnings.length, 1);
  const immobile = movementRangePresentation([], [], origin, camera());
  assert.equal(immobile.normal.length + immobile.full.length + immobile.warnings.length, 0);
});

test('contours and warning triangles share canonical ground projection in both views and every angle', () => {
  for (const end of ['home', 'away'] as const) for (const mode of ['perspective', 'top-down'] as const)
    for (const angle of [30, 40, 50] as const) {
      const lens = camera(end, mode, angle);
      const range = movementRangePresentation([{ x: 13, y: 8 }], [{ x: 13, y: 8 }, { x: 14, y: 8 }], { x: 13, y: 7 }, lens);
      assert.ok(range.normal.length > 0 && range.full.length > 0);
      for (const edge of [...range.normal, ...range.full]) {
        const from = lens.project(edge.from)!, to = lens.project(edge.to)!;
        assert.deepEqual(edge.screenFrom, { x: from.x, y: from.y });
        assert.deepEqual(edge.screenTo, { x: to.x, y: to.y });
      }
      const warning = range.warnings[0];
      assert.deepEqual(warning.center, lens.project({ x: 14.5, y: 8.5 }));
      for (const vertex of warning.triangle) assert.deepEqual(lens.cellAt(vertex), { x: 14, y: 8 });
      assert.equal(warning.path.match(/Q/g)?.length, 3, 'The projected warning has rounded corners');
      assert.ok(warning.size > 0 && warning.size <= 6);
      const height = Math.max(...warning.triangle.map(point => point.y)) - Math.min(...warning.triangle.map(point => point.y));
      assert.ok(warning.size <= height, 'The exclamation mark fits within the ground triangle');
      const cell = lens.square(warning.square);
      const cellWidth = Math.max(...cell.map(point => point.x)) - Math.min(...cell.map(point => point.x));
      const cellHeight = Math.max(...cell.map(point => point.y)) - Math.min(...cell.map(point => point.y));
      const width = Math.max(...warning.triangle.map(point => point.x)) - Math.min(...warning.triangle.map(point => point.x));
      assert.ok(width < cellWidth * .25 && height < cellHeight * .25, 'The warning occupies about one fifth of a square');
    }
});

test('projected perimeter edges clip at the viewport and omit invisible segments', () => {
  for (const end of ['home', 'away'] as const) for (const mode of ['perspective', 'top-down'] as const) {
    const lens = camera(end, mode).with({ zoom: 3 });
    const edges = outerRangeEdges(Array.from({ length: 15 }, (_, y) => ({ x: 13, y })));
    const projected = projectRangeEdges(edges, lens);
    assert.ok(projected.length < edges.length);
    assert.ok(projected.some(edge => {
      const original = lens.project(edge.from)!;
      return edge.screenFrom.x !== original.x || edge.screenFrom.y !== original.y;
    }), 'an edge crossing the viewport is clipped');
    for (const edge of projected) for (const point of [edge.screenFrom, edge.screenTo]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= -1e-7 && point.x <= lens.width + 1e-7);
      assert.ok(point.y >= -1e-7 && point.y <= lens.height + 1e-7);
    }
    assert.deepEqual(movementRangePresentation([], [{ x: 25, y: 14 }], { x: 25, y: 13 }, camera(end, mode, 40, 0)).warnings, []);
  }
});
