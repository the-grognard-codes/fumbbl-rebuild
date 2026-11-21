# Computer opponent learning roadmap

Date: 2026-11-20 (America/New_York).

## Decision and current priority

Preserve the working self-play harness and preliminary `/training` page as an experimental foundation and showcase. Prepare them for integration with the main project, without a remote training service or claims of improved playing strength.

Further AI research is deferred. The owner's immediate priorities are game polish, graphics, UI improvements, and adding more teams. Do not start replay collection, large training batches, or overnight jobs as a consequence of this roadmap.

## Four intended opponent tiers

| Tier | Audience | Intended experience |
|---|---|---|
| Bogruk | Players new to Blood Bowl | Meaningful, coherent actions with approachable weaknesses; a stable beginner opponent. |
| Improving | Casual players developing their skills | Reliable fundamentals, fewer tactical mistakes, and useful strategic pressure. |
| Seasoned | Experienced players seeking a challenge | Strong positioning, risk management, and adaptation, validated against experienced humans. |
| Elite | Competitive experts | The strongest learned policy we can develop; eventually aspire to exceed the strongest humans over many games. |

The random coach is an engineering baseline, not one of the four intelligent tiers. These product tiers are distinct from the numbered implementation stages in the original harness specification.

Difficulty should reflect measured playing behavior and human experience, not arbitrary random blunders or simply the number of training games. Preserve beginner Bogruk separately as stronger versions develop. Dice mean even an elite opponent will lose individual games; superhuman performance is an unproven research target, not a release promise.

## Recommended learning sequence

Use **human imitation learning first, then reinforcement learning**, retaining human examples where they remain useful. Avoid spending substantial compute on initial RL only to overwrite it with imitation.

Imitation learning asks which action a human coach chose in a position. It can teach useful habits efficiently. RL uses outcomes from played games to improve a policy beyond its starting examples. The harness supports both: evaluating imitation models, exposing weaknesses, collecting new experience, and comparing versions.

AlphaGo and AlphaStar provide precedents for combining human demonstrations with subsequent self-play. They support this direction, not a prediction of Blood Bowl's required compute or achievable strength:

- [Google Research: AlphaGo](https://research.google/blog/alphago-mastering-the-ancient-game-of-go-with-machine-learning/)
- [Google DeepMind: AlphaStar](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/)

## Resume here when AI work becomes a priority

1. **Replay feasibility pilot:** inspect 50–100 selected FUMBBL games after confirming supported access and permitted use. Reconstruct each pre-decision state, legal choices, and chosen action. Prove action compatibility with our authoritative engine before collecting at scale. A replay archive's existence does not establish training readiness.
2. **Compatibility and quality:** identify ruleset, roster, skill, and client-version differences. Initially limit data to compatible BB2025 games and supported teams. Exclude future dice results and later events from model inputs. Retain skilled play in losses as well as wins; dice outcomes are not labels for decision quality.
3. **Imitation baseline:** split training and evaluation by whole games and coaches, rather than random individual decisions. Measure held-out imitation performance and actual play against Bogruk on independent seed pairs. Broaden data and model coverage before scaling compute.
4. **Decision coverage:** the current candidate-ranking learner does not control every decision; setup and some other operations still use Bogruk logic. Expose additional decisions deliberately before claiming a fully learned coach.
5. **RL fine-tuning:** train against a varied pool including Bogruk, the imitation baseline, older versions, and newer challengers. Preserve independent evaluation to distinguish broad improvement from exploiting one opponent.
6. **Human calibration:** evaluate candidate tiers with their intended audiences. Gate elite claims on sufficiently broad competitive evidence; consider search only as a future design question.

Acceptance gates, rather than fixed game counts, determine when to advance. Small RL checks can verify plumbing, but major RL batches wait for a useful learned starting policy.

## Evidence at the stopping point

The fixed harness completed all 20 paired Bogruk/Gobbo games in 220.806 seconds, using two reused JVMs with 768 MiB heaps. The original batch completed ten games with nine timeouts and one setup failure. The rerun had zero failures, approximately 326 completed games/hour, and a sampled per-JVM heap peak of 408.45 MiB. Throughput was measured on a contended machine and is not a guaranteed sustained rate.

This was an execution/evaluation test, with trajectories disabled. It did not train a stronger policy. Results occupied approximately 212 KB before the extra comparison file. The prior bounded learning demonstrations establish pipeline execution, not human-level strength.

Artifacts remain in the retention worktree under `.tools/training/2026-11-21T02-06-16-904Z-20652`; do not commit raw runs, weights, virtual environments, or machine-specific classpaths.

## Integration boundary

- Local-only launch controls with explicit resource and time budgets; opening the page never starts a run.
- Static `/training` remains a read-only showcase/viewer. No public execution API, background training, or automatic data publication.
- Human and Orc are the current synthetic roster pool, regardless of teams added to normal play later.
- Optional Python/CUDA dependencies stay outside normal server and browser startup.
- Compact results persist; detailed traces remain bounded and cleanup requires explicit application.
- Preserve shared casualty setup recovery in normal computer play and the harness.

Related work: [#567](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/567), [#591](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/591), [#592](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/592). See [harness usage](../../computer-player/training/README.md) and [retention outcome](training-retention-setup-outcome.md).
