import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { defaults, configuration, argumentsOf } from '../training/config.mjs';
import { Shards, atomicJson, hash } from '../training/records.mjs';
import { mutate, fitness, promotion, completePairs } from '../training/evolution.mjs';
import { BOGRUK_PARAMETERS, validateParameters } from '../src/bogruk-parameters.mjs';
import { chooseBogrukDecision, createBogrukPolicy } from '../src/bogruk-policy.mjs';
import { encode, offeredCandidates, FEATURE_SCHEMA } from '../training/features.mjs';
import { infer, withFallback } from '../training/inference.mjs';
import { train } from '../training/train.mjs';
import { play } from '../training/match.mjs';

test('training accepts computer projections on create and rejected setup responses', async () => {
  const state = JSON.parse(await readFile(new URL('./fixtures/casualty-setup.json', import.meta.url), 'utf8'));
  state.computer = { opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1', seed: 43, attackDirection: 1,
    movement: null, progress: { turnKey: '1:1:1', stalledTurns: 0 }, policyState: null };
  const engine = { command: async request => ({ code: request.operation === 'apply' ? 'ILLEGAL_SETUP' : 'ACCEPTED', state }) };
  const result = await play(engine, { id: 'projection', seed: 43, rosters: ['Orc','Human'], coaches: ['bogruk','gobbo'], parameters: [{},{}] },
    { timeoutMs: 2000, maxDecisions: 1, trajectories: 'off', traceEvery: 0 }, null);
  assert.equal(result.failureCode, 'decision_cap', result.error);
  assert.equal(result.decisions, 1);
});

const machine = { cores: 16, totalMiB: 32768, freeMiB: 24000, gpus: [{ vramMiB: 8192 }], contended: false };
const view = () => ({ callerRole: 'home', actor: 'home', phase: 'PLAY', half: 1, drive: 1, homeTurn: 1, awayTurn: 0,
  revision: 1, homeScore: 0, awayScore: 0, homeRerolls: 2, awayRerolls: 1, weather: 'NICE', players: [], ball: null, actions: [{ id: 'end', kind: 'endTurn', actor: 'home' }],
  computer: { seed: 42, attackDirection: 1, progress: { turnKey: '1:1:1', stalledTurns: 0 }, policyState: null } });

test('resource profiles scale for 8/16 GB GPUs and enforce free-memory and contention ceilings', () => {
  assert.equal(defaults(machine).modelWidth, 32);
  assert.equal(defaults({ ...machine, gpus: [{ vramMiB: 16384 }] }).modelWidth, 64);
  assert.ok(defaults(machine, 'high').workers > defaults(machine, 'low').workers);
  assert.throws(() => configuration({ classpath: 'test', workers: 9 }, { ...machine, contended: true }), /CPU/);
  assert.throws(() => configuration({ classpath: 'test', workers: 16, heapMiB: 2048 }, machine), /Memory/);
  assert.throws(() => configuration({ classpath: 'test', games: 3 }, machine), /even/);
  assert.throws(() => configuration({ classpath: 'test', rosters: 'Goblin' }, machine), /roster/);
  assert.deepEqual(argumentsOf(['--heap-mi-b', '384', '--budget-seconds', '5']), { heapMiB: '384', budgetSeconds: '5' });
});

test('parameter factory preserves production defaults over seeded choices', () => {
  const policy = createBogrukPolicy();
  for (let seed = 0; seed < 20; seed++) {
    const state = view(); state.computer.seed = seed;
    for (let revision = 1; revision <= 30; revision++) {
      state.revision = revision;
      assert.deepEqual(policy(state), chooseBogrukDecision(state));
    }
  }
  assert.throws(() => validateParameters({ unknown: 2 }), /Invalid/);
  assert.throws(() => validateParameters({ moveRisk: Infinity }), /Invalid/);
  assert.deepEqual(mutate(BOGRUK_PARAMETERS, 42), mutate(BOGRUK_PARAMETERS, 42));
  assert.notDeepEqual(mutate(BOGRUK_PARAMETERS, 42), BOGRUK_PARAMETERS);
});

test('training observes Bogruk block-face scores without changing its chosen action', () => {
  const state = view();
  state.activePlayerId = 'p';
  state.players = [{ id: 'p', role: 'home', x: 5, y: 7, ma: 6, st: 3, ag: 3, pa: 4, av: 9, state: 'standing', skills: [] }];
  state.actions = [{ id: 'pow', actor: 'home', kind: 'blockDie', label: 'POW' }, { id: 'skull', actor: 'home', kind: 'blockDie', label: 'SKULL' }];
  let scored = [];
  const observed = chooseBogrukDecision(state, { onCandidates: candidates => { scored = candidates; } });
  assert.deepEqual(observed, chooseBogrukDecision(state));
  assert.equal(observed.decision.actionId, 'pow');
  assert.ok(scored.find(c => c.action.id === 'pow').score > scored.find(c => c.action.id === 'skull').score);
});

