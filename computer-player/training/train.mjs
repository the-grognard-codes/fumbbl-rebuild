import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from './run.mjs';
import { argumentsOf } from './config.mjs';
import { atomicJson, hash } from './records.mjs';
import { mutate, fitness, promotion } from './evolution.mjs';
import { BOGRUK_PARAMETERS, validateParameters } from '../src/bogruk-parameters.mjs';

export async function train(input, simulate = run) {
  const generations = Number(input.generations ?? 3), population = Number(input.population ?? 4), games = Number(input.games ?? 8), minimumMatches = Number(input.promotionMatches ?? 400);
  if (![generations, population, games, minimumMatches].every(n => Number.isSafeInteger(n) && n > 0) || games % 2 || minimumMatches % 2) throw Error('Invalid training counts');
  const output = resolve(input.output ?? '.tools/training/es'), checkpoint = join(output, 'checkpoint.json');
  let state = { schemaVersion: 1, generation: 0, champion: BOGRUK_PARAMETERS, parent: null, history: [], seed: Number(input.seed ?? 42) };
  if (input.resume === 'on') {
    state = JSON.parse(await readFile(checkpoint, 'utf8'));
    if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.generation) || state.generation < 0 || !Array.isArray(state.history)) throw Error('Unsupported checkpoint');
    state.champion = validateParameters(state.champion);
  }
  const deadline = Date.now() + Number(input.budgetSeconds ?? 120) * 1000;
  let stopped = false;
  const stop = () => { stopped = true; }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const weights = (input.opponentWeights ?? '0.5,0.3,0.2').split(',').map(Number);
  if (weights.length !== 3 || weights.some(w => !Number.isFinite(w) || w < 0) || weights.reduce((a,b) => a+b,0) <= 0) throw Error('Invalid opponent weights');
  try {
    for (; state.generation < generations && !stopped && Date.now() < deadline;) {
      const evaluated = [];
      for (let i = 0; i < population && !stopped && Date.now() < deadline; i++) {
        const candidate = mutate(state.champion, state.seed + state.generation * population + i), candidatePath = join(output, 'candidate.json');
        await atomicJson(candidatePath, { schemaVersion: 1, parameters: candidate });
        await atomicJson(join(output, 'champion.json'), { schemaVersion: 1, parameters: state.champion });
        let weighted = 0, totalWeight = 0;
        for (let opponent = 0; opponent < 3 && !stopped && Date.now() < deadline; opponent++) {
          if (!weights[opponent]) continue;
          const summary = await simulate({ ...input, output, games, home: 'bogruk', away: opponent === 2 ? 'gobbo' : 'bogruk', homeParams: candidatePath,
            awayParams: opponent === 0 ? join(output, 'champion.json') : undefined,
            seed: state.seed + state.generation * 10000, budgetSeconds: Math.max(1, Math.ceil((deadline - Date.now()) / 1000)) });
          const score = fitness(summary.records);
          if (score !== null) { weighted += score * weights[opponent]; totalWeight += weights[opponent]; }
        }
        if (totalWeight === weights.reduce((a,b) => a+b,0)) evaluated.push({ parameters: candidate, fitness: weighted / totalWeight });
      }
      // Interrupted generations replay from their seed; partial fitness cannot advance or promote.
      if (evaluated.length !== population || stopped || Date.now() >= deadline) break;
      evaluated.sort((a,b) => b.fitness - a.fitness);
      const best = evaluated[0];
      await atomicJson(join(output, 'candidate.json'), { schemaVersion: 1, parameters: best.parameters });
      const gate = await simulate({ ...input, output, games: minimumMatches, home: 'bogruk', away: 'bogruk', homeParams: join(output, 'candidate.json'), awayParams: join(output, 'champion.json'),
        seed: state.seed + 1000000 + state.generation * minimumMatches, budgetSeconds: Math.max(1, Math.ceil((deadline - Date.now()) / 1000)) });
      const evidence = promotion(gate.records, minimumMatches);
      if (evidence.promoted) {
        const champion = { schemaVersion: 1, parameters: best.parameters, parent: hash(state.champion), generation: state.generation, evidence, engineCommit: gate.config.engineCommit };
        const directory = 'computer-player/training/champions';
        await mkdir(directory, { recursive: true });
        // A fresh training run must never replace a previous run's champion metadata.
        for (let number = 0; ; number++) {
          try { await writeFile(join(directory, `${number}.json`), `${JSON.stringify(champion, null, 2)}\n`, { flag: 'wx' }); break; }
          catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        state.parent = champion.parent; state.champion = best.parameters;
      }
      state.history.push({ generation: state.generation, fitness: best.fitness, evidence }); state.generation++;
      await atomicJson(checkpoint, state);
    }
  } finally { await atomicJson(checkpoint, state); process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  return state;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await train(argumentsOf())));
