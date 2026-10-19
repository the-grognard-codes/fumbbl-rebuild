import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BogrukBoard, distance, playerValue } from '../src/bogruk-board.mjs';
import { BOGRUK_SETTINGS, chooseBogrukDecision, policyRandom } from '../src/bogruk-policy.mjs';
import { chooseComputerDecision } from '../src/computer-policy.mjs';

const player = (id, x, y, extra = {}) => ({ id, name: id, role: 'home', x, y, state: 'is standing', status: 'Standing',
  ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [], offPitch: 'pitch', ...extra });
const action = (id, kind, sourcePlayerId = null, target = null, label = kind) => ({ id, kind, sourcePlayerId, target, actor: 'home', label });
function view(extra = {}) {
  return { matchId: '00000000-0000-0000-0000-000000000001', revision: 1, callerRole: 'home', actor: 'home', phase: 'PLAY',
    half: 1, drive: 1, homeTurn: 1, awayTurn: 0, homeScore: 0, awayScore: 0, turnMode: 'REGULAR', weather: 'NICE',
    activePlayerId: null, players: [], ball: null, ballState: { carrierPlayerId: null, inPlay: true, moving: false }, actions: [], prompt: null,
    computer: { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 42, policyState: null,
      attackDirection: 1, movement: null, progress: { turnKey: '1:1:home:1', stalledTurns: 0 } }, ...extra };
}
const calm = state => chooseBogrukDecision(state, { recklessness: false });
const picked = (state, outcome) => state.actions.find(item => item.id === outcome.decision?.actionId);

function offerMovement(state, remaining) {
  const current = state.players.find(item => item.id === state.activePlayerId);
  state.actions = [action('end-action', 'endAction'), action('end-turn', 'endTurn')];
  const steps = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const to = { x: current.x + dx, y: current.y + dy };
    if (to.x < 0 || to.x > 25 || to.y < 0 || to.y > 14 || state.players.some(item => item.x === to.x && item.y === to.y)) continue;
    if (remaining > 0) state.actions.push(action(`${state.revision}:move:${to.x}:${to.y}`, 'move', current.id, to));
    steps.push({ ...to, dodge: 0, rush: 0, reactions: [], checks: [] });
  }
  state.movementForecast = { playerId: current.id, steps };
  state.computer.movement = { normalRemaining: remaining, remaining };
}

test('dispatch keeps the random coach API and refuses an unknown Bogruk version', () => {
  const state = view({ actions: [action('end', 'endTurn')] });
  state.computer.opponentId = 'coach-bugman-random';
  assert.deepEqual(chooseComputerDecision(state, { random: () => 0 }), { decision: { operation: 'action', actionId: 'end' }, reason: 'Choose a random offered action.', nextPolicyState: null });
  state.computer.opponentId = 'coach-bogruk-weak'; state.computer.policyVersion = 'bogruk-v2';
  assert.throws(() => chooseComputerDecision(state), /Unsupported/);
});

test('Bogruk accepts human saves, waits while suspended, and accepts resume without losing its allowance', () => {
  const state = view({ actor: 'away', saveResume: { status: 'SAVE_PENDING', proposer: 'away', proposalId: 'save-1' } });
  state.computer.policyState = { version: 1, turnKey: state.computer.progress.turnKey, actions: 12, mistakeUsed: true,
    plan: { playerId: 'carrier', kind: 'move', targetPlayerId: null, target: { x: 20, y: 7 } } };
  const save = calm(state);
  assert.deepEqual(save.decision, { operation: 'saveAccept', proposalId: 'save-1' });
  assert.equal(save.nextPolicyState.mistakeUsed, true);
  assert.equal(save.nextPolicyState.actions, 12);
  state.computer.policyState = save.nextPolicyState;
  state.saveResume = { status: 'SUSPENDED', proposer: null, proposalId: null };
  const suspended = calm(state);
  assert.equal(suspended.decision, null);
  assert.deepEqual(suspended.nextPolicyState, save.nextPolicyState);
  state.saveResume = { status: 'RESUME_PENDING', proposer: 'away', proposalId: 'resume-1' };
  const resume = calm(state);
  assert.deepEqual(resume.decision, { operation: 'resumeAccept', proposalId: 'resume-1' });
  assert.equal(resume.nextPolicyState.mistakeUsed, true);
  assert.equal(resume.nextPolicyState.actions, 12);
  assert.deepEqual(resume.nextPolicyState.plan, save.nextPolicyState.plan);
});

