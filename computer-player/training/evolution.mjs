import { BOGRUK_PARAMETERS, PARAMETER_RANGES, validateParameters } from '../src/bogruk-parameters.mjs';
import { policyRandom } from '../src/bogruk-policy.mjs';

export function mutate(parameters, seed, sigma = 0.08) {
  const next = {};
  for (const [name, [low, high]] of Object.entries(PARAMETER_RANGES)) {
    const u = Math.max(1e-12, policyRandom(seed, `${name}:u`)), v = policyRandom(seed, `${name}:v`);
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    next[name] = Math.max(low, Math.min(high, (parameters[name] ?? BOGRUK_PARAMETERS[name]) + normal * sigma * (high - low)));
  }
  return validateParameters(next);
}
export function completePairs(records) {
  const pairs = new Map();
  for (const record of records) { const key = record.pair; if (!pairs.has(key)) pairs.set(key, []); pairs.get(key).push(record); }
  return [...pairs.values()].filter(pair => pair.length === 2 && pair.every(r => r.completed && !r.failureCode) && new Set(pair.map(r => r.swap)).size === 2);
}
export function candidateScore(record) {
  const role = record.swap ? 1 : 0;
  return Math.sign(record.score[role] - record.score[1 - role]);
}
export function fitness(records) {
  const pairs = completePairs(records);
  if (!pairs.length) return null;
  return pairs.flat().reduce((sum, record) => {
    const role = record.swap ? 1 : 0, score = candidateScore(record);
    return sum + (score > 0 ? 3 : score === 0 ? 1 : 0) + 0.05 * Math.max(-4, Math.min(4, record.score[role] - record.score[1 - role]));
  }, 0) / (pairs.length * 2);
}
export function wilsonLower(wins, count, z = 1.96) {
  if (!count) return 0;
  const p = wins / count, zz = z * z;
  return (p + zz / (2 * count) - z * Math.sqrt(p * (1 - p) / count + zz / (4 * count * count))) / (1 + zz / count);
}
// Paired seeds are the independent statistical units. Tied pairs count against promotion.
export function promotion(records, minimumMatches = 400) {
  const pairs = completePairs(records), wins = pairs.filter(pair => pair.reduce((n, r) => n + candidateScore(r), 0) > 0).length;
  const lower = wilsonLower(wins, pairs.length);
  return { method: '95% Wilson lower bound on won seed pairs (ties are non-wins)', pairs: pairs.length, matches: pairs.length * 2, wins, lower,
    minimumMatches, promoted: pairs.length * 2 >= minimumMatches && lower > 0.5 };
}
