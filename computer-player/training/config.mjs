import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function hardware() {
  let gpus = [], contended = false;
  try { gpus = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,memory.free,utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').map(line => {
    const [name, total, free, utilization] = line.split(',').map(s => s.trim());
    return { name, vramMiB: Number(total), freeMiB: Number(free), utilization: Number(utilization) };
  }); } catch { /* NVIDIA tooling is optional. */ }
  try {
    const listing = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('ps', ['-eo', 'comm='], { encoding: 'utf8', timeout: 5000 });
    contended = /java(?:\.exe)?/i.test(listing) || (listing.match(/node(?:\.exe)?/gi) ?? []).length > 1;
  } catch { contended = true; }
  return { cores: os.availableParallelism(), totalMiB: Math.floor(os.totalmem() / 1048576), freeMiB: Math.floor(os.freemem() / 1048576), gpus, contended, platform: process.platform };
}
export function defaults(machine, profile = 'low') {
  if (!['low', 'balanced', 'high'].includes(profile)) throw Error('profile must be low, balanced, or high');
  const fraction = { low: 0.125, balanced: 0.25, high: 0.5 }[profile];
  const budget = Math.floor(Math.min(machine.totalMiB * 0.6, machine.freeMiB * 0.6));
  const heapMiB = 768;
  const workers = Math.max(1, Math.min(Math.floor(machine.cores * fraction), Math.floor(budget / (heapMiB + 256))));
  const large = (machine.gpus[0]?.vramMiB ?? 0) >= 12000;
  return { workers, heapMiB, totalHeapMiB: Math.max(0, budget), matchesPerJvm: 1,
    modelWidth: large ? 64 : 32, batchSize: large ? 128 : 32, mixedPrecision: !!machine.gpus.length, threads: profile === 'low' ? 1 : 2 };
}
export function argumentsOf(argv = process.argv.slice(2)) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw Error(`Expected --option value: ${argv[i]}`);
    const name = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/Mib$/, 'MiB');
    result[name] = argv[i + 1];
  }
  return result;
}
export function configuration(input = {}, machine = hardware()) {
  const permitted = new Set(('profile workers heapMiB totalHeapMiB matchesPerJvm games seed home away rosters maxDecisions timeoutMs budgetSeconds recycle priority output java classpathFile classpath trajectories trajectoryMiB shardMiB diagnosticsMiB traceEvery recklessness inferenceTimeoutMs inferencePort homePort awayPort homeParams awayParams runId sample generations population promotionMatches resume opponentWeights benchmark').split(' '));
  for (const key of Object.keys(input)) if (!permitted.has(key)) throw Error(`Unknown option: ${key}`);
  const profile = input.profile ?? 'low';
  const config = { ...defaults(machine, profile), games: 2, seed: 42, home: 'bogruk', away: 'gobbo', rosters: 'Human,Orc', maxDecisions: 4000,
    timeoutMs: 180000, budgetSeconds: 120, recycle: 50, priority: 'below-normal', output: '.tools/training', java: 'java',
    classpathFile: '.tools/training-classpath.txt', trajectories: 'off', trajectoryMiB: 64, shardMiB: 8, diagnosticsMiB: 16, traceEvery: 100, recklessness: 'off', inferenceTimeoutMs: 2000,
    inferencePort: 0, homePort: 0, awayPort: 0, profile, ...input };
  for (const name of ['workers', 'heapMiB', 'totalHeapMiB', 'matchesPerJvm', 'games', 'seed', 'maxDecisions', 'timeoutMs', 'budgetSeconds', 'recycle', 'trajectoryMiB', 'shardMiB', 'inferenceTimeoutMs', 'inferencePort', 'homePort', 'awayPort']) {
    config[name] = Number(config[name]);
    if (!Number.isSafeInteger(config[name]) || config[name] < (['seed', 'inferencePort', 'homePort', 'awayPort'].includes(name) ? 0 : 1)) throw Error(`Invalid ${name}`);
  }
  for (const name of ['diagnosticsMiB', 'traceEvery']) {
    config[name] = Number(config[name]);
    if (!Number.isSafeInteger(config[name]) || config[name] < 0 || config[name] > (name === 'diagnosticsMiB' ? 1024 : 10000)) throw Error(`Invalid ${name}`);
  }
  if (config.games % 2 || config.seed + config.games / 2 > 0xffffffff) throw Error('games must be even; seeds must fit uint32');
  if (config.games > 10000) throw Error('games is bounded at 10000 per invocation; trainers checkpoint between invocations');
  if (config.matchesPerJvm > 32 || config.heapMiB < 256 || config.maxDecisions > 20000) throw Error('Unsafe capacity, heap, or decision cap');
  if (!['below-normal', 'normal', 'low'].includes(config.priority)) throw Error('Invalid priority');
  if (!['on', 'off'].includes(config.trajectories) || !['on', 'off'].includes(config.recklessness)) throw Error('Expected on/off');
  if (config.sample !== undefined && !['on', 'off'].includes(config.sample)) throw Error('sample must be on/off');
  for (const name of ['inferencePort', 'homePort', 'awayPort']) if (config[name] > 65535) throw Error(`Invalid ${name}`);
  for (const role of ['home', 'away']) if (!['bogruk', 'gobbo', 'learned'].includes(config[role])) throw Error(`Unknown coach: ${config[role]}`);
  const budget = Math.min(config.totalHeapMiB, Math.floor(machine.totalMiB * 0.6), Math.floor(machine.freeMiB * 0.6));
  if (config.workers * (config.heapMiB + 256) > budget) throw Error(`Memory budget exceeded: reserve 40% of RAM plus 256 MiB native overhead/worker; available budget ${budget} MiB`);
  if (config.workers > Math.max(1, Math.floor(machine.cores * (machine.contended ? 0.5 : 1)))) throw Error('Worker count exceeds available CPU budget');
  config.rosters = Array.isArray(config.rosters) ? config.rosters : config.rosters.split(',');
  if (!config.rosters.length || config.rosters.some(r => !['Human', 'Orc'].includes(r))) throw Error('Supported roster pool: Human,Orc');
  config.classpath = input.classpath ?? readFileSync(config.classpathFile, 'utf8').trim();
  config.output = resolve(config.output);
  return config;
}
