// Opt-in real-engine acceptance runner. Java's test harness owns game creation and recovery.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { decodeSetupStateValue } from '../../browser-client/src/setup-protocol.ts';
import { assertV2Projection } from '../../browser-client/src/v2-projection.ts';
import { chooseComputerDecision, isComputerGameOperation } from '../src/computer-policy.mjs';
import { chooseDecision } from '../src/policy.mjs';

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw Error(`Missing ${name} value`);
  return value;
};
const java = option('--java', 'java');
const classpath = option('--classpath', null);
const homeRoster = option('--home-roster', 'Human');
const awayRoster = option('--away-roster', 'Orc');
const seed = Number(option('--seed', '42'));
const maximum = Number(option('--max-decisions', '4000'));
const timeout = Number(option('--timeout-ms', '180000'));
const output = option('--output', null);
const captureState = option('--capture-state', null);
const recklessness = option('--recklessness', 'on');
if (!classpath || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(maximum) || maximum < 1 || maximum > 20000
  || !Number.isInteger(timeout) || timeout < 1000 || timeout > 1800000 || !['on', 'off'].includes(recklessness)) {
  throw Error('Usage: node test/engine-match.mjs --java <exe> --classpath <test+main+dependencies> [--home-roster Human] [--away-roster Orc] [--seed 42] [--max-decisions 4000] [--timeout-ms 180000] [--recklessness on|off] [--output <json>]');
}

const started = Date.now();
const child = spawn(java, ['-cp', classpath, 'com.fumbbl.ffb.server.match.BogrukEngineHarness', homeRoster, awayRoster, String(seed)],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let pending = null;
let diagnostic = '';
let fatal = null;
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-8192); });
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  if (!pending) { fatal = Error(`Unexpected harness output: ${line.slice(0, 200)}`); return; }
  const current = pending; pending = null; clearTimeout(current.timer);
  try { current.resolve(JSON.parse(line)); }
  catch (error) { current.reject(Error(`Invalid harness JSON: ${line.slice(0, 200)} (${error.message})`)); }
});
const fail = error => {
  fatal = error;
  if (pending) { const current = pending; pending = null; clearTimeout(current.timer); current.reject(error); }
};
child.on('error', fail);
child.on('exit', (code, signal) => fail(Error(`Engine harness exited (${code ?? signal}). ${diagnostic}`)));
child.stdin.on('error', fail);

async function command(body) {
  if (fatal) throw fatal;
  const remaining = timeout - (Date.now() - started);
  if (remaining <= 0) throw Error('Engine match wall-time limit reached');
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, timer: setTimeout(() => {
      pending = null; reject(Error(`Engine response timed out. ${diagnostic}`));
    }, Math.min(30000, remaining)) };
    child.stdin.write(`${JSON.stringify(body)}\n`);
  });
}
function accepted(response) {
  assertV2Projection(response);
  assert.equal(response.version, 2);
  assert.equal(response.code, 'ACCEPTED', JSON.stringify(response));
  return decodeSetupStateValue(response.state);
}

let homeRandomState = seed || 0x12345678;
const homeRandom = () => {
  homeRandomState ^= homeRandomState << 13; homeRandomState ^= homeRandomState >>> 17; homeRandomState ^= homeRandomState << 5;
  return (homeRandomState >>> 0) / 4294967296;
};
const summary = { homeRoster, awayRoster, seed, recklessness, completed: false, decisions: 0, invalid: 0, stalledResponses: 0,
  duplicateChecks: 0, restoreChecks: 0, deliberateRisks: 0, reasons: {}, actionKinds: {}, kickTargets: [], elapsedMs: 0,
  policyElapsedMs: 0, maximumPolicyMs: 0 };
let state;
let homeTurnKey = null;
let homeActions = 0;
let setupKey = null;
let setupVariant = 0;
let noRevisionProgress = 0;
let captured = false;

