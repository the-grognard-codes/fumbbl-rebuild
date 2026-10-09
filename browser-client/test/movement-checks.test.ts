import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeMovementChecks, decodeRoutePreview } from '../src/route-protocol.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

test('movement checks distinguish entry targets from conditional reactions and fall recovery', () => {
  const checks = decodeMovementChecks([{ name: 'Pickup', target: 4, condition: 'entry' },
    { name: 'Tentacles', target: null, condition: 'possible' }, { name: 'Steady Footing', target: 6, condition: 'fall' }]);
  assert.deepEqual(checks, [{ name: 'Pickup', target: 4, condition: 'entry' },
    { name: 'Tentacles', target: null, condition: 'possible' }, { name: 'Steady Footing', target: 6, condition: 'fall' }]);
  for (const invalid of [
    [{ name: 'Tentacles', target: 4, condition: 'possible' }],
    [{ name: 'Pickup', target: null, condition: 'entry' }],
    [{ name: 'Pickup', target: 7, condition: 'entry' }],
    [{ name: 'Steady Footing', target: 6, condition: 'entry' }],
    [{ name: 'Unknown skill', target: null, condition: 'possible' }],
    [{ ...checks[0], hiddenRoll: 6 }], [checks[0], checks[0]]
  ]) assert.throws(() => decodeMovementChecks(invalid));
});

test('native additional-check fixtures decode current guidance and preserve old route versions', () => {
  for (const family of ['pickup', 'ball-contact', 'reactions', 'jump']) {
    const cases = JSON.parse(readFileSync(new URL(`./fixtures/movement-checks-${family}.json`, import.meta.url), 'utf8'));
    for (const input of cases) {
      const state = decodeSetupStateValue(input.state);
      assert.equal(state.movementForecast?.version, 2);
      if (input.route) {
        const response = { version: 2, type: 'routePreview', requestId: 'checks', code: 'ACCEPTED', matchId: state.matchId, route: input.route };
        assert.equal(decodeRoutePreview(JSON.stringify(response)).route.routeVersion, 3);
        const old = structuredClone(response); old.route.routeVersion = 2;
        for (const step of old.route.steps) delete step.checks;
        assert.equal(decodeRoutePreview(JSON.stringify(old)).route.routeVersion, 2);
      }
      const bad = structuredClone(input.state);
      bad.movementForecast.steps[0].checks.push({ name: 'Tentacles', target: 5, condition: 'possible' });
      assert.throws(() => decodeSetupStateValue(bad));
      const hidden = structuredClone(input.state); hidden.movementForecast.steps[0].checks[0] = { name: 'Pickup', target: 3, condition: 'entry', hiddenRoll: 6 };
      assert.throws(() => decodeSetupStateValue(hidden));
    }
  }
});
