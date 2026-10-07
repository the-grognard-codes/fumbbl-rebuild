import assert from 'node:assert/strict';
import test from 'node:test';
import { weatherPresentation } from '../src/weather-presentation.ts';

test('native weather conditions select distinct sprites and readable names', () => {
  const conditions = ['NICE', 'VERY_SUNNY', 'SWELTERING_HEAT', 'POURING_RAIN', 'BLIZZARD'];
  assert.deepEqual(conditions.map(condition => weatherPresentation(condition).label), ['Nice', 'Sunny', 'Heat', 'Rain', 'Blizzard']);
  assert.deepEqual(conditions.map(condition => weatherPresentation(condition).sprite), ['nice', 'sunny', 'heat', 'rain', 'blizzard']);
  assert.equal(weatherPresentation('POURING_RAIN').label, 'Rain');
  assert.deepEqual(weatherPresentation('Nice Weather'), weatherPresentation('NICE'));
});

test('unknown weather is shown without inventing a supported condition', () => {
  assert.deepEqual(weatherPresentation('INTRO'), { label: 'INTRO', sprite: null });
  assert.deepEqual(weatherPresentation(''), { label: 'Weather unavailable', sprite: null });
});
