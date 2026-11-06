import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseComputerDecision } from '../src/computer-policy.mjs';

const action = (id, kind, label, extra = {}) => ({ id: `37:${id}`, kind, label, actor: 'away', ...extra });
const view = actions => ({ revision: 37, phase: 'PLAY', turnMode: 'KICKOFF', callerRole: 'away', actor: 'away',
  players: [], actions, computer: { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42,
    attackDirection: -1, progress: { turnKey: '1:1:0', stalledTurns: 0 }, policyState: null } });
const choose = (state, draw = 0, random = false) => chooseComputerDecision(random
  ? { ...state, computer: { ...state.computer, opponentId: 'coach-bugman-random' } } : state,
{ random: () => draw, recklessness: false }).decision.actionId;

test('Bogruk selects kickoff participants before confirming instead of declining or confirming none', () => {
  for (const event of ['CHARGE', 'QUICK_SNAP', 'SOLID_DEFENCE']) {
    const state = view([action('event-pick:p1', 'kickoffChoice', 'Select Player 1', { target: { playerId: 'p1' } }),
      action('event-confirm', 'kickoffChoice', `Confirm ${event}`), action('decline-event', 'kickoffChoice', `Decline ${event}`)]);
    state.kickoff = { event, stage: 'selection', actor: 'away', allowed: 3, selected: 0, completed: 0 };
    assert.equal(choose(state), '37:event-pick:p1');
    state.actions[0].label = 'Deselect Player 1'; state.kickoff.selected = 1;
    assert.equal(choose(state), '37:event-confirm');
  }
});

test('Bogruk always accepts the offered apothecary, bribe and argument even at the action limit', () => {
  for (const [kind, prefix, decline, use] of [
    ['apothecary', 'apothecary', 'Accept Badly Hurt', 'Use Apothecary'],
    ['apothecary', 'apothecaries', 'Accept all injuries', 'Use Plague Doctor: Badly Hurt'],
    ['bribe', 'bribe', 'Do not use a bribe', 'Use a bribe for Player 1'],
    ['argueTheCall', 'argue', 'Do not argue the call', 'Argue the call for Player 1'],
  ]) {
    const state = view([action(`${prefix}:no`, kind, decline), action(`${prefix}:use`, kind, use)]);
    state.computer.policyState = { version: 1, turnKey: '1:1:0', actions: 256, mistakeUsed: true, plan: null };
    for (const draw of [0, 0.99]) assert.equal(choose(state, draw), `37:${prefix}:use`);
  }
});

test('Random acceptance is 50/50 per resource offer rather than per candidate', () => {
  for (const [kind, prefix] of [['apothecary', 'apothecary'], ['apothecary', 'apothecaries'], ['bribe', 'bribe'], ['argueTheCall', 'argue']]) {
    const state = view([action(`${prefix}:no`, kind, 'Decline'), ...['a', 'b', 'c'].map(id => action(`${prefix}:${id}`, kind, 'Use'))]);
    for (const draw of [0, 0.49, 0.5, 0.99]) assert.equal(choose(state, draw, true).endsWith(':no'), draw >= 0.5);
  }
});

test('both coaches choose the least harmful apothecary result regardless of old/new order or random draw', () => {
  const injuries = ['Badly Hurt', 'Seriously Hurt (MNG)', 'Serious Injury (Niggling Injury, MNG)', 'Head Injury (-1AV, MNG)', 'Dead'];
  for (const random of [true, false]) for (let better = 0; better < injuries.length; better++) {
    for (let worse = better + 1; worse < injuries.length; worse++) for (const oldBetter of [true, false]) {
      const state = view([action('injury:old', 'apothecary', `Keep ${injuries[oldBetter ? better : worse]}`),
        action('injury:new', 'apothecary', `Choose ${injuries[oldBetter ? worse : better]}`)]);
      for (const draw of [0, 0.99]) assert.equal(choose(state, draw, random), `37:injury:${oldBetter ? 'old' : 'new'}`);
    }
  }
});
