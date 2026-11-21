import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { argumentsOf, configuration, hardware } from './config.mjs';
import { atomicJson, Shards, hash } from './records.mjs';
import { validateParameters } from '../src/bogruk-parameters.mjs';

export async function run(input = {}, suppliedJobs = null) {
  const machine = hardware(), config = configuration(input, machine);
  config.engineCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  config.sourceDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  const fixtureDirectory = new URL('../../ffb-server/target/test-classes/com/fumbbl/ffb/server/match/', import.meta.url);
  config.hostBuildHash = hash(Buffer.concat(await Promise.all(['TrainingEngineHost.class', 'BogrukEngineFixture.class'].map(name => readFile(new URL(name, fixtureDirectory))))));
  const parameters = await Promise.all(['homeParams', 'awayParams'].map(async name => {
    if (!config[name]) return validateParameters({});
    const document = JSON.parse(await readFile(config[name], 'utf8'));
    if (document.schemaVersion !== undefined && document.schemaVersion !== 1 || !document.parameters
      || typeof document.parameters !== 'object' || Array.isArray(document.parameters)) throw Error(`Invalid parameter file: ${config[name]}`);
    return validateParameters(document.parameters);
  }));
  const jobs = suppliedJobs ?? Array.from({ length: config.games }, (_, index) => {
    const pair = Math.floor(index / 2), swap = index % 2;
    const rosters = [config.rosters[pair % config.rosters.length], config.rosters[(pair + 1) % config.rosters.length]];
    const coaches = [config.home, config.away], params = [...parameters], ports = [config.homePort, config.awayPort];
    if (swap) { rosters.reverse(); coaches.reverse(); params.reverse(); ports.reverse(); }
    return { id: `match-${index}`, seed: config.seed + pair, pair, swap, rosters, coaches, parameters: params, ports };
  });
  await mkdir(config.output, { recursive: true });
  config.output = join(config.output, input.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  await mkdir(config.output, { recursive: false });
  const started = Date.now(), records = [], samples = [], active = [], pids = new Map(), decisions = new Map();
  const cpuTimes = () => os.cpus().reduce((acc, cpu) => ({ idle: acc.idle + cpu.times.idle, total: acc.total + Object.values(cpu.times).reduce((a,b) => a+b,0) }), { idle: 0, total: 0 });
  let previousCpu = cpuTimes();
  const shards = new Shards(config.output, 'matches', config.shardMiB * 1048576);
  let writes = Promise.resolve(), stopped = false;
  const stop = () => { stopped = true; for (const worker of active) { worker.postMessage('stop'); const pid = pids.get(worker); if (pid) try { process.kill(pid); } catch {} } };
  const timer = setTimeout(stop, config.budgetSeconds * 1000);
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const sample = () => {
    const seconds = (Date.now() - started) / 1000;
    const cpu = cpuTimes(), delta = cpu.total - previousCpu.total;
    let gpuUtilization = null;
    try { gpuUtilization = Number(execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 2000, windowsHide: true, stdio: ['ignore','pipe','ignore'] }).trim().split('\n')[0]); } catch {}
    const point = { seconds, matches: records.length, completed: records.filter(r => r.completed).length,
      matchesPerHour: records.filter(r => r.completed).length * 3600 / seconds, attemptsPerHour: records.length * 3600 / seconds, decisionsPerSecond: [...decisions.values()].reduce((n, d) => n + d, 0) / seconds,
      systemCpuPercent: delta ? 100 * (1 - (cpu.idle - previousCpu.idle) / delta) : null, gpuUtilization, rssMiB: process.memoryUsage().rss / 1048576 };
    previousCpu = cpu;
    samples.push(point); console.error(`[training] ${point.matches}/${jobs.length} matches; ${point.matchesPerHour.toFixed(1)}/h; ${point.decisionsPerSecond.toFixed(1)} decisions/s`);
  };
  const progress = setInterval(sample, 10000);
  await atomicJson(join(config.output, 'metadata.json'), { schemaVersion: 1, machine, config, started: new Date(started).toISOString() });
  console.error(JSON.stringify({ machine, profile: config.profile, workers: config.workers, heapMiB: config.heapMiB, matchesPerJvm: config.matchesPerJvm, output: config.output }));
  try {
    await Promise.all(Array.from({ length: Math.min(config.workers, jobs.length) }, (_, index) => new Promise((resolveWorker, reject) => {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), { execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')), workerData: { config, index, jobs: jobs.filter((_, i) => i % config.workers === index) } });
      active.push(worker);
      worker.on('message', message => {
        if (message.pid) pids.set(worker, message.pid);
        if (message.exitedPid === pids.get(worker)) pids.delete(worker);
        if (message.progress) decisions.set(message.progress.id, message.progress.decisions);
        if (message.error) console.error(message.error);
        if (message.record) {
          records.push(message.record); decisions.set(message.record.id, message.record.decisions);
          // Publish each compact result durably, even when later games or the launcher fail.
          writes = writes.then(async () => { await shards.add(message.record); await shards.flush(); });
        }
      });
      worker.on('error', error => console.error(`Worker ${index}: ${error.message}`));
      worker.on('exit', code => {
        if (code !== 0) console.error(`Worker ${index} exited ${code}`);
        resolveWorker();
      });
    })));
  } finally { clearTimeout(timer); clearInterval(progress); process.off('SIGINT', stop); process.off('SIGTERM', stop); stop(); }
  const seen = new Set(records.map(r => r.id));
  for (const job of jobs.filter(j => !seen.has(j.id))) {
    const record = { schemaVersion: 1, ...job, completed: false, failureCode: Date.now() - started >= config.budgetSeconds * 1000 ? 'budget_exhausted' : 'harness_failure', decisions: decisions.get(job.id) ?? 0, durationMs: 0, score: [0, 0], result: null };
    records.push(record); writes = writes.then(() => shards.add(record));
  }
  await writes; await shards.flush(); sample();
  const failures = {};
  for (const record of records) if (record.failureCode) failures[record.failureCode] = (failures[record.failureCode] ?? 0) + 1;
  const summary = { schemaVersion: 1, output: config.output, machine, config, durationMs: Date.now() - started, attempted: records.length,
    completed: records.filter(r => r.completed).length, failures, samples, records: records.sort((a, b) => a.id.localeCompare(b.id)) };
  await atomicJson(join(config.output, 'summary.json'), summary);
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const summary = await run(argumentsOf());
  console.log(JSON.stringify({ output: summary.output, completed: summary.completed, failures: summary.failures, durationMs: summary.durationMs }));
}