test('whole no-dice scoring routes dominate violence and forced recklessness in both directions', () => {
  for (const direction of [1, -1]) {
    const carrier = player('carrier', direction > 0 ? 21 : 4, 7);
    const state = view({ players: [carrier, player('blocker', 12, 5), player('victim', 13, 5, { role: 'away' }),
      player('obstacle', direction > 0 ? 22 : 3, 7)], ball: { x: carrier.x, y: carrier.y },
    ballState: { carrierPlayerId: carrier.id, inPlay: true, moving: false }, actions: [action('select-carrier', 'select', carrier.id, { playerId: carrier.id }), action('violence', 'selectBlock', 'blocker', { playerId: 'blocker' })] });
    state.computer.attackDirection = direction;
    const start = chooseBogrukDecision(state, { random: () => 0 });
    assert.equal(start.decision.actionId, 'select-carrier');
    assert.match(start.reason, /no-dice/);
    assert.equal(start.nextPolicyState.mistakeUsed, false);
    state.activePlayerId = carrier.id;
    state.computer.policyState = start.nextPolicyState;
    let remaining = 6;
    while (carrier.x !== (direction > 0 ? 25 : 0) && remaining > 0) {
      offerMovement(state, remaining);
      const decision = chooseBogrukDecision(state, { random: () => 0 });
      const move = picked(state, decision);
      assert.equal(move.kind, 'move');
      assert.match(decision.reason, /no-dice/);
      assert.equal(decision.nextPolicyState.mistakeUsed, false);
      carrier.x = move.target.x; carrier.y = move.target.y;
      state.ball = { x: carrier.x, y: carrier.y }; state.revision++; remaining--;
      state.computer.policyState = decision.nextPolicyState;
    }
    assert.equal(carrier.x, direction > 0 ? 25 : 0);
    assert.ok(remaining >= 1, 'the full detour fits normal movement');
  }
});

test('an unmarked runner collects a reachable loose ball through a coherent activation', () => {
  const runner = player('runner', 5, 7, { ag: 4 });
  const state = view({ players: [runner], ball: { x: 8, y: 7 }, actions: [action('select', 'select', runner.id, { playerId: runner.id }), action('secure', 'secureBall', runner.id, { playerId: runner.id }), action('end', 'endTurn')] });
  const first = calm(state);
  assert.equal(first.decision.actionId, 'secure');
  state.computer.policyState = first.nextPolicyState; state.activePlayerId = runner.id;
  let remaining = 6;
  while (distance(runner, state.ball)) {
    offerMovement(state, remaining);
    const outcome = calm(state), move = picked(state, outcome);
    assert.equal(move.kind, 'move');
    runner.x = move.target.x; runner.y = move.target.y; state.revision++; remaining--;
    state.computer.policyState = outcome.nextPolicyState;
    assert.ok(remaining >= 0);
  }
  assert.equal(runner.x, 8);
});

test('advances possession while defensive movement pursues the enemy carrier', () => {
  const runner = player('runner', 10, 7);
  const state = view({ players: [runner], ball: { x: 10, y: 7 }, ballState: { carrierPlayerId: 'runner', inPlay: true, moving: false }, actions: [action('select', 'select', 'runner', { playerId: 'runner' }), action('end', 'endTurn')] });
  let outcome = calm(state);
  assert.equal(outcome.decision.actionId, 'select');
  assert.ok(outcome.nextPolicyState.plan.target.x > runner.x);
  const opponent = player('enemy', 7, 7, { role: 'away' });
  state.players.push(opponent); state.ballState.carrierPlayerId = 'enemy'; state.ball = { x: 7, y: 7 };
  outcome = calm(state);
  assert.equal(outcome.decision.actionId, 'select');
  assert.ok(distance(outcome.nextPolicyState.plan.target, opponent) < distance(runner, opponent));
});

test('normal blocks use signed server dice and account for assists and active skills', () => {
  const attacker = player('attacker', 10, 7, { skills: ['Block'] });
  const defender = player('defender', 11, 7, { role: 'away' });
  const helper = player('helper', 11, 6);
  const state = view({ players: [attacker, defender, helper], actions: [action('block', 'selectBlock', 'attacker', { playerId: 'attacker' }), action('end', 'endTurn')] });
  const board = new BogrukBoard(state);
  assert.equal(board.blockDice(attacker, defender), 2);
  assert.equal(calm(state).decision.actionId, 'block');
  state.blockPreview = { rolls: [{ playerId: attacker.id, targetPlayerId: defender.id, dice: -2 }] };
  assert.equal(new BogrukBoard(state).blockDice(attacker, defender), -2);
  state.activePlayerId = attacker.id;
  state.actions = [action('both', 'blockDie', null, null, 'Choose BOTH DOWN (die 1)'), action('push', 'blockDie', null, null, 'Choose PUSHBACK (die 2)')];
  assert.equal(calm(state).decision.actionId, 'both');
  attacker.skills = [];
  assert.equal(calm(state).decision.actionId, 'push');
  state.actions.push(action('pow', 'blockDie', null, null, 'Choose POW (die 3)'));
  assert.equal(calm(state).decision.actionId, 'pow');
});

