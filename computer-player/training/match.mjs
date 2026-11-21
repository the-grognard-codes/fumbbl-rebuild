import { createHash } from 'node:crypto';
import { decodeSetupStateValue } from '../../browser-client/src/setup-protocol.ts';
import { chooseBogrukDecision, policyRandom } from '../src/bogruk-policy.mjs';
import { chooseDecision } from '../src/policy.mjs';
import { isComputerGameOperation } from '../src/computer-operations.mjs';
import { encode, offeredCandidates } from './features.mjs';
import { infer, withFallback } from './inference.mjs';
import { hash } from './records.mjs';
import { DiagnosticTrace } from './diagnostics.mjs';

export async function play(engine, job, config, trajectories, progress = () => {}, diagnostic = async () => false) {
  const started = Date.now(), digest = createHash('sha256');
  const record = { schemaVersion: 1, ...job, engineCommit: config.engineCommit, hostBuildHash: config.hostBuildHash, sourceDirty: config.sourceDirty, parameters: job.parameters,
    parameterHashes: job.parameters.map(hash), modelHashes: job.modelHashes ?? [null, null], decisions: 0, completed: false, failureCode: null,
    fallbackCount: 0, inferenceCount: 0, policyMs: 0, engineMs: 0, trajectoryRows: 0, trajectoryDroppedRows: 0,
    trajectoryComplete: config.trajectories === 'on', engineHeapPeakMiB: 0, engineHeapCommittedPeakMiB: 0 };
  const trace = new DiagnosticTrace();
  const memory = { home: null, away: null }, counts = { home: 0, away: 0 }, turnKeys = {};
  let state, setupKey, variant = 0, stagnant = 0;
  const command = async body => {
    const remaining = config.timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw Object.assign(Error('Match timeout'), { code: 'timeout' });
    const before = performance.now();
    try {
      trace.add({ operation: body.operation, role: body.role, request: body.request });
      const response = await engine.command({ match: job.id, ...body }, Math.min(30000, remaining));
      record.engineHeapPeakMiB = Math.max(record.engineHeapPeakMiB, response.trainingResources?.heapUsedMiB ?? 0);
      record.engineHeapCommittedPeakMiB = Math.max(record.engineHeapCommittedPeakMiB, response.trainingResources?.heapCommittedMiB ?? 0);
      trace.add({ code: response.code, error: response.error, revision: response.state?.revision });
      return response;
    }
    finally { record.engineMs += performance.now() - before; }
  };
  const accepted = response => {
    if (response.code !== 'ACCEPTED') throw Object.assign(Error(`${response.code}: ${response.error ?? ''}`), { code: response.code === 'HARNESS_FAILURE' ? 'harness_failure' : 'invalid_action' });
    return { ...decodeSetupStateValue(response.state, 'computer'), trainingMovement: response.trainingMovement ?? null };
  };
  try {
    state = accepted(await command({ operation: 'create', homeRoster: job.rosters[0], awayRoster: job.rosters[1], seed: job.seed }));
    while (state.phase !== 'FULL_TIME' && record.decisions < config.maxDecisions) {
      const owner = state.prompt?.actor ?? state.reaction?.actor ?? state.actor;
      if (state.callerRole !== owner) state = accepted(await command({ operation: 'load', role: owner }));
      const roleIndex = owner === 'home' ? 0 : 1, coach = job.coaches[roleIndex];
      const key = `${state.half}:${state.drive}:${owner === 'home' ? state.homeTurn : state.awayTurn}`;
      if (turnKeys[owner] !== key) { counts[owner] = 0; turnKeys[owner] = key; }
      const setup = state.phase === 'SETUP' ? `${owner}:${key}` : null;
      if (setupKey !== setup) { setupKey = setup; variant = 0; }
      // Home is a synthetic coach, with its own memory. No opponent private state is copied.
      const view = { ...state, computer: { ...(state.computer ?? {}), seed: job.seed, opponentId: 'coach-bogruk-weak', policyVersion: 'bogruk-v1',
        attackDirection: owner === 'home' ? 1 : -1, movement: owner === 'home' ? state.trainingMovement : state.computer?.movement ?? null, policyState: memory[owner], progress: { turnKey: key, stalledTurns: state.computer?.progress?.stalledTurns ?? 0 } } };
      const scored = [], before = performance.now();
      const teacher = coach !== 'gobbo' || config.trajectories === 'on'
        ? chooseBogrukDecision(view, { parameters: job.parameters[roleIndex], recklessness: config.recklessness === 'on', setupVariant: variant, onCandidates: list => scored.push(...list) })
        : { decision: null, nextPolicyState: { version: 1, turnKey: key, actions: Math.min(256, counts[owner] + 1), mistakeUsed: false, plan: null } };
      let outcome = teacher, features, candidates, inference;
      if (coach === 'gobbo') outcome = { decision: chooseDecision(view, () => policyRandom(job.seed, `${owner}:${state.revision}`), counts[owner], variant), reason: 'Training Gobbo.', nextPolicyState: { ...teacher.nextPolicyState, plan: null } };
      if (config.trajectories === 'on' || coach === 'learned') {
        candidates = offeredCandidates(view, teacher, scored);
        if (teacher.decision && candidates.length) features = encode(view, candidates);
      }
      if (coach === 'learned' && features && candidates.length > 1) {
        record.inferenceCount++;
        const learned = await withFallback(teacher, async () => {
          const reply = await infer(job.ports?.[roleIndex] || config.inferencePort, features, config.inferenceTimeoutMs, config.sample === 'on', (job.seed + record.decisions) >>> 0);
          if (record.modelHashes[roleIndex] && record.modelHashes[roleIndex] !== reply.modelHash) throw Error('Inference model changed during a game');
          const chosen = candidates[reply.index];
          inference = reply;
          record.modelHashes[roleIndex] = inference.modelHash;
          return { decision: chosen.decision, reason: 'Training learned policy.', nextPolicyState: { ...teacher.nextPolicyState, plan: chosen.plan ?? null } };
        });
        outcome = learned.outcome;
        if (learned.fallback) record.fallbackCount++;
      }
      record.policyMs += performance.now() - before;
      if (!outcome.decision) throw Error(`No decision in ${state.phase}/${state.turnMode}`);
      const request = { version: 2, type: 'setup', requestId: `${job.id}-${record.decisions}`, matchId: state.matchId, expectedRevision: state.revision, ...outcome.decision };
      if (owner === 'away' && isComputerGameOperation(request.operation)) request.computerDecision = {
        policyVersion: 'bogruk-v1', reason: outcome.reason, nextPolicyState: outcome.nextPolicyState };
      const response = await command({ operation: 'apply', role: owner, request });
      digest.update(JSON.stringify({ owner, revision: state.revision, decision: outcome.decision, code: response.code }));
      record.decisions++;
      if (record.decisions % 20 === 0) progress({ id: job.id, decisions: record.decisions });
      if (response.code === 'ILLEGAL_SETUP' && request.operation === 'confirm' && variant < 70) { variant++; if (response.state) state = decodeSetupStateValue(response.state, 'computer'); continue; }
      const next = accepted(response);
      memory[owner] = outcome.nextPolicyState; counts[owner]++;
      if (features && trajectories && outcome.decision.operation === 'action') {
        const chosen = candidates.findIndex(c => c.decision.actionId === outcome.decision.actionId);
        if (chosen >= 0) {
          const retained = await trajectories.add({ schemaVersion: 1, episode: job.id, step: record.decisions, actor: owner, coach,
          features, choices: candidates.map(c => c.decision), scores: candidates.map(c => c.score), chosen,
          teacher: candidates.findIndex(c => c.decision.actionId === teacher.decision.actionId), logProbability: inference?.logProbability ?? null,
          value: inference?.value ?? null, modelHash: inference?.modelHash ?? null });
          if (retained) record.trajectoryRows++; else { record.trajectoryDroppedRows++; record.trajectoryComplete = false; }
        }
      }
      stagnant = next.revision === state.revision ? stagnant + 1 : 0;
      if (stagnant > 10) throw Object.assign(Error('Accepted actions stopped advancing'), { code: 'invalid_action_loop' });
      state = next;
    }
    record.completed = state.phase === 'FULL_TIME';
    if (!record.completed) record.failureCode = 'decision_cap';
  } catch (error) { record.failureCode = error.code ?? 'harness_failure'; record.error = error.message.slice(0, 4096); }
  finally {
    if (!engine.error) try { await engine.command({ operation: 'close', match: job.id }, 1000); } catch { /* Host is already being recycled. */ }
  }
  record.durationMs = Date.now() - started; record.decisionHash = digest.digest('hex');
  record.score = [state?.homeScore ?? 0, state?.awayScore ?? 0]; record.turns = [state?.homeTurn ?? 0, state?.awayTurn ?? 0];
  record.casualties = ['home', 'away'].map(role => state?.players.filter(p => p.role === role && p.offPitch === 'casualty').length ?? 0);
  record.result = record.completed ? record.score[0] === record.score[1] ? 'draw' : record.score[0] > record.score[1] ? 'home' : 'away' : null;
  // Terminal rows join bounded trajectory shards without holding whole episodes in RAM.
  if (trajectories && !await trajectories.add({ schemaVersion: 1, episode: job.id, terminal: true, completed: record.completed,
    trajectoryComplete: record.trajectoryComplete, trajectoryRows: record.trajectoryRows, fallbackCount: record.fallbackCount,
    score: record.score, result: record.result, failureCode: record.failureCode })) {
    record.trajectoryDroppedRows++; record.trajectoryComplete = false;
  }
  const sampled = config.traceEvery > 0 && job.seed % config.traceEvery === 0;
  if (record.failureCode || sampled) record.diagnosticSaved = await diagnostic(trace.snapshot(record, state, engine.diagnostic));
  return record;
}
