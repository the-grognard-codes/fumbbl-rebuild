import assert from 'node:assert/strict';
import test from 'node:test';
import type { SetupPlayer, SetupState } from '../src/setup-protocol.ts';
import { PitchProjection } from '../src/pitch-projection.ts';
import { projectWarning } from '../src/movement-range-presentation.ts';
import { defaultThreatPreferences } from '../src/threat-preferences.ts';
import { projectThreatSquare, threatColors, threatOpacity, threatSquares } from '../src/threat-presentation.ts';

function player(id: string, role: 'home' | 'away', x: number, y: number, skills: string[] = []): SetupPlayer {
  return { id, role, x, y, skills, name: id, slot: 1, state: 'standing' };
}
function state(): SetupState {
  const players = [player('friendly', 'home', 7, 2), player('tail', 'away', 11, 6, ['Prehensile Tail', 'Tackle']),
    player('tentacles', 'away', 12, 6, ['Tentacles']), player('diving', 'away', 13, 6, ['Diving Tackle']),
    player('shadowing', 'away', 13, 7, ['Shadowing'])];
  return { matchId: '00000000-0000-0000-0000-000000000001', revision: 1, callerRole: 'home', actor: 'home', phase: 'PLAY',
    prompt: null, players, weather: 'Nice', homeRerolls: 1, awayRerolls: 1, actions: [], turn: 1, turnMode: 'REGULAR',
    ball: null, activePlayerId: null, half: 1, homeTurn: 1, awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1,
    threats: { version: 1, eligiblePlayerIds: ['friendly'], zonePlayerIds: players.map(player => player.id) } };
}

test('counts zones once, uses all four bands, excludes occupied squares and never changes native state', () => {
  const view = state(), before = JSON.stringify(view);
  const squares = threatSquares(view, 'friendly', defaultThreatPreferences);
  assert.deepEqual([...new Set(squares.map(square => square.count))].sort(), [1, 2, 3, 4]);
  const overlap = squares.find(square => square.x === 12 && square.y === 7)!;
  assert.equal(overlap.count, 4); assert.equal(overlap.tackle, true); assert.equal(overlap.striped, true);
  assert.equal(new Set(squares.map(square => `${square.x},${square.y}`)).size, squares.length);
  assert.ok(squares.every(square => !view.players.some(player => player.x === square.x && player.y === square.y)));
  for (const count of [1, 2, 3, 4, 5, 8]) {
    const projected = projectThreatSquare({ x: 12, y: 7, count, tackle: false, striped: false }, new PitchProjection({ width: 1280, height: 660 }), true, false);
    assert.equal(projected.color, threatColors[Math.min(count, 4) - 1]);
    assert.equal(projected.fills.length, 1);
  }
  assert.equal(threatOpacity, .5); assert.equal(JSON.stringify(view), before);
});

test('native eligibility gates unfinished friendly selection, regular turns and Charge, including legacy data fail-closed', () => {
  const view = state();
  for (const patch of [{ callerRole: 'away' }, { callerRole: 'spectator' }, { phase: 'SETUP' }, { phase: 'FULL_TIME' },
    { turnMode: 'QUICK_SNAP' }, { turnMode: 'HIGH_KICK' }, { turnMode: 'SOLID_DEFENCE' },
    { actor: 'away' }, { threats: undefined }, { threats: { ...view.threats!, eligiblePlayerIds: [] } }])
    assert.equal(threatSquares({ ...view, ...patch } as SetupState, 'friendly', defaultThreatPreferences).length, 0);
  assert.equal(threatSquares(view, '', defaultThreatPreferences).length, 0);
  assert.equal(threatSquares(view, 'tail', defaultThreatPreferences).length, 0);
  assert.ok(threatSquares({ ...view, activePlayerId: 'friendly' }, 'friendly', defaultThreatPreferences).length);
  assert.ok(threatSquares({ ...view, turnMode: 'BLITZ' }, 'friendly', defaultThreatPreferences).length);
  assert.ok(threatSquares({ ...view, turnMode: 'KICKOFF', kickoff: {
    version: 1, event: 'CHARGE', actor: 'home', stage: 'selection', allowed: 3, selected: 0, completed: 0,
  } }, 'friendly', defaultThreatPreferences).length);
  view.players[0].x = null; view.players[0].y = null;
  assert.equal(threatSquares(view, 'friendly', defaultThreatPreferences).length, 0);
});

