// Real authenticated loopback workload; mutates only a retained synthetic acceptance match.
// Save proposal/cancel pairs restore ACTIVE status without predicting or executing game outcomes.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = 'http://localhost:5000';
const checkpointPairs = Number(process.env.CAPTURE_CHECKPOINT_PAIRS ?? 0);
assert.ok(Number.isInteger(checkpointPairs) && checkpointPairs >= 0 && checkpointPairs <= 24);
assert.match(await (await fetch(`${origin}/firebase-web-config.js`)).text(), /"environment":\s*"local-dev"/);
const tokens = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_TOKENS_FILE, 'utf8'));
const retained = JSON.parse(await readFile(process.env.COACH_ACCEPTANCE_RESUME_FROM, 'utf8'));
const role = retained.state?.actor;
assert.ok(['home', 'away'].includes(role));
assert.match(tokens[role]?.uid ?? '', /^acceptance-(home|away)-[0-9a-f-]{36}$/);
assert.match(retained.matchId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
const output = resolve(process.env.COACH_ACCEPTANCE_EVIDENCE ?? '.tools/performance-followup/native-authorization');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/login`);
  const report = await page.evaluate(async ({ token, uid, matchId, checkpointPairs }) => {
    const { authentication } = await import('/assets/auth-client.js');
    const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const client = authentication(); await signInWithCustomToken(client.auth, token);
    if (client.auth.currentUser?.uid !== uid) throw Error('SYNTHETIC_IDENTITY_MISMATCH');
    const socket = new WebSocket('ws://127.0.0.1:22232/browser/v2');
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(Error('SOCKET_FAILED')); });
    const requests = new Map();
    socket.onmessage = event => {
      const reply = JSON.parse(event.data), pending = requests.get(reply.requestId);
      if (!pending) return;
      if (reply.type === 'diagnosticsTiming') pending.timing = reply.timing;
      else { pending.reply = reply; pending.rtt = performance.now() - pending.started; }
      if (pending.reply && (!pending.timed || pending.timing || pending.reply.code !== 'ACCEPTED')) { clearTimeout(pending.timer); requests.delete(reply.requestId); pending.resolve(pending); }
    };
    const send = (fields, timed = true) => new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const pending = { started: performance.now(), timed, resolve,
        timer: setTimeout(() => { requests.delete(requestId); reject(Error('NATIVE_REQUEST_TIMEOUT')); }, 20000) };
      requests.set(requestId, pending); socket.send(JSON.stringify({ version: 2, requestId, ...fields }));
    });
    const accepted = result => { if (result.reply.code !== 'ACCEPTED') throw Error(`NATIVE_${result.reply.code}`); return result; };
    let state, proposal;
    const samples = [];
    const record = (scenario, result) => samples.push({ scenario, requestId: result.reply.requestId, code: result.reply.code, rttMs: result.rtt, timing: result.timing });
    try {
      accepted(await send({ type: 'authenticate', bearer: await client.auth.currentUser.getIdToken() }, false));
      accepted(await send({ type: 'diagnostics', operation: 'configure', enabled: true }, false));
      state = accepted(await send({ type: 'setup', operation: 'load', matchId })).reply.state;
      if ((!checkpointPairs && state.phase !== 'PLAY') || state.saveResume?.status !== 'ACTIVE') throw Error('RETAINED_MATCH_NOT_ACTIVE_PLAY');
      const player = state.players.find(player => player.role === state.callerRole && player.x !== null);
      if (!checkpointPairs && !player) throw Error('RETAINED_PLAYER_UNAVAILABLE');
      for (let repeat = 1; repeat <= (checkpointPairs || 3); repeat++) {
        const advisory = () => send({ type: 'movementRange', matchId, expectedRevision: state.revision, playerId: player.id });
        if (!checkpointPairs) record(`warm-advisory-${repeat}`, accepted(await advisory()));
        const request = accepted(await send({ type: 'setup', operation: 'saveRequest', matchId, expectedRevision: state.revision }));
        state = request.reply.state; proposal = state.saveResume.proposalId; record(`warm-mutation-${repeat}`, request);
        const canceled = accepted(await send({ type: 'setup', operation: 'saveCancel', matchId, expectedRevision: state.revision, proposalId: proposal }));
        state = canceled.reply.state; proposal = null; record(`warm-cancel-${repeat}`, canceled);
        if (!checkpointPairs) {
          await new Promise(resolve => setTimeout(resolve, 5100));
          record(`expired-advisory-${repeat}`, accepted(await advisory()));
        }
      }
      return { version: 1, samples, finalStatus: state.saveResume.status,
        limitations: ['Real authenticated native requests and durable save/cancel pairs on a synthetic retained match',
          checkpointPairs ? `${checkpointPairs} checkpoint save/cancel pairs; no advisory freshness comparison` : 'Three repetitions per scenario; insufficient for stable tail claims',
          'No baseline server artifact comparison; provider freshness security is covered by controlled-clock regressions'] };
    } finally {
      if (proposal) await send({ type: 'setup', operation: 'saveCancel', matchId, expectedRevision: state.revision, proposalId: proposal });
      socket.close();
    }
  }, { token: tokens[role].token, uid: tokens[role].uid, matchId: retained.matchId, checkpointPairs });
  assert.equal(report.finalStatus, 'ACTIVE'); assert.equal(report.samples.length, checkpointPairs ? checkpointPairs * 2 : 12);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(checkpointPairs ? `PASS ${checkpointPairs * 2} durable synthetic checkpoint mutations; match remains ACTIVE`
    : 'PASS real authenticated native mutation/advisory requests inside and outside the provider reuse window; synthetic match remains ACTIVE');
} finally { await browser.close(); }