test('a useful handoff or short pass reaches a scoring threat, while long or empty throws are ignored', () => {
  const passer = player('passer', 16, 7, { ma: 0, pa: 2, skills: ['Pass'] });
  const catcher = player('catcher', 21, 7, { skills: ['Catch'] });
  const state = view({ players: [passer, catcher], activePlayerId: passer.id, ball: { x: 16, y: 7 }, ballState: { carrierPlayerId: passer.id, inPlay: true, moving: false },
    actions: [action('short', 'pass', passer.id, { x: 21, y: 7 }), action('empty', 'pass', passer.id, { x: 19, y: 3 }), action('receiver', 'select', catcher.id, { playerId: catcher.id }), action('end', 'endAction')] });
  state.computer.movement = { normalRemaining: 0, remaining: 0 };
  state.passing = { ranges: Array.from({ length: 26 }, () => '-'.repeat(15)) };
  state.passing.ranges[21] = '-------S-------';
  assert.equal(calm(state).decision.actionId, 'short');
  state.passing.ranges[21] = '-------L-------';
  assert.notEqual(calm(state).decision.actionId, 'short');
  catcher.x = 17; catcher.y = 7;
  state.actions = [action('handoff', 'handOff', passer.id, { playerId: catcher.id }), action('receiver', 'select', catcher.id, { playerId: catcher.id }), action('end', 'endAction')];
  passer.status = 'Standing';
  // A handoff that gains only one square needs a safety benefit.
  state.players.push(player('marker', 15, 7, { role: 'away' }));
  assert.equal(calm(state).decision.actionId, 'handoff');
});

test('a safer backward receiver cannot replace purposeful forward play in either direction', () => {
  for (const direction of [1, -1]) for (const kind of ['handOff', 'pass']) {
    const carrier = player('carrier', 10, 7, { ma: 1, pa: 2, skills: ['Pass'] });
    const receiver = player('receiver', 10 - direction, 7, { ag: 2, skills: ['Catch'] });
    const marker = player('marker', 10 + direction, 7, { role: 'away' });
    const forward = { x: 10 + direction, y: 8 };
    const state = view({ players: [carrier, receiver, marker], activePlayerId: carrier.id,
      ball: { x: carrier.x, y: carrier.y }, ballState: { carrierPlayerId: carrier.id, inPlay: true, moving: false },
      actions: [action('retreat', kind, carrier.id, kind === 'handOff' ? { playerId: receiver.id } : { x: receiver.x, y: receiver.y }),
        action('forward', 'move', carrier.id, forward), action('end', 'endAction')] });
    state.computer.attackDirection = direction;
    state.computer.movement = { normalRemaining: 1, remaining: 1 };
    state.movementForecast = { playerId: carrier.id, steps: [{ ...forward, dodge: 4, rush: 0, reactions: [], checks: [] }] };
    state.passing = { ranges: Array.from({ length: 26 }, () => '-'.repeat(15)) };
    state.passing.ranges[receiver.x] = '-------Q-------';
    assert.equal(calm(state).decision.actionId, 'forward', `${direction}/${kind}`);
    assert.equal(chooseBogrukDecision(state, { random: () => 0 }).decision.actionId, 'forward', 'recklessness cannot authorize retreat');
  }
});

function riskScenario(stalledTurns = 0) {
  const carrier = player('carrier', 10, 7);
  const blocker = player('blocker', 14, 3, { skills: ['Block'] });
  const victim = player('victim', 15, 3, { role: 'away', skills: ['Dodge'] });
  const cheap = player('cheap', 14, 10, { st: 2, skills: [] });
  const proneVictim = player('prone', 15, 10, { role: 'away', state: 'is prone', av: 10 });
  const state = view({ players: [carrier, blocker, victim, cheap, proneVictim], ball: { x: 10, y: 7 }, ballState: { carrierPlayerId: 'carrier', inPlay: true, moving: false },
    actions: [action('carrier', 'select', 'carrier', { playerId: 'carrier' }), action('block', 'selectBlock', 'blocker', { playerId: 'blocker' }), action('foul', 'declareFoul', 'cheap', { playerId: 'cheap' }), action('end', 'endTurn')] });
  state.computer.progress.stalledTurns = stalledTurns;
  return state;
}

