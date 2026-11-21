import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { argumentsOf } from './config.mjs';
import { BOGRUK_PARAMETERS } from '../src/bogruk-parameters.mjs';
import { atomicJson, hash } from './records.mjs';

const args = argumentsOf();
if (!args.run) throw Error('Usage: node computer-player/training/report.mjs --run <run-directory>');
const summary = JSON.parse(await readFile(join(args.run, 'summary.json'), 'utf8'));
const lines = ['# Training run', '', `Completed ${summary.completed}/${summary.attempted} matches in ${(summary.durationMs / 1000).toFixed(1)} s.`,
  '', `Hardware: ${summary.machine.cores} logical cores, ${summary.machine.totalMiB} MiB RAM, ${summary.machine.gpus.map(g => `${g.name} (${g.vramMiB} MiB)`).join(', ') || 'no NVIDIA GPU detected'}.`,
  `Profile: ${summary.config.profile}; ${summary.config.workers} workers × ${summary.config.heapMiB} MiB; ${summary.config.matchesPerJvm} matches/JVM. Contended: ${summary.machine.contended}.`,
  '', '| Seconds | Matches/hour | Decisions/second |', '|---:|---:|---:|', ...summary.samples.map(s => `| ${s.seconds.toFixed(1)} | ${s.matchesPerHour.toFixed(1)} | ${s.decisionsPerSecond.toFixed(1)} |`), '',
  `Failures: ${JSON.stringify(summary.failures)}.`, `Inference: ${summary.records.reduce((n,r) => n+(r.fallbackCount??0),0)} fallbacks / ${summary.records.reduce((n,r) => n+(r.inferenceCount??0),0)} requests.`, '', '## Reproduction', ''];
const written = new Set();
lines.push('## Retention and resources', '',
  `Trajectory rows retained: ${summary.records.reduce((n,r)=>n+(r.trajectoryRows??0),0)}; dropped: ${summary.records.reduce((n,r)=>n+(r.trajectoryDroppedRows??0),0)}.`,
  `Trajectory-incomplete games: ${summary.records.filter(r=>r.trajectoryComplete === false && summary.config.trajectories === 'on').length}. PPO excludes these episodes.`,
  `Java heap high-water sample: ${Math.max(0,...summary.records.map(r=>r.engineHeapPeakMiB??0)).toFixed(1)} MiB (sampled after engine responses, not a continuous peak).`,
  `Bounded diagnostic tails saved: ${summary.records.filter(r=>r.diagnosticSaved).length}. A tail is not a full replay.`, '');
for (const r of summary.records.filter(r => r.failureCode)) {
  const paths = [];
  for (const parameters of r.parameters) {
    const path = join(args.run, `reproduce-${hash(parameters).slice(0, 16)}.json`);
    if (!written.has(path)) { await atomicJson(path, { schemaVersion: 1, parameters }); written.add(path); }
    paths.push(path);
  }
  lines.push(`- ${r.id} (${r.failureCode}): \`node computer-player/training/run.mjs --seed ${r.seed} --games 2 --home ${r.coaches[0]} --away ${r.coaches[1]} --rosters ${r.rosters.join(',')} --max-decisions ${summary.config.maxDecisions} --timeout-ms ${summary.config.timeoutMs} --recklessness ${summary.config.recklessness} --home-params "${paths[0]}" --away-params "${paths[1]}"\`.`);
  if (r.coaches.includes('learned')) lines.push(`  Start inference with model hashes ${JSON.stringify(r.modelHashes)} and supply its current --home-port/--away-port; old localhost ports are not reusable checkpoint identities.`);
}
for (const path of args.trainingReport ? [args.trainingReport] : [join(dirname(args.run), 'report.json'), join(dirname(args.run), 'checkpoint.json')]) {
  let training; try { training = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  lines.push('', '## Training progress', '', `Generation: ${training.generation ?? 'n/a'}; steps: ${training.steps ?? 'see iteration history'}.`,
    ...((training.history ?? []).map(row => `- ${JSON.stringify(row)}`)));
  if (training.heldout_agreement !== undefined) lines.push(`Held-out agreement: ${training.heldout_agreement}; samples/second: ${training.samples_per_second}.`);
  break;
}
lines.push('', '## Utilisation', '', 'CPU is whole-machine utilisation; GPU is the device sample, including other work.', '',
  '| Seconds | CPU % | GPU % | Node RSS MiB |', '|---:|---:|---:|---:|',
  ...summary.samples.map(s => `| ${s.seconds.toFixed(1)} | ${s.systemCpuPercent?.toFixed(1) ?? 'unavailable'} | ${s.gpuUtilization ?? 'unavailable'} | ${s.rssMiB.toFixed(1)} |`));
try {
  const ladder = JSON.parse(await readFile('computer-player/training/ladder.json', 'utf8'));
  lines.push('', '## Ladder', '', '| Agent | Elo | Matches |', '|---|---:|---:|',
    ...Object.entries(ladder.agents).map(([name, a]) => `| ${name} | ${a.elo.toFixed(1)} | ${a.matches} |`), '',
    'Pair-win confidence intervals (ties count as non-wins):',
    ...ladder.evaluations.map(e => `- ${e.agent} vs ${e.opponent}: ${e.evidence.pairs} seed pairs, 95% interval [${e.evidence.lower.toFixed(3)}, ${e.evidence.upper.toFixed(3)}].`));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const directory of ['computer-player/training/champions', 'computer-player/ml/champions']) {
  let files; try { files = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  lines.push('', `## ${directory}`, '');
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const champion = JSON.parse(await readFile(join(directory, file), 'utf8'));
    lines.push(`- ${file}: parent ${champion.parent}; evidence ${JSON.stringify(champion.evidence)}.`);
    for (const [name, value] of Object.entries(champion.parameters ?? {})) if (value !== BOGRUK_PARAMETERS[name]) lines.push(`  - ${name}: ${BOGRUK_PARAMETERS[name]} → ${value}`);
  }
}
lines.push('', 'No strength claim follows from a smoke sample. Promotion requires independent paired evaluation.');
await writeFile(join(args.run, 'report.md'), `${lines.join('\n')}\n`);
console.log(join(args.run, 'report.md'));