try {
  state = accepted(await command({ operation: 'load', role: 'away' }));
  while (state.phase !== 'FULL_TIME' && summary.decisions < maximum) {
    if (Date.now() - started > timeout) throw Error('Engine match wall-time limit reached');
    const owner = state.prompt?.actor ?? state.reaction?.actor ?? state.actor;
    if (state.callerRole !== owner) state = accepted(await command({ operation: 'load', role: owner }));
    const turnKey = `${state.half}:${state.drive}:${state.homeTurn}`;
    if (homeTurnKey !== turnKey) { homeTurnKey = turnKey; homeActions = 0; }
    const currentSetupKey = state.phase === 'SETUP' ? `${state.half}:${state.drive}:${state.actor}` : null;
    if (setupKey !== currentSetupKey) { setupKey = currentSetupKey; setupVariant = 0; }
    if (captureState && !captured && owner === 'away' && state.phase === 'PLAY') {
      await mkdir(dirname(captureState), { recursive: true }); await writeFile(captureState, `${JSON.stringify(state)}\n`); captured = true;
    }
    const policyStarted = performance.now();
    const outcome = owner === 'away' ? chooseComputerDecision(state, { setupVariant, recklessness: recklessness !== 'off' })
      : { decision: chooseDecision(state, homeRandom, homeActions, setupVariant), reason: 'Human fixture random decision.', nextPolicyState: null };
    const policyElapsed = performance.now() - policyStarted;
    summary.policyElapsedMs += policyElapsed;
    summary.maximumPolicyMs = Math.max(summary.maximumPolicyMs, policyElapsed);
    if (!outcome.decision) throw Error(`Policy has no decision at ${state.phase}/${state.turnMode}, actor ${owner}, revision ${state.revision}`);
    const request = { version: 2, type: 'setup', requestId: `engine-${seed}-${summary.decisions}`, matchId: state.matchId,
      expectedRevision: state.revision, ...outcome.decision };
    if (owner === 'away' && isComputerGameOperation(request.operation)) request.computerDecision = {
      policyVersion: state.computer.policyVersion, reason: outcome.reason, nextPolicyState: outcome.nextPolicyState };
    const action = state.actions.find(item => item.id === outcome.decision.actionId);
    const kind = action?.kind ?? outcome.decision.operation;
    summary.lastDecision = { owner, revision: state.revision, operation: request.operation, actionId: request.actionId ?? null,
      kind, reason: outcome.reason };
    summary.actionKinds[kind] = (summary.actionKinds[kind] ?? 0) + 1;
    if (owner === 'away') {
      summary.reasons[outcome.reason] = (summary.reasons[outcome.reason] ?? 0) + 1;
      if (outcome.reason.startsWith('Deliberate risk:')) summary.deliberateRisks++;
      if (action?.kind === 'kickoff') summary.kickTargets.push(action.target);
    }
    const response = await command({ operation: 'apply', role: owner, request });
    summary.decisions++;
    if (response.code === 'ILLEGAL_SETUP' && request.operation === 'confirm') {
      setupVariant++;
      if (response.state) state = decodeSetupStateValue(response.state);
      continue;
    }
    if (response.code !== 'ACCEPTED') { summary.invalid++; throw Error(`Rejected ${kind}: ${JSON.stringify(response)}`); }
    const next = accepted(response);
    if (next.revision === state.revision) {
      summary.stalledResponses++; noRevisionProgress++;
      if (noRevisionProgress > 10) throw Error('Eleven accepted responses did not advance revision');
    } else noRevisionProgress = 0;
    if (owner === 'home' && request.operation === 'action') homeActions++;
    if (summary.decisions % 37 === 0) {
      const duplicate = await command({ operation: 'apply', role: owner, request });
      assert.equal(duplicate.duplicate, true, 'request history must recognize the exact replay');
      const repeated = accepted(duplicate);
      assert.equal(repeated.revision, next.revision, 'a duplicate cannot advance the match');
      assert.deepEqual(repeated.computer, next.computer, 'a duplicate cannot advance private policy state');
      summary.duplicateChecks++;
    }
    state = next;
    if (summary.decisions % 100 === 0) {
      console.error(`[engine-match] ${summary.decisions} decisions; revision ${state.revision}; half ${state.half}; turns ${state.homeTurn}/${state.awayTurn}; score ${state.homeScore}-${state.awayScore}; ${Date.now() - started} ms`);
      const privateBefore = state.callerRole === 'away' ? state : accepted(await command({ operation: 'load', role: 'away' }));
      const restored = accepted(await command({ operation: 'restore', role: 'away' }));
      assert.equal(restored.revision, privateBefore.revision, 'recovery must retain match revision');
      assert.deepEqual(restored.computer, privateBefore.computer, 'recovery must retain the entire policy checkpoint');
      state = restored; summary.restoreChecks++;
    }
  }
  summary.completed = state.phase === 'FULL_TIME';
  summary.final = { phase: state.phase, revision: state.revision, half: state.half, homeTurn: state.homeTurn, awayTurn: state.awayTurn,
    homeScore: state.homeScore, awayScore: state.awayScore };
  if (!summary.completed) throw Error(`Decision limit ${maximum} reached before full time`);
} catch (error) {
  summary.error = error.message;
  if (diagnostic) summary.diagnostic = diagnostic;
  process.exitCode = 1;
} finally {
  summary.elapsedMs = Date.now() - started;
  lines.close(); child.stdin.destroy(); child.kill();
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`); }
  console.log(JSON.stringify(summary));
}