test('risk settings escalate at 30/50/70%, consume one allowance even on success, and reset only on a new own turn', () => {
  assert.deepEqual(BOGRUK_SETTINGS.riskChances, [0.3, 0.5, 0.7]);
  for (const [stall, draw, expected] of [[0, 0.29, true], [0, 0.3, false], [1, 0.49, true], [1, 0.5, false], [2, 0.69, true], [4, 0.7, false]]) {
    const state = riskScenario(stall);
    const result = chooseBogrukDecision(state, { random: purpose => purpose === 'risk' ? draw : 0 });
    assert.equal(result.nextPolicyState.mistakeUsed, expected, `${stall}/${draw}`);
    if (!expected) continue;
    assert.match(result.reason, /Deliberate risk/);
    assert.notEqual(result.decision.actionId, calm(state).decision.actionId);
    state.computer.policyState = result.nextPolicyState;
    state.revision++;
    assert.equal(chooseBogrukDecision(state, { random: () => 0 }).nextPolicyState.mistakeUsed, true);
    assert.doesNotMatch(chooseBogrukDecision(state, { random: () => 0 }).reason, /Deliberate risk/);
    state.computer.progress.turnKey = '1:1:home:2';
    assert.equal(calm(state).nextPolicyState.mistakeUsed, false);
  }
});

test('a low-value foul is a purposeful deliberate mistake and removal trades against the fouler value', () => {
  const state = riskScenario();
  state.actions = state.actions.filter(item => item.id !== 'block');
  const result = chooseBogrukDecision(state, { random: () => 0 });
  assert.equal(result.decision.actionId, 'foul');
  assert.match(result.reason, /low-value foul/);
  const board = new BogrukBoard(state);
  const cheap = state.players.find(item => item.id === 'cheap'), target = state.players.find(item => item.id === 'prone');
  const expensive = { ...cheap, st: 6, ma: 9, ag: 2, skills: ['Block', 'Dodge', 'Guard'] };
  assert.ok(board.foulScore(cheap, target) > board.foulScore(expensive, target));
});

test('deliberate risky blocks and unnecessary movement risks remain recognizable football plays', () => {
  const blockState = riskScenario();
  blockState.actions = blockState.actions.filter(item => item.id !== 'foul');
  const gamble = chooseBogrukDecision(blockState, { random: () => 0 });
  assert.equal(gamble.decision.actionId, 'block');
  assert.match(gamble.reason, /risky block/);
  const carrier = player('carrier', 10, 7);
  const state = view({ players: [carrier], activePlayerId: carrier.id, ball: { x: 10, y: 7 },
    ballState: { carrierPlayerId: carrier.id, inPlay: true, moving: false }, actions: [
      action('safe', 'move', carrier.id, { x: 11, y: 7 }), action('gamble', 'move', carrier.id, { x: 11, y: 8 }), action('end', 'endAction')] });
  state.computer.movement = { normalRemaining: 1, remaining: 2 };
  state.movementForecast = { playerId: carrier.id, steps: [
    { x: 11, y: 7, dodge: 0, rush: 0, reactions: [], checks: [] },
    { x: 11, y: 8, dodge: 3, rush: 0, reactions: [], checks: [] }] };
  assert.equal(calm(state).decision.actionId, 'safe');
  const result = chooseBogrukDecision(state, { random: () => 0 });
  assert.equal(result.decision.actionId, 'gamble');
  assert.match(result.reason, /movement gamble/);
  assert.equal(result.nextPolicyState.mistakeUsed, true);
});

