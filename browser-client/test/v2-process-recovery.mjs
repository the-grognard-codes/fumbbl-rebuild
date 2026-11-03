// Opt-in destructive-process checks restricted to the isolated acceptance stack.
// No volumes or database records are removed; only a synthetic match row is locked.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const project = 'ffb-v2-acceptance';
const server = `${project}-server-1`, database = `${project}-database-1`;
const delay = ms => new Promise(done => setTimeout(done, ms));

export function validateRecoveryTarget(container, service) {
  assert.equal(container?.Name, `/${project}-${service}-1`);
  assert.equal(container.Config?.Labels?.['com.docker.compose.project'], project);
  assert.equal(container.Config.Labels['com.docker.compose.service'], service);
  if (service === 'database') {
    const mounts = container.Mounts.filter(mount => mount.Destination === '/var/lib/mysql');
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].Type, 'volume');
    assert.equal(mounts[0].Name, `${project}_database`);
  } else {
    const ports = container.HostConfig?.PortBindings?.['22227/tcp'];
    assert.deepEqual(ports, [{ HostIp: '127.0.0.1', HostPort: '22235' }]);
  }
}

export function decodeRecoveryRecord(raw) {
  const value = JSON.parse(raw);
  if (!value.$codec) return value;
  assert.equal(value.$codec, 'ffb-match-gzip-json'); assert.equal(value.version, 1);
  assert.ok(Number.isSafeInteger(value.decodedBytes) && value.decodedBytes <= 128 * 1024 * 1024);
  const decoded = gunzipSync(Buffer.from(value.payload, 'base64'), { maxOutputLength: 128 * 1024 * 1024 });
  assert.equal(decoded.length, value.decodedBytes);
  return JSON.parse(decoded.toString('utf8'));
}

export function recoveryComparable(view) {
  // Recipient-specific forecasts and sampled clocks do not alter persisted play.
  const { clock, threats, blockPreview, ...fields } = view;
  if (fields.reaction) { const { serverNow, ...reaction } = fields.reaction; fields.reaction = reaction; }
  return fields;
}

export function terminalRecoveryViews(payload) {
  assert.equal(payload.pendingTerminal, true);
  assert.equal(payload.homeView.phase, 'FULL_TIME');
  assert.equal(payload.awayView.phase, 'FULL_TIME');
  const saved = payload.saveResume;
  assert.ok(saved, 'V2 terminal recovery must retain save/resume metadata');
  const proposal = saved.proposal;
  const saveResume = { status: saved.abandoned ? 'ABANDONED' : proposal ? `${proposal.intent}_PENDING`
    : saved.suspendedAt >= 0 ? 'SUSPENDED' : 'ACTIVE', proposalId: proposal?.id ?? null,
    proposer: proposal?.proposer ?? null, expiresAt: proposal?.expiresAt ?? null };
  return [payload.homeView, payload.awayView].map(view => ({ ...view, saveResume }));
}

