// Explicit opt-in bounded benchmark. All configurations use identical seeds and caps.
import { run } from './run.mjs';
import { argumentsOf } from './config.mjs';
import { atomicJson } from './records.mjs';
const input = argumentsOf(), deadline = Date.now() + Number(input.budgetSeconds ?? 90) * 1000, results = [];
for (const [workers, matchesPerJvm, recycle] of [[1, 1, 1], [1, 2, 50], [2, 1, 50]]) {
  if (Date.now() >= deadline) break;
  try {
    const summary = await run({ ...input, games: 2, home: 'gobbo', away: 'gobbo', maxDecisions: 60,
      workers, matchesPerJvm, recycle, budgetSeconds: Math.max(1, Math.min(30, Math.floor((deadline - Date.now()) / 1000))) });
    results.push({ workers, matchesPerJvm, recycle, durationMs: summary.durationMs, sample: summary.samples.at(-1), failures: summary.failures, contended: summary.machine.contended });
  } catch (error) { results.push({ workers, matchesPerJvm, recycle, unavailable: error.message }); }
}
await atomicJson(`${input.output ?? '.tools/training'}/benchmark.json`, results);
console.log(JSON.stringify(results, null, 2));
