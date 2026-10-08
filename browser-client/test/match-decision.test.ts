import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decisionIcon, matchDecision } from '../src/match-decision.ts';
import { pitchPushChoices } from '../src/push-choice.ts';
import { withProTest } from '../src/reroll-presentation.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));

test('die-specific choices share one skill icon and retain each native command', () => {
  const frame = frames[6].actor as SetupState;
  const actions = [0, 1, 2].map(index => ({ id: `pro:${index}`, actor: frame.callerRole as 'home', kind: 'reroll', label: `Use Pro on die ${index + 1}` }));
  actions.push({ id: 'brawler', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Brawler on a Both Down die' });
  const decision = matchDecision({ ...frame, actions }, actions)!;
  assert.equal(decision.options.length, 2);
  assert.equal(decision.options[0].icon, 'pro');
  assert.deepEqual(decision.options[0].choices?.map(choice => choice.id), ['pro:0', 'pro:1', 'pro:2']);
});

test('a Pro test has its own d6 while original block outcomes remain visible', () => {
  const frame = frames[6].actor as SetupState;
  const decision = { title: 'Reroll the Pro test?', key: '2', kind: 'proTestReroll', options: [
    { id: '1:block-pro-test:none', label: 'Keep original block dice', kind: 'action' as const }] };
  const records = [{ index: 0, revision: 0, kind: 'START', actor: 'system' as const, at: 0, decision: null, state: frame,
    native: [{ reportList: { reports: [{ reportId: 'blockRoll', blockRoll: [1, 2] }] } }] },
    { index: 1, revision: 1, kind: 'ACTION', actor: 'home' as const, at: 1, decision: {}, state: frame,
      native: [{ reportList: { reports: [{ reportId: 'reRoll', reRollSource: 'Pro', roll: 1, successful: false }] } }] }];
  assert.deepEqual(withProTest(decision, records, 1)?.originalFaces, ['SKULL', 'BOTH DOWN']);
  assert.deepEqual(withProTest(decision, records, 1)?.proTest, { face: '1', successful: false });
  assert.equal(withProTest(decision, records, 2)?.proTest, undefined, 'Earlier Pro results cannot leak into a new decision');
});

test('a single-die Pro retry shows its original action d6 instead of an earlier block', () => {
  const frame = frames[6].actor as SetupState;
  const decision = { title: 'Reroll the Pro test?', key: '2', kind: 'proTestReroll', options: [
    { id: '2:pro-test:none', label: 'Keep original roll', kind: 'action' as const }] };
  const records = [{ index: 0, revision: 0, kind: 'START', actor: 'system' as const, at: 0, decision: null, state: frame,
    native: [{ reportList: { reports: [{ reportId: 'blockRoll', blockRoll: [1, 2] }] } }] },
    { index: 1, revision: 1, kind: 'ACTION', actor: 'home' as const, at: 1, decision: {}, state: frame,
      native: [{ reportList: { reports: [{ reportId: 'pickUpRoll', roll: 1 }] } }] },
    { index: 2, revision: 2, kind: 'ACTION', actor: 'home' as const, at: 2, decision: {}, state: frame,
      native: [{ reportList: { reports: [{ reportId: 'reRoll', reRollSource: 'Pro', roll: 2, successful: false }] } }] }];
  assert.deepEqual(withProTest(decision, records, 2)?.originalFaces, ['1']);
  assert.equal(withProTest(decision, records, 2)?.originalLabel, 'Original action roll');
  assert.equal(withProTest(decision, records, 2)?.proTest?.face, '2');
});

test('real block dice become pitch choices while push squares stay on the pitch', () => {
  const block = frames[6].actor as SetupState;
  const dice = matchDecision(block, block.actions.filter(action => action.actor === block.callerRole));
  assert.equal(dice?.title, 'Choose a block die');
  assert.equal(dice?.kind, 'blockDie');
  assert.deepEqual(dice?.options.map(option => option.id), block.actions.map(action => action.id));
  assert.equal(dice?.options[0].face, 'PUSHBACK');
  const push = frames[7].actor as SetupState;
  assert.equal(matchDecision(push, push.actions), null);
  assert.deepEqual(pitchPushChoices(push, push.actions).map(choice => [choice.x, choice.y, choice.fromX, choice.fromY]),
    [[12, 6, 11, 7], [12, 7, 11, 7], [12, 8, 11, 7]]);
  const spectator = frames[6].spectator as SetupState;
  assert.equal(matchDecision(spectator, []), null);
});

test('reroll choices retain skill and team options and follow-up uses Yes and No', () => {
  const frame = frames[6].actor as SetupState;
  const reroll = { ...frame, revision: 24, actions: [
    { id: '24:reroll:none', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Do not re-roll Dodge' },
    { id: '24:reroll:skill', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Dodge re-roll' },
    { id: '24:reroll:team', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use team re-roll for Dodge' }
  ] };
  assert.equal(matchDecision(reroll, reroll.actions)?.kind, 'reroll');
  assert.deepEqual(matchDecision(reroll, reroll.actions)?.options.map(option => option.label),
    ['Do not re-roll Dodge', 'Use Dodge re-roll', 'Use team re-roll for Dodge']);
  const followUp = { ...reroll, actions: [
    { id: '24:follow:no', actor: frame.callerRole as 'home', kind: 'followUp', label: 'Do not follow up' },
    { id: '24:follow:yes', actor: frame.callerRole as 'home', kind: 'followUp', label: 'Follow up' }
  ] };
  assert.deepEqual(matchDecision(followUp, followUp.actions)?.options.map(option => option.label), ['No', 'Yes']);
});

test('only offered reroll actions receive distinct resource and skill icons', () => {
  const frame = frames[6].actor as SetupState;
  const actions = [
    { id: 'keep', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Do not re-roll Dodge' },
    { id: 'team', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use team re-roll for Dodge' },
    { id: 'pro', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Pro re-roll for Dodge' },
    { id: 'brawler', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Brawler on a Both Down die' },
    { id: 'dodge', actor: frame.callerRole as 'home', kind: 'reroll', label: 'Use Dodge' }
  ];
  const decision = matchDecision({ ...frame, actions }, actions);
  assert.deepEqual(decision?.options.map(option => [option.id, option.icon]), [
    ['keep', undefined], ['team', 'resource'], ['pro', 'pro'], ['brawler', 'brawler'], ['dodge', 'dodge']
  ]);
  assert.equal(decisionIcon('Use Sure Feet'), 'sure-feet');
  assert.equal(matchDecision({ ...frame, actions: [] }, []), null, 'automatic skill rerolls do not create choices');
});

test('every native skill reroll source has a named icon in the synced SVG catalog', () => {
  const source = readFileSync(new URL('../../ffb-common/src/main/java/com/fumbbl/ffb/ReRollSources.java', import.meta.url), 'utf8');
  const art = readFileSync(new URL('../../assets/game/ui/skill-icons-v1.svg', import.meta.url), 'utf8');
  const resourceNames = new Set(['Team ReRoll', 'Brilliant Coaching ReRoll', 'Winnings', 'Leader',
    'Team Mascot', 'Mascot TRR', 'Pro Mascot', 'Pro Mascot TRR', 'Pro TRR', 'Pump up the Crowd', 'Star of the Show']);
  const names = [...source.matchAll(/new ReRollSource\("([^"]+)"/g)].map(match => match[1]).filter(name => !resourceNames.has(name));
  const icons = names.map(name => decisionIcon(`Use ${name}`));
  assert.ok(icons.every(icon => icon && !icon.startsWith('custom:')),
    `A native source needs a specific icon: ${names.filter((_, index) => icons[index]?.startsWith('custom:')).join(', ')}`);
  for (const icon of icons) assert.match(art, new RegExp(`<symbol id="${icon}"`));
  assert.equal(new Set(icons).size, names.length, 'different native sources use different images');
});

test('a chain push follows the newly pushed player and invalid projections keep the modal', () => {
  const push = frames[7].actor as SetupState;
  const chain = { ...push, revision: 8, players: [...push.players,
    { ...push.players[1], id: 'chain', x: 12, y: 6 }], actions: [
    { ...push.actions[0], id: '8:push:chain:13:6', target: { x: 13, y: 6 } }
  ] };
  assert.deepEqual(pitchPushChoices(chain, chain.actions).map(choice => [choice.fromX, choice.fromY, choice.x, choice.y]),
    [[12, 6, 13, 6]]);
  assert.equal(matchDecision(chain, chain.actions), null);
  assert.deepEqual(pitchPushChoices({ ...chain, callerRole: 'spectator' }, chain.actions), []);
  const invalid = { ...chain, actions: [{ ...chain.actions[0], target: null }] };
  assert.deepEqual(pitchPushChoices(invalid, invalid.actions), []);
  assert.equal(matchDecision(invalid, invalid.actions)?.title, 'Choose a push square');
});

test('a passive coach sees only their own native decision', () => {
  const frame = frames[6].actor as SetupState;
  const away = { ...frame, callerRole: 'away' as const, actor: 'home' as const,
    actions: [{ id: 'passive:skill', actor: 'away' as const, kind: 'skill', label: 'Use Stand Firm', target: null, sourcePlayerId: 'away1' }] };
  assert.equal(matchDecision(away, away.actions)?.options[0].label, 'Use Stand Firm');
  assert.equal(matchDecision(away, []) , null);
  assert.equal(matchDecision(away, [{ ...away.actions[0], actor: 'home' }]), null);
});

test('coin and receive choices use the server prompt identity', () => {
  const frame = frames[0].actor as SetupState;
  const prompt = { ...frame, phase: 'PRE_MATCH' as const, actions: [], prompt: { id: 'coin-1', actor: 'home' as const, kind: 'coin' as const, options: ['heads', 'tails'] as ('heads' | 'tails')[] } };
  const decision = matchDecision(prompt, []);
  assert.equal(decision?.key, 'coin-1');
  assert.deepEqual(decision?.options.map(option => option.label), ['Heads', 'Tails']);
  assert.equal(matchDecision({ ...prompt, callerRole: 'spectator' }, []), null);
});