test('defending block choices, pushes, follow-ups and rerolls use offered legal alternatives', () => {
  const attacker = player('attacker', 10, 7, { role: 'away' });
  const defender = player('defender', 11, 7);
  const state = view({ players: [attacker, defender], activePlayerId: attacker.id, actor: 'away', reaction: { actor: 'home' }, actions: [
    action('skull', 'blockDie', null, null, 'Choose SKULL (die 1)'), action('pow', 'blockDie', null, null, 'Choose POW (die 2)')] });
  assert.equal(calm(state).decision.actionId, 'skull');
  state.actor = 'home'; state.reaction = null; attacker.role = 'home'; defender.role = 'away';
  state.actions = [action('keep', 'reroll', null, null, 'Do not re-roll the failed Dodge'), action('skill', 'reroll', null, null, 'Use Dodge for Dodge'), action('team', 'reroll', null, null, 'Use team re-roll')];
  assert.equal(calm(state).decision.actionId, 'skill');
  state.actions = [action('push-inner', 'push', attacker.id, { x: 11, y: 7 }), action('push-crowd', 'push', attacker.id, { x: 11, y: -1 })];
  assert.equal(calm(state).decision.actionId, 'push-crowd');
  state.actions = [action('follow', 'followUp', attacker.id, { x: 11, y: 7 }), action('stay', 'followUp', attacker.id, null)];
  assert.equal(calm(state).decision.actionId, 'follow');
});

test('a distant blitz keeps its endpoint intent through target selection and movement', () => {
  const blitzer = player('blitzer', 10, 7, { skills: ['Block'] });
  const carrier = player('enemy', 14, 7, { role: 'away', st: 2 });
  const state = view({ players: [blitzer, carrier], ball: { x: 14, y: 7 }, ballState: { carrierPlayerId: carrier.id, inPlay: true, moving: false }, actions: [action('blitz', 'blitz', blitzer.id, { playerId: blitzer.id }), action('end', 'endTurn')] });
  const start = calm(state);
  assert.equal(start.decision.actionId, 'blitz');
  state.activePlayerId = blitzer.id; state.computer.policyState = start.nextPolicyState;
  state.actions = [action('target', 'blitzTarget', blitzer.id, { playerId: carrier.id })];
  const target = calm(state);
  assert.equal(target.decision.actionId, 'target');
  assert.equal(target.nextPolicyState.plan.kind, 'blitz');
  assert.equal(target.nextPolicyState.plan.targetPlayerId, carrier.id);
  state.computer.policyState = target.nextPolicyState;
  let remaining = 6;
  while (distance(blitzer, carrier) > 1) {
    offerMovement(state, remaining);
    const outcome = calm(state), move = picked(state, outcome);
    assert.equal(move.kind, 'move');
    blitzer.x = move.target.x; blitzer.y = move.target.y; remaining--; state.revision++;
    state.computer.policyState = outcome.nextPolicyState;
    assert.ok(remaining >= 1, 'reserve a movement point for the block');
  }
  state.actions = [action('hit', 'block', blitzer.id, { playerId: carrier.id }), action('end', 'endAction')];
  assert.equal(calm(state).decision.actionId, 'hit');
});

test('a selected block target remains the activation objective when another target is offered', () => {
  const attacker = player('attacker', 10, 7, { skills: ['Block'] });
  const intended = player('intended', 11, 7, { role: 'away', st: 3 });
  const easier = player('easier', 10, 8, { role: 'away', st: 1 });
  const state = view({ players: [attacker, intended, easier], activePlayerId: attacker.id, actions: [
    action('intended', 'block', attacker.id, { playerId: intended.id }), action('easier', 'block', attacker.id, { playerId: easier.id }), action('end', 'endAction')] });
  state.computer.policyState = { version: 1, turnKey: state.computer.progress.turnKey, actions: 1, mistakeUsed: true,
    plan: { playerId: attacker.id, kind: 'blitz', targetPlayerId: intended.id, target: { x: attacker.x, y: attacker.y } } };
  assert.equal(calm(state).decision.actionId, 'intended');
  intended.state = 'is prone'; state.actions = state.actions.filter(item => item.id !== 'intended');
  assert.equal(calm(state).decision.actionId, 'easier', 'an unavailable target must be reassessed');
});

test('deterministic draws and decisions survive serialization and distinguish different purposes', () => {
  const state = riskScenario(2);
  const expected = chooseBogrukDecision(state);
  assert.deepEqual(chooseBogrukDecision(JSON.parse(JSON.stringify(state))), expected);
  assert.equal(policyRandom(42, '3:coin'), policyRandom(42, '3:coin'));
  assert.notEqual(policyRandom(42, '3:coin'), policyRandom(42, '3:kick'));
  state.computer.policyState = expected.nextPolicyState;
  state.revision++;
  assert.deepEqual(chooseBogrukDecision(state), chooseBogrukDecision(JSON.parse(JSON.stringify(state))));
});

