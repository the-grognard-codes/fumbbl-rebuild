import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { injuryIcon } from '../src/injury-presentation.ts';
import { matchDecision } from '../src/match-decision.ts';
import { hudResources } from '../src/hud-model.ts';
import type { SetupAction, SetupState } from '../src/setup-protocol.ts';

const frame: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[6].actor;
const role = frame.callerRole as 'home' | 'away';
const player = frame.players.find(player => player.role === role)!;
const action = (id: string, label: string): SetupAction => ({ id: `12:${id}`, label, actor: role,
  kind: 'apothecary', target: { playerId: player.id } });

test('initial injury and staff choices retain authoritative IDs, effects and injured player', () => {
  const actions = [action('apothecary:no', 'Accept Head Injury (-1AV, MNG)'),
    action('apothecary:TEAM', 'Use Apothecary'), action('apothecary:PLAGUE', 'Use Plague Doctor')];
  const decision = matchDecision(frame, actions)!;
  assert.equal(decision.title, 'Use Apothecary?');
  assert.equal(decision.playerName, player.name);
  assert.deepEqual(decision.options.map(option => [option.id, option.label, option.icon]),
    actions.map((action, index) => [action.id, action.label, index ? 'injury:apothecary' : 'injury:head-injury']));
  assert.equal(decision.options.some(option => option.choices), false);
  assert.equal(matchDecision({ ...frame, callerRole: 'spectator' }, actions), null);
  assert.equal(matchDecision({ ...frame, callerRole: role === 'home' ? 'away' : 'home' }, actions), null);
});

test('equal rerolled injuries remain separate choices and label the spent apothecary', () => {
  const actions = [action('injury:old', 'Keep Serious Injury (Niggling Injury, MNG)'),
    action('injury:new', 'Choose Serious Injury (Niggling Injury, MNG)')];
  const decision = matchDecision(frame, actions)!;
  assert.equal(decision.title, 'Choose Apothecary Result');
  assert.match(decision.instruction!, /has been spent/);
  assert.deepEqual(decision.options.map(option => option.id), actions.map(action => action.id));
  assert.deepEqual(decision.options.map(option => option.icon), ['injury:serious-injury', 'injury:serious-injury']);
  assert.equal(decision.options.some(option => option.choices), false);
});

test('multi-player prompts distinguish injured players and preserve decline-all and staff commands', () => {
  const second = { ...player, id: 'second-injured-player', name: 'Second injured player' };
  const actions = [action('apothecaries:no', 'Accept all injuries'),
    action(`apothecaries:${player.id}:TEAM`, 'Use Apothecary: Knocked Out'),
    { ...action(`apothecaries:${second.id}:WANDERING`, 'Use Wandering Apothecary: Neck Injury (-1AG, MNG)'),
      target: { playerId: second.id } }];
  actions[0].target = null;
  const decision = matchDecision({ ...frame, players: [...frame.players, second] }, actions)!;
  assert.equal(decision.playerName, undefined);
  assert.deepEqual(decision.options.map(option => [option.id, option.playerName, option.icon]), [
    [actions[0].id, undefined, undefined], [actions[1].id, player.name, 'injury:knocked-out'],
    [actions[2].id, second.name, 'injury:neck-injury']]);
  assert.equal(decision.options.some(option => option.choices), false);
});

test('KO and Badly Hurt do not invent a second decision after automatic server resolution', () => {
  for (const injury of ['Knocked Out', 'Badly Hurt']) {
    const actions = [action('apothecary:no', `Accept ${injury}`), action('apothecary:TEAM', 'Use Apothecary')];
    assert.equal(matchDecision(frame, actions)?.options.length, 2);
    assert.equal(matchDecision({ ...frame, actions: [] }, []), null);
  }
});

test('all supported named injuries have distinct symbols and no guessed fallback artwork', () => {
  const svg = readFileSync(new URL('../../assets/game/ui/injury-icons-v1.svg', import.meta.url), 'utf8');
  const symbols = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(symbols.length, 28);
  assert.equal(new Set(symbols).size, 28);
  for (const ruleset of ['bb2016', 'bb2020', 'bb2025']) {
    const source = readFileSync(new URL(`../../ffb-common/src/main/java/com/fumbbl/ffb/${ruleset}/SeriousInjury.java`, import.meta.url), 'utf8');
    const names = [...source.matchAll(/^\s+[A-Z_]+\("([^"]+)"/gm)].map(match => match[1]);
    assert.ok(names.length > 0);
    for (const name of [...names, 'Knocked Out', 'Badly Hurt']) {
      const icon = injuryIcon(`Accept ${name}`);
      assert.ok(icon, `${ruleset}: ${name}`);
      assert.ok(symbols.includes(icon.slice(7)), `${ruleset}: ${icon}`);
    }
  }
  assert.equal(injuryIcon('Accept Unknown Injury'), undefined);
});

test('authoritative remaining apothecaries decrement and disappear at zero for either coach', () => {
  for (const side of ['home', 'away'] as const) {
    const key = side === 'home' ? 'homeResources' : 'awayResources';
    for (const count of [2, 1, 0]) {
      const view = { ...frame, [key]: { apothecaries: count, assistantCoaches: 0, cheerleaders: 0 } };
      assert.equal(hudResources(view, side).find(item => item.kind === 'apothecary')?.count, count || undefined);
    }
  }
});
