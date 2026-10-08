import assert from 'node:assert/strict';
import test from 'node:test';
import { routeSquarePresentation } from '../src/route-presentation.ts';
import { decodeRoutePreview } from '../src/route-protocol.ts';

test('dodge colors use the native net penalty independently of agility and rush checks', () => {
  const bands = [[0, 'dodge-zero'], [1, 'dodge-zero'], [-1, 'dodge-one'], [-2, 'dodge-two'],
    [-3, 'dodge-three'], [-4, 'dodge-three']] as const;
  for (const [dodgeModifier, band] of bands) for (const dodge of [2, 4, 6]) {
    const step = { x: 7, y: 7, dodge, dodgeModifier, rush: 0, reactions: [] };
    const single = routeSquarePresentation(step), combined = routeSquarePresentation({ ...step, rush: 5 });
    assert.equal(single.band, band);
    assert.equal(combined.color, single.color);
    assert.deepEqual(combined.labels, [`D ${dodge}+`, 'R 5+']);
    assert.match(combined.description, /Rush 5\+/);
  }
  const clear = routeSquarePresentation({ x: 7, y: 6, dodge: 0, rush: 0, reactions: [] });
  const rush = routeSquarePresentation({ x: 7, y: 5, dodge: 0, rush: 3, reactions: [] });
  assert.equal(clear.band, 'clear');
  assert.deepEqual(clear.labels, []);
  assert.equal(rush.band, 'rush');
  assert.notEqual(rush.color, clear.color);
  assert.deepEqual(rush.labels, ['R 3+']);
  assert.equal(routeSquarePresentation({ x: 7, y: 7, dodge: 4, rush: 0, reactions: [] }).band, 'unknown');
});

test('versioned native route decoding requires bounded modifiers and retains legacy previews', () => {
  const response = { version: 2, type: 'routePreview', requestId: 'preview', code: 'ACCEPTED',
    matchId: '12345678-1234-1234-1234-123456789abc', route: { routeVersion: 2, playerId: 'home1',
      from: { x: 7, y: 7 }, remaining: 8, steps: [{ x: 7, y: 6, dodge: 6, rush: 3, dodgeModifier: -4, reactions: [] }],
      revision: 4, actor: 'home' } };
  const decode = (step: object, version = 2) => decodeRoutePreview(JSON.stringify({ ...response,
    route: { ...response.route, routeVersion: version, steps: [step] } }));
  const step = response.route.steps[0];
  assert.equal(decode(step).route.routeVersion, 2);
  assert.equal(decode(step).route.steps[0].dodgeModifier, -4);
  const { dodgeModifier, ...legacy } = step;
  assert.equal(decode(legacy, 1).route.steps[0].dodgeModifier, undefined);
  assert.throws(() => decode(legacy));
  assert.throws(() => decode({ ...step, dodgeModifier: -65 }));
  assert.throws(() => decode({ ...step, dodgeModifier: '-1' }));
  assert.throws(() => decode({ ...step, dodge: 7 }));
  assert.throws(() => decode({ ...step, hiddenRoll: 1 }));
  assert.throws(() => decode(step, 3));
});

test('public adjacent forecasts contain only bounded native checks for offered moves', async () => {
  const { readFileSync } = await import('node:fs');
  const { decodeSetupStateValue } = await import('../src/setup-protocol.ts');
  const input = JSON.parse(readFileSync(new URL('./fixtures/route-forecast-dodge.json', import.meta.url), 'utf8'))[0];
  const state = decodeSetupStateValue(input.state);
  assert.ok(state.movementForecast?.steps.length);
  const copy = () => structuredClone(input.state);
  const hidden = copy(); hidden.movementForecast.steps[0].hiddenRoll = 6;
  const player = copy(); player.movementForecast.playerId = 'start-marker';
  const unavailable = copy(); unavailable.movementForecast.steps[0].x = 0;
  const repeated = copy(); repeated.movementForecast.steps.push(repeated.movementForecast.steps[0]);
  const target = copy(); target.movementForecast.steps[0].rush = 7;
  const oldVersion = copy(); oldVersion.projectionVersion = 3;
  for (const invalid of [hidden, player, unavailable, repeated, target, oldVersion]) assert.throws(() => decodeSetupStateValue(invalid));
  const legacy = copy(); delete legacy.movementForecast;
  assert.equal(decodeSetupStateValue(legacy).movementForecast, undefined);
});
