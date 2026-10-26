import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchDecision } from '../src/match-decision.ts';
import type { SetupState, SetupAction } from '../src/setup-protocol.ts';
import { placeSkillPrompt, promptOverlap } from '../src/skill-prompt-placement.ts';
import { skillPromptOptions } from '../src/skill-prompt-options.ts';

const base: SetupState = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const action = (id: string, kind: string, label: string): SetupAction => ({ id, kind, label, actor: 'home', sourcePlayerId: base.players[0].id });
test('skill and non-block reroll prompts preserve native IDs and the skill owner', () => {
  for (const kind of ['skill', 'reroll', 'kickSkill']) {
    const actions = [action(`9:${kind}:true`, kind, 'Use Wrestle'), action(`9:${kind}:false`, kind, 'Decline skills')];
    const decision = matchDecision({ ...base, callerRole: 'home', actions }, actions)!;
    assert.equal(decision.circular, true);
    assert.deepEqual(decision.options.map(option => option.id), actions.map(option => option.id));
    assert.equal(decision.options[0].sourcePlayerId, base.players[0].id);
  }
});
test('block reroll namespaces retain the old interface regardless of the projected decision kind', () => {
  for (const namespace of ['block-reroll', 'block-reroll-die', 'block-die', 'block-pro-test']) {
    const actions = [action(`9:${namespace}:none`, 'reroll', 'Keep original block dice')];
    assert.notEqual(matchDecision({ ...base, callerRole: 'home', actions }, actions)?.circular, true);
  }
});
test('ordinary result skills remain circular even if the previous block roll remains on the board', () => {
  const actions = [action('10:skill:true', 'skill', 'Use Juggernaut'), action('10:skill:false', 'skill', 'Decline skills')];
  const decision = matchDecision({ ...base, callerRole: 'home', actions }, actions)!;
  assert.equal(decision.circular, true);
  assert.equal(decision.options[0].id, '10:skill:true');
});
test('older combined non-block menus offer the builtin before resources without losing a modifier', () => {
  for (const skill of ['Pass', 'Catch', 'Sure Hands', 'Dodge', 'Sure Feet']) {
    const actions = [action('9:reroll:none', 'reroll', 'Do not re-roll Dodge'),
      action('9:reroll:skill', 'reroll', `Use ${skill}`), action('9:reroll:team', 'reroll', 'Use team re-roll'),
      action('9:reroll:pro', 'reroll', 'Use Pro'), action('9:skill:modify', 'skill', 'Use Strong Passing Game')];
    const decision = matchDecision({ ...base, callerRole: 'home', actions }, actions)!;
    const presentation = skillPromptOptions(decision);
    assert.deepEqual(presentation.choices.map(option => option.id), ['9:reroll:skill', '9:skill:modify']);
    assert.equal(presentation.preferred?.id, '9:reroll:skill');
    assert.equal(presentation.decline?.id, '9:reroll:none');
    const exhausted = matchDecision({ ...base, callerRole: 'home', actions: actions.filter(option => option.id !== '9:reroll:skill') },
      actions.filter(option => option.id !== '9:reroll:skill'))!;
    assert.ok(skillPromptOptions(exhausted).choices.some(option => option.id === '9:reroll:team'));
    assert.ok(skillPromptOptions(exhausted).choices.some(option => option.id === '9:reroll:pro'));
  }
});
test('placement protects the subject, dice, ball and involved player near every viewport edge', () => {
  const frame = { left: 20, top: 30, width: 900, height: 620 };
  const dice = { left: 580, top: 300, width: 120, height: 90 };
  for (const [left, top] of [[35, 45], [820, 45], [35, 550], [820, 550], [440, 300]]) {
    const subject = { left, top, width: 50, height: 70 };
    const nearby = { left: left + (left > 700 ? -65 : 65), top, width: 50, height: 70 };
    const ball = { left: left + 15, top: top + 80, width: 24, height: 24 };
    const placed = placeSkillPrompt(frame, { width: 196, height: 196 }, subject, [dice, nearby, ball]);
    assert.ok(placed.left >= frame.left && placed.top >= frame.top);
    assert.ok(placed.left + placed.width <= frame.left + frame.width && placed.top + placed.height <= frame.top + frame.height);
    for (const protect of [subject, dice, nearby, ball]) assert.equal(promptOverlap(placed, protect), false);
  }
});
test('portrait placement accommodates the adjacent source chooser without covering the dice', () => {
  const subject = { left: 160, top: 340, width: 40, height: 55 };
  const dice = { left: 210, top: 310, width: 110, height: 90 };
  const placed = placeSkillPrompt({ left: 0, top: 0, width: 390, height: 700 }, { width: 352, height: 230 }, subject, [dice]);
  assert.equal(promptOverlap(placed, subject), false);
  assert.equal(promptOverlap(placed, dice), false);
  assert.ok(placed.left + placed.width <= 390 && placed.top + placed.height <= 700);
});