test('zone sources come from native flags, not standing text or movement range, and clip at pitch edges', () => {
  const view = state(); view.players = [view.players[0], player('edge', 'away', 0, 0, ['Tackle'])];
  view.threats!.zonePlayerIds = ['edge'];
  assert.deepEqual(threatSquares(view, 'friendly', defaultThreatPreferences).map(square => [square.x, square.y]), [[0, 1], [1, 0], [1, 1]]);
  view.threats!.zonePlayerIds = [];
  assert.deepEqual(threatSquares(view, 'friendly', defaultThreatPreferences), []);
});

test('each approved skill marks presence, Arm Bar and Tackle alone do not stripe, controls stay independent', () => {
  const view = state();
  for (const skill of ['Prehensile Tail', 'Diving Tackle', 'Tentacles', 'Shadowing', 'Arm Bar', 'Tackle']) {
    view.players = [view.players[0], player('source', 'away', 12, 7, [skill])]; view.threats!.zonePlayerIds = ['source'];
    const squares = threatSquares(view, 'friendly', defaultThreatPreferences);
    assert.equal(squares.length, 8); assert.ok(squares.every(square => square.striped === !['Arm Bar', 'Tackle'].includes(skill)));
    assert.ok(squares.every(square => square.tackle === (skill === 'Tackle')));
  }
  view.players[1].skills = ['Prehensile Tail', 'Tentacles', 'Tackle'];
  assert.ok(threatSquares(view, 'friendly', { ...defaultThreatPreferences, prehensileTail: false }).every(square => square.striped));
  assert.ok(threatSquares(view, 'friendly', { ...defaultThreatPreferences, prehensileTail: false, tentacles: false }).every(square => !square.striped && square.tackle));
  assert.ok(threatSquares(view, 'friendly', { ...defaultThreatPreferences, otherSkills: false }).every(square => !square.striped && square.tackle));
  assert.ok(threatSquares(view, 'friendly', { ...defaultThreatPreferences, tackle: false }).every(square => square.striped && !square.tackle));
  assert.ok(threatSquares(view, 'friendly', { ...defaultThreatPreferences, zoneColors: false }).every(square => square.count === 1 && square.striped && square.tackle));
  assert.deepEqual(threatSquares(view, 'friendly', { ...defaultThreatPreferences, enabled: false }), []);
  assert.deepEqual(threatSquares(view, 'friendly', { ...defaultThreatPreferences, zoneColors: false, tackle: false, otherSkills: false }), []);
});

test('ground bands, neutral hatches and caution signs project in both coach views, pan, zoom and all elevations', () => {
  const square = { x: 12, y: 7, count: 4, striped: true, tackle: true };
  for (const end of ['home', 'away'] as const) for (const mode of ['perspective', 'top-down'] as const)
    for (const perspectiveElevation of [30, 40, 50] as const) for (const focus of [11, 13, 15]) for (const zoom of [1, 1.5]) {
      const camera = new PitchProjection({ width: 1280, height: 660, end, mode, perspectiveElevation, focus, zoom });
      const colors = projectThreatSquare(square, camera, true, false), neutral = projectThreatSquare(square, camera, false, true);
      assert.equal(colors.fills.length, 8); assert.equal(colors.hatches.length, 0);
      assert.equal(neutral.fills.length, 0); assert.equal(neutral.hatches.length, 8);
      assert.ok(colors.fills.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
      assert.deepEqual(colors.warning, projectWarning(square, camera), 'Tackle reuses rushing geometry');
      assert.equal(colors.rushWarning, null); assert.equal(colors.separator, null);
      const rush = neutral.rushWarning!, tackle = neutral.warning!, separator = neutral.separator!;
      assert.deepEqual(separator.center, camera.project({ x: square.x + .5, y: square.y + .5 }));
      assert.ok(rush.center.x < separator.center.x && separator.center.x < tackle.center.x);
      assert.ok(Math.abs((rush.center.x + tackle.center.x) / 2 - separator.center.x) < 1e-7,
        'Shared rushing and Tackle markers are centered equally around the slash');
      assert.equal(rush.center.y, separator.center.y); assert.equal(tackle.center.y, separator.center.y);
      for (const point of [...rush.triangle, ...tackle.triangle]) assert.deepEqual(camera.cellAt(point), { x: square.x, y: square.y });
      const area = (polygon: { x: number; y: number }[]) => Math.abs(polygon.reduce((sum, a, index) => {
        const b = polygon[(index + 1) % polygon.length]; return sum + a.x * b.y - b.x * a.y;
      }, 0)) / 2;
      const covered = colors.fills.reduce((sum, polygon) => sum + area(polygon), 0);
      assert.ok(covered > area(camera.square(square)) * .75 && covered < area(camera.square(square)) * .95,
        'Transparent bands expose turf without removing most of the fill');
    }
});