const pair = (i, win = true) => [0, 1].map(swap => ({ pair: i, swap, completed: true, failureCode: null,
  score: win ? swap ? [0, 1] : [1, 0] : swap ? [1, 0] : [0, 1] }));
test('promotion uses independent seed pairs, never failed or one-sided matches', () => {
  const wins = Array.from({ length: 200 }, (_, i) => pair(i)).flat();
  assert.equal(promotion(wins).promoted, true);
  assert.equal(promotion(wins.slice(0, 398)).promoted, false);
  assert.equal(promotion(Array.from({ length: 200 }, (_, i) => pair(i, false)).flat()).promoted, false);
  wins[0].failureCode = 'timeout';
  assert.equal(completePairs(wins).length, 199);
  assert.equal(promotion(wins).promoted, false);
  assert.equal(fitness([wins[0]]), null);
  assert.equal(fitness(pair(0)), 3.05);
});

test('compressed shards rotate within bounds, retain checksums and atomically checkpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'training-test-'));
  try {
    const shards = new Shards(directory, 'test', 80, 200);
    for (let i = 0; i < 8; i++) await shards.add({ schemaVersion: 1, index: i });
    await shards.flush();
    const index = JSON.parse(await readFile(join(directory, 'test-index.json'), 'utf8'));
    assert.ok(index.shards.length > 1);
    for (const shard of index.shards) {
      const bytes = await readFile(join(directory, shard.file));
      assert.equal(hash(bytes), shard.sha256);
      assert.ok(gunzipSync(bytes).length <= 80);
    }
    assert.ok(shards.total <= 200);
    await atomicJson(join(directory, 'checkpoint.json'), { generation: 3 });
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'checkpoint.json'))), { generation: 3 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('encoder has documented shape, uses visible rerolls, mirrors attacking coordinates, and deduplicates plans', () => {
  const state = view();
  state.players = [{ id: 'p', role: 'home', x: 5, y: 7, ma: 6, st: 3, ag: 3, pa: 4, av: 9, state: 'standing', skills: [] }];
  const action = { id: 'move', actor: 'home', kind: 'move', target: { x: 6, y: 7 } };
  state.actions = [action];
  const candidates = offeredCandidates(state, { decision: { operation: 'action', actionId: 'move' } }, [{ action, score: 5 }, { action, score: 8 }]);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].score, 8);
  const encoded = encode(state, candidates);
  assert.equal(encoded.board.length, FEATURE_SCHEMA.board.reduce((a,b) => a*b,1));
  assert.equal(encoded.globals.length, FEATURE_SCHEMA.globals);
  assert.equal(encoded.candidates[0].length, FEATURE_SCHEMA.candidate);
  assert.equal(encoded.globals[4], 0.25);
  const mirrored = structuredClone(state); mirrored.computer.attackDirection = -1; mirrored.players[0].x = 20;
  assert.deepEqual(encode(mirrored, []).board, encode(state, []).board);
});

test('inference connection errors are bounded and available for counted fallback', async () => {
  await assert.rejects(infer(1, encode(view(), [{ score: 1 }]), 100), /connect|timeout/i);
  const teacher = { decision: { operation: 'action', actionId: 'end' }, nextPolicyState: { actions: 1 } };
  assert.deepEqual(await withFallback(teacher, () => infer(1, encode(view(), [{ score: 1 }]), 100)), { outcome: teacher, fallback: true });
  assert.deepEqual(await withFallback(teacher, async () => teacher), { outcome: teacher, fallback: false });
});

test('ES checkpoints interrupted generations and resumes three generations without promoting insufficient evidence', async () => {
  const output = await mkdtemp(join(tmpdir(), 'training-es-'));
  const options = { output, generations: 3, population: 1, games: 2, promotionMatches: 2, opponentWeights: '1,0,0', budgetSeconds: 10 };
  const simulated = async () => ({ records: pair(0), config: { engineCommit: 'test' } });
  try {
    const interrupted = await train(options, async () => { process.emit('SIGINT'); return simulated(); });
    assert.equal(interrupted.generation, 0);
    const resumed = await train({ ...options, resume: 'on' }, simulated);
    assert.equal(resumed.generation, 3);
    assert.equal(resumed.history.length, 3);
    assert.ok(resumed.history.every(g => !g.evidence.promoted));
    assert.deepEqual(resumed.champion, BOGRUK_PARAMETERS);
  } finally { await rm(output, { recursive: true, force: true }); }
});