for (const side of ['left', 'right']) test(`placement favors the ${side} dice half even when the player is across the pitch`, () => {
  const frame = { left: 100, top: 40, width: 1000, height: 650 };
  const dice = { left: side === 'left' ? 250 : 850, top: 300, width: 90, height: 80 };
  const subject = { left: side === 'left' ? 850 : 250, top: 300, width: 50, height: 70 };
  const placed = placeSkillPrompt(frame, { width: 147, height: 167 }, subject, [dice], [], [dice]);
  assert.equal(placed.left + placed.width / 2 < 600, side === 'left');
  assert.equal(promptOverlap(placed, dice), false);
  assert.equal(promptOverlap(placed, subject), false);
});
test('a blocked dice half falls back to clear space without obscuring dice or the player', () => {
  const frame = { left: 0, top: 0, width: 1000, height: 650 };
  const dice = { left: 750, top: 300, width: 90, height: 80 };
  const blocked = { left: 500, top: 0, width: 500, height: 650 };
  const subject = { left: 250, top: 300, width: 50, height: 70 };
  const placed = placeSkillPrompt(frame, { width: 147, height: 167 }, subject, [dice, blocked], [], [dice]);
  assert.ok(placed.left + placed.width < 500);
  for (const rect of [dice, blocked, subject]) assert.equal(promptOverlap(placed, rect), false);
});


test('only timed native optional declines are marked as timeout defaults', () => {
  const reaction = { id: 'reaction-9', actor: 'home' as const, title: 'Use a skill?', expiresAt: 30_000, serverNow: 0 };
  for (const [kind, yesId, noId] of [['skill', 'skill:true', 'skill:false'], ['reroll', 'reroll:dodge', 'reroll:none'],
    ['reactiveSkill', 'reaction-use', 'reaction-decline']]) {
    const actions = [action(`9:${yesId}`, kind, 'Use Dodge'), action(`9:${noId}`, kind, 'Decline')];
    const timed = matchDecision({ ...base, callerRole: 'home', reaction, actions }, actions)!;
    assert.equal(skillPromptOptions(timed).timeoutDefault?.id, `9:${noId}`);
    const untimed = matchDecision({ ...base, callerRole: 'home', actions }, actions);
    if (untimed) assert.equal(skillPromptOptions(untimed).timeoutDefault, undefined);
    assert.equal(skillPromptOptions({ ...timed, options: timed.options.slice(0, 1) }).timeoutDefault, undefined);
    assert.equal(skillPromptOptions({ ...timed, options: timed.options.map((option, index) => ({ ...option, id: 'unknown:' + index })) }).timeoutDefault,
      undefined, 'An arbitrary label alone does not imply a server timeout continuation');
  }
});


test('Sidestep projects circular activation and exact owner-relative native arrow choices', () => {
  for (const role of ['home', 'away'] as const) {
    const owner = base.players.find(player => player.role === role)!;
    const actions: SetupAction[] = [[owner.x! - 1, owner.y!], [owner.x!, owner.y! - 1]].map(([x, y]) => ({
      id: `9:reaction-use:${x}:${y}`, kind: 'reactiveSquare', label: `Use Sidestep at ${x}, ${y}`,
      actor: role, sourcePlayerId: owner.id, target: { x, y } }));
    actions.push({ id: '9:reaction-decline', kind: 'reactiveSkill', label: 'Decline', actor: role, sourcePlayerId: owner.id });
    const view: SetupState = { ...base, callerRole: role, actions,
      reaction: { id: 'reaction-9', actor: role, title: 'Use Sidestep?', expiresAt: 30_000, serverNow: 0 } };
    const decision = matchDecision(view, actions)!;
    assert.equal(decision.circular, true);
    assert.equal(decision.pitchSelection?.playerId, owner.id);
    assert.equal(decision.pitchSelection?.committed, false);
    assert.deepEqual(decision.pitchSelection?.choices.map(choice => [choice.action.id, choice.fromX, choice.fromY]),
      actions.slice(0, 2).map(action => [action.id, owner.x, owner.y]));
    assert.equal(skillPromptOptions(decision).timeoutDefault?.id, '9:reaction-decline');
    assert.deepEqual(decision.options.map(option => option.id), ['9:reaction-decline']);
    assert.equal(matchDecision({ ...view, callerRole: 'spectator' }, actions), null);
    const invalid = actions.map(action => ({ ...action, sourcePlayerId: null }));
    assert.equal(matchDecision({ ...view, actions: invalid }, invalid)?.pitchSelection, undefined);
    const distant = actions.map(action => action.target ? { ...action, target: { x: 25, y: 14 } } : action);
    assert.equal(matchDecision({ ...view, actions: distant }, distant)?.pitchSelection, undefined);
    const otherSkill = { ...view, reaction: { ...view.reaction!, title: 'Use Trickster?' } };
    assert.equal(matchDecision(otherSkill, actions)?.pitchSelection, undefined);
  }
});
