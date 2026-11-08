// Local opt-in experiment. Does not start services, use credentials or change production code.
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = new Set(process.argv.slice(2));
assert.ok([...flags].every(flag => ['--smoke', '--generate-only', '--measure-only'].includes(flag)));
assert.ok(!(flags.has('--generate-only') && flags.has('--measure-only')));
const smoke = flags.has('--smoke');
const output = resolve(process.env.HISTORY_SCALING_DIR ?? resolve(root, smoke ? '.tools/history-scaling-smoke-run' : '.tools/history-scaling'));
const manifest = resolve(output, 'fixtures.json');
assert.ok(flags.has('--measure-only') ? existsSync(manifest) : !existsSync(manifest), 'Choose a fresh output directory, or --measure-only to reuse retained fixtures');
mkdirSync(output, { recursive: true });
const env = { ...process.env, HISTORY_SCALING_RUN: '1', HISTORY_SCALING_DIR: output,
  HISTORY_SCALING_LEVELS: process.env.HISTORY_SCALING_LEVELS ?? (smoke ? '0,8' : '0,32,128,512,1024'),
  HISTORY_SCALING_SAMPLES: process.env.HISTORY_SCALING_SAMPLES ?? (smoke ? '2' : '4'), JAVA_TOOL_OPTIONS: '-Xmx768m' };
const powershell = process.env.CAPTURE_POWERSHELL ?? 'C:/Users/jaken/.codex/toolchains/PowerShell/7.6.6/pwsh.exe';
assert.ok(existsSync(powershell), 'Set CAPTURE_POWERSHELL to PowerShell 7 for the pinned target-build script');
const run = (method, label, repeat, heapMiB = 768) => {
  const log = resolve(output, `${label}.log`); assert.ok(!existsSync(log), 'Refuse to overwrite experiment logs');
  const fd = openSync(log, 'wx');
  console.log(`Running ${label}; log: ${log}`);
  let result;
  try { result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'tools/target-build.ps1'),
    'test', '-Module', 'ffb-server', '-Test', `HistoryScalingWorkloadTest#${method}`],
  { cwd: root, env: { ...env, JAVA_TOOL_OPTIONS: `-Xmx${heapMiB}m`, HISTORY_SCALING_REPEAT: String(repeat ?? 1) }, stdio: ['ignore', fd, fd], windowsHide: true }); }
  finally { closeSync(fd); }
  if (result.error || result.status !== 0) throw Error(`History workload failed: inspect ${log}`);
  console.log(`PASS ${label}`);
};
if (!flags.has('--measure-only')) {
  const sha = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
  writeFileSync(resolve(output, 'provenance.json'), JSON.stringify({ startedAtUtc: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    harnessSha256: sha('ffb-server/src/test/java/com/fumbbl/ffb/server/match/HistoryScalingWorkloadTest.java'),
    runnerSha256: sha('tools/diagnostics/run-history-scaling.mjs'), cpu: cpus()[0]?.model, platform: process.platform,
    levels: env.HISTORY_SCALING_LEVELS, samplesPerCohort: Number(env.HISTORY_SCALING_SAMPLES), measurementHeapMiB: 768, preparationVerificationHeapMiB: 2048,
    warmup: 'One excluded native action per history/action/storage cohort; a fresh JVM per repetition',
    limitations: ['Legal out-and-back setup placements create synthetic long histories, not a complete competitive match',
      'Identical current two-player pitch and forced successful pass/catch dice; 22-player match roster remains',
      'Real SetupApplication action/checkpoint/reply with in-memory repository; SQL, transport and browser excluded',
      'Cold load and recovery verification are outside measured action handling',
      'Compaction cohorts set the resident journal cursor to its 31-entry boundary immediately before the action; payload and current pitch are unchanged'] }, null, 2));
  run('generateFixtures', 'generate', 1, 2048);
}
if (!flags.has('--generate-only')) {
  run('verifyFixtures', 'verify', 1, 2048);
  for (let repeat = 1; repeat <= (smoke ? 1 : 3); repeat++) run('measureFixtures', `measure-${repeat}`, repeat);
}
console.log(`History experiment complete: ${output}`);