test('setup puts cheap players on the line, protects valuable players, leaves gaps and varies kick depth', () => {
  const players = Array.from({ length: 11 }, (_, index) => player(`p${index}`, null, null, { offPitch: 'reserve', skills: index > 8 ? ['Block', 'Dodge', 'Sure Hands'] : [], st: index > 8 ? 4 : 3 }));
  const state = view({ phase: 'SETUP', players });
  const placed = new Map();
  for (let i = 0; i < 11; i++) {
    const result = calm(state);
    assert.equal(result.decision.operation, 'place');
    const current = players.find(item => item.id === result.decision.playerId);
    Object.assign(current, result.decision.to); current.offPitch = 'pitch'; placed.set(current.id, result.decision.to);
  }
  assert.equal(calm(state).decision.operation, 'confirm');
  const line = players.filter(item => item.x === 12);
  assert.equal(line.length, 3);
  assert.ok(line.every(item => playerValue(item) < playerValue(players[10])));
  assert.ok(placed.get('p10').x <= 6);
  assert.ok(!players.some(item => item.y === 8 && item.x >= 10));
  state.phase = 'READY_FOR_KICKOFF';
  state.actions = [action('shallow', 'kickoff', null, { x: 16, y: 7 }), action('deep', 'kickoff', null, { x: 22, y: 7 })];
  assert.equal(chooseBogrukDecision(state, { random: () => 0 }).decision.actionId, 'shallow');
  assert.equal(chooseBogrukDecision(state, { random: () => 0.99 }).decision.actionId, 'deep');
});

test('mandatory and reaction choices remain legal outside the normal turn, and inactive players are not invented', () => {
  const state = view({ actor: 'away', reaction: { actor: 'home' }, players: [player('prone', 10, 7, { state: 'is prone' }), player('stunned', 13, 5, { state: 'has been stunned' })],
    actions: [action('decline', 'reactiveSkill', null, null, 'Do not use Dodge'), action('use', 'reactiveSkill', null, null, 'Use Dodge')] });
  assert.equal(calm(state).decision.actionId, 'use');
  state.actions = [action('unknown', 'unfamiliarMandatory')];
  assert.equal(calm(state).decision.actionId, 'unknown');
  state.reaction = null;
  assert.equal(calm(state).decision, null);
  state.actor = 'home'; state.actions = [action('stand', 'stand', 'prone', { playerId: 'prone' }), action('end', 'endTurn')];
  assert.equal(calm(state).decision.actionId, 'stand');
  state.actions = [action('end', 'endTurn')];
  assert.equal(calm(state).decision.actionId, 'end');
});

test('path search respects occupancy, normal movement, dice guidance and a fixed work ceiling', () => {
  const runner = player('runner', 5, 7);
  const state = view({ players: [runner, player('occupied', 6, 7)], activePlayerId: runner.id });
  state.computer.movement = { normalRemaining: 2, remaining: 3 };
  state.movementForecast = { playerId: runner.id, steps: [{ x: 6, y: 8, dodge: 3, rush: 0, reactions: [], checks: [] }] };
  const board = new BogrukBoard(state), paths = board.paths(runner);
  assert.ok(paths.size <= 390);
  assert.ok(!paths.has('6,7'));
  assert.ok([...paths.values()].every(node => node.steps.length <= 3));
  assert.ok(board.stepRisk(runner, runner, { x: 6, y: 8 }, 1, 2).risks > 0);
  assert.ok([...paths.values()].some(node => node.steps.length === 3 && node.risks > 0));
  assert.equal(new BogrukBoard(state, { maxExpansions: 0 }).paths(runner).size, 1);
});

test('Dodge, Tackle and Sure Hands influence estimates without making dice routes guaranteed', () => {
  const runner = player('runner', 5, 7, { skills: ['Dodge', 'Sure Hands'] });
  const opponent = player('marker', 4, 7, { role: 'away' });
  const state = view({ players: [runner, opponent], ball: { x: 6, y: 7 } });
  const skilled = new BogrukBoard(state).stepRisk(runner, runner, { x: 6, y: 7 }, 1, 6);
  runner.skills = [];
  const ordinary = new BogrukBoard(state).stepRisk(runner, runner, { x: 6, y: 7 }, 1, 6);
  assert.ok(skilled.success > ordinary.success);
  assert.equal(skilled.risks, ordinary.risks);
  runner.skills = ['Dodge']; opponent.skills = ['Tackle'];
  const tackled = new BogrukBoard(state).stepRisk(runner, runner, { x: 6, y: 7 }, 1, 6);
  assert.equal(tackled.success, ordinary.success);
});
