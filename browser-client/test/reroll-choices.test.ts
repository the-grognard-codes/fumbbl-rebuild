import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchDecision } from '../src/match-decision.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';

const journeys = JSON.parse(readFileSync(new URL('./fixtures/adr0003-reroll-choices.json', import.meta.url), 'utf8'));

test('native reroll catalogs retain every exact source and decline identity for both coaches', () => {
  for (const journey of journeys) {
    const view = decodeSetupStateValue(journey.offered);
    const offered = view.actions.filter(action => ['blockDie', 'reroll', 'skill'].includes(action.kind));
    assert.deepEqual(matchDecision(view, view.actions)?.options.map(option => [option.id, option.label]),
      offered.map(action => [action.id, action.label]), `${journey.role}/${journey.mode}`);
    assert.equal(matchDecision(decodeSetupStateValue(journey.otherCoach), journey.otherCoach.actions), null);
    assert.equal(matchDecision(decodeSetupStateValue(journey.spectator, true), journey.spectator.actions), null);
    decodeSetupStateValue(journey.accepted);
  }
});

test('native successful and opponent-choice block rolls keep distinct reroll decisions', () => {
  for (const role of ['home', 'away']) {
    const success = journeys.find(journey => journey.role === role && journey.mode === 'block-success');
    assert.ok(success.offered.actions.some(action => action.id.endsWith('block-reroll:team')));
    const opponent = journeys.find(journey => journey.role === role && journey.mode === 'block-opponent');
    assert.equal(opponent.offered.actions.some(action => action.kind === 'blockDie'), false);
    assert.ok(opponent.offered.actions.some(action => action.id.endsWith('block-reroll:none')));
  }
});

test('concurrent native skill and reroll action families share the required dialog', () => {
  const view = decodeSetupStateValue(journeys[0].offered);
  const skill = { ...view.actions[0], id: '2:skill-choice', kind: 'skill', label: 'Use native modifying skill' };
  const actions = [...view.actions, skill];
  assert.ok(matchDecision(view, actions)?.options.some(option => option.id === skill.id));
});