export function retainedRecoveryResults(results, matchId) {
  assert.match(matchId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.ok(Array.isArray(results) && results.length > 0);
  const points = new Set();
  for (const result of results) {
    assert.equal(result.matchId, matchId);
    assert.ok(['pending-decision', 'terminal-pending', 'terminal-committed'].includes(result.point));
    assert.ok(!points.has(result.point)); points.add(result.point);
    assert.equal(result.exitCode, 137); assert.equal(result.exactRetry, true);
    assert.equal(result.participantsRestored, 2); assert.equal(result.storageUnchanged, true);
    assert.match(result.storageFingerprint, /^[a-f0-9]{64}$/);
  }
  return structuredClone(results);
}

export function v2ProcessRecovery({ pages, output, matchId, state, wire, origin, previousResults = [] }) {
  const results = [...previousResults], done = new Set(results.map(result => result.point));
  let pending, release;
  async function inspect(service) {
    const name = service === 'server' ? server : database;
    const { stdout } = await run('docker', ['inspect', '--type', 'container', name], { windowsHide: true });
    const [container] = JSON.parse(stdout); validateRecoveryTarget(container, service); return container;
  }
  function id() { const value = matchId(); assert.match(value, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/); return value; }
  function sql(query) {
    return new Promise((doneQuery, reject) => {
      const child = spawn('docker', ['exec', '-i', database, 'sh', '-c',
        'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names ffb_local'], { windowsHide: true });
      const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', () => {});
      child.once('error', reject);
      child.once('close', code => code === 0 ? doneQuery(Buffer.concat(chunks).toString().trim()) : reject(Error(`Recovery SQL failed: ${code}`)));
      child.stdin.end(query);
    });
  }
  async function fingerprint() {
    const value = id();
    return sql(`SELECT generation,checkpoint_generation,SHA2(artifact_json,256) FROM ffb_match_recovery WHERE matchid='${value}'; SELECT generation,SHA2(record_json,256) FROM ffb_match_recovery_journal WHERE matchid='${value}' ORDER BY generation;`);
  }
  async function latestPayload() {
    const value = id();
    const journal = await sql(`SELECT record_json FROM ffb_match_recovery_journal WHERE matchid='${value}' ORDER BY generation DESC LIMIT 1;`);
    return journal ? decodeRecoveryRecord(journal).payload.state
      : decodeRecoveryRecord(await sql(`SELECT artifact_json FROM ffb_match_recovery WHERE matchid='${value}';`)).payload;
  }
  async function restart(point, views) {
    await inspect('database'); const before = await inspect('server');
    assert.equal(before.State.Running, true);
    const beforeStorage = await fingerprint(); assert.ok(beforeStorage);
    const requests = await Promise.all(pages.slice(0, 2).map(page => page.evaluate(() => window.__acceptance.outgoing)));
    const candidates = requests.flatMap((frames, index) => frames.filter(request => request.type === 'setup'
      && request.operation !== 'load' && request.expectedRevision === views[index].revision - 1).map(request => ({ request, index })));
    const last = candidates.at(-1); assert.ok(last, `${point}: accepted request available for exact retry`);
    assert.match(before.Id, /^[a-f0-9]{64}$/);
    await run('docker', ['kill', '--signal', 'KILL', before.Id], { windowsHide: true });
    let killed;
    try {
      killed = await inspect('server'); assert.equal(killed.Id, before.Id);
      assert.equal(killed.State.ExitCode, 137); assert.equal(killed.State.OOMKilled, false);
    } finally {
      // Restore the verified container even when post-kill inspection fails.
      try { await release?.(); release = undefined; }
      finally { await run('docker', ['start', before.Id], { windowsHide: true }); }
    }
    let after;
    for (let attempt = 0; attempt < 90; attempt++) {
      after = await inspect('server'); if (after.State.Health?.Status === 'healthy') break; await delay(1000);
    }
    assert.equal(after.State.Health?.Status, 'healthy'); assert.equal(after.Image, before.Image);
    assert.notEqual(after.State.StartedAt, before.State.StartedAt);
    // Completed matches reject new live spectators; coaches still load the final snapshot.
    const participants = pages.slice(0, 2);
    if (views[0].phase === 'FULL_TIME' && pages.length > 2) {
      for (const spectator of pages.splice(2)) await spectator.close();
    }
    await Promise.all(pages.map((page, index) => page.goto(`${origin}/play/match?matchId=${id()}${index > 1 ? '&watch=1' : ''}`)));
    await Promise.all(pages.map(page => page.getByLabel('Live match pitch').waitFor()));
    for (let index = 0; index < participants.length; index++) {
      await participants[index].waitForFunction(revision => window.__acceptance.incoming.some(message => message.state?.revision === revision), views[index].revision);
      assert.deepEqual(recoveryComparable(await state(participants[index])), recoveryComparable(views[index]), `${point}: participant ${index}`);
    }
    const response = await wire(participants[last.index], last.request);
    assert.equal(response.code, 'ACCEPTED'); assert.equal(response.duplicate, true);
    assert.deepEqual(recoveryComparable(response.state), recoveryComparable(views[last.index]));
    assert.equal(await fingerprint(), beforeStorage, 'Load and exact retry preserve checkpoint and journal bytes');
    results.push({ point, matchId: id(), revision: views[0].revision, phase: views[0].phase, exitCode: killed.State.ExitCode,
      image: after.Image, exactRetry: true, participantsRestored: 2, storageUnchanged: true,
      storageFingerprint: createHash('sha256').update(beforeStorage).digest('hex') });
    await writeFile(resolve(output, 'process-recovery.json'), JSON.stringify(results, null, 2));
    console.log(`V2 process recovery passed: ${point}`);
  }
  return {
    get pending() { return pending; },
    async inspect(view) {
      const point = view.prompt && view.revision > 0 ? 'pending-decision' : view.phase === 'FULL_TIME' ? 'terminal-committed' : null;
      if (!point || done.has(point)) return;
      await restart(point, await Promise.all(pages.slice(0, 2).map(state))); done.add(point);
    },
    async beforeAction(view, action) {
      if (view.half !== 2 || view.homeTurn !== 8 || view.awayTurn !== 8 || action?.kind !== 'endTurn' || done.has('terminal-pending')) return;
      await inspect('server'); await inspect('database'); const value = id();
      const child = spawn('docker', ['exec', '-i', database, 'sh', '-c',
        'exec mariadb -uroot -p"$(cat /run/secrets/db_root_password)" --batch --raw --skip-column-names --unbuffered ffb_local'], { windowsHide: true });
      const connectionId = await new Promise((locked, reject) => {
        let text = ''; const timer = setTimeout(() => { child.kill(); reject(Error('Terminal row lock timed out')); }, 15000);
        child.stdout.on('data', chunk => { text += chunk; const match = /V2_LOCK:(\d+)/.exec(text); if (match) { clearTimeout(timer); locked(Number(match[1])); } });
        child.stderr.on('data', () => {}); child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', () => { clearTimeout(timer); reject(Error('Terminal row lock exited')); });
        child.stdin.end(`START TRANSACTION; SELECT match_id FROM ffb_prepared_matches WHERE match_id='${value}' FOR UPDATE; SELECT CONCAT('V2_LOCK:',CONNECTION_ID()); DO SLEEP(90); ROLLBACK;`);
      });
      release = () => sql(`KILL ${connectionId};`).catch(() => {});
      pending = (async () => {
        try {
          for (let attempt = 0; attempt < 250; attempt++) {
            const payload = await latestPayload();
            if (payload.pendingTerminal) {
              await restart('terminal-pending', terminalRecoveryViews(payload)); done.add('terminal-pending'); return;
            }
            await delay(200);
          }
          throw Error('Terminal recovery checkpoint did not reach the locked save boundary');
        } finally { await release?.(); release = undefined; }
      })();
      pending.catch(() => {});
    },
    async finishPending() { if (pending) { const current = pending; try { await current; } finally { pending = undefined; } } },
    async close() { await release?.(); await pending?.catch(() => {}); },
    assertComplete() { for (const point of ['pending-decision', 'terminal-pending', 'terminal-committed']) assert.ok(done.has(point), `Missing process recovery point: ${point}`); },
  };
}
