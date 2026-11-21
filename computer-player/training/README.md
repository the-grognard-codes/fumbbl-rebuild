# Local computer-coach training

Experimental local tooling; the validated game batches demonstrate reliability,
not stronger AI. Start the [Training lab UI](UI.md) for bounded local evaluations
or use its static `/training` viewer without execution controls. Python/CUDA are
optional; ordinary game play and site builds do not need them.

The [learning roadmap](../../docs/specs/computer-opponent-learning-roadmap.md)
records the four intended opponent tiers and imitation-first approach. Further
research is deferred while game polish, graphics, UI and additional teams take priority.

## Memory and data retention

Simulation service mocks are stub-only: they do not record unused Mockito invocation histories. Closing a match releases its fixture and inline mock registrations; the default JVM recycling limit remains 50 games. Ordinary verification tests retain recording mocks. More RAM can support more workers, but does not substitute for per-game cleanup.

Compact match records are flushed after every game. Final summaries retain results, failures, seeds, code/parameter/model identities, timings, trajectory completeness and sampled Java heap usage. Heap peaks are sampled after engine replies, not continuously. These records and checkpoints are never removed by the detail cleanup command.

| Detail | Default | Control |
|---|---|---|
| Learning trajectories | Off for game tests; trainers explicitly enable them | `--trajectories on`, `--trajectory-mib 64` |
| Failure diagnostics | Last 16 request/response events, last state, and 4,096-character stderr tail | `--diagnostics-mib 16` per run; `0` disables persistence |
| Successful diagnostic samples | Seed divisible by 100; paired games stay together | `--trace-every 100`; `0` disables successful samples; `1` captures all |

The diagnostic payload omits an oversized state and records `stateTruncated`. Each payload is normally limited to 256 KiB before compression; shard overhead is separately bounded. The 16 MiB diagnostic and 64 MiB trajectory caps are **uncompressed byte budgets across workers**, divided equally; compressed files are usually much smaller. Manifests report rejected rows even when nothing fits. Trajectory records include behavior-policy hash, log probability and value estimate when inference supplied them. Per-game `trajectoryComplete` is false if any row or terminal was dropped; PPO excludes those episodes. BC may use retained individual supervised examples. Older records without this field retain legacy behavior; prefer new runs for complete-episode assurance.

Diagnostic tails are not full replay files. No automatic heap dump is taken. Keep results for every game; use trajectories for selected learning batches and small diagnostic samples for successful games.

For new runs, PPO also requires both the persisted compact match record and
trajectory terminal, with a matching retained decision count. Interrupted writes,
reader limits and any inference fallback exclude the episode. Evaluation and
promotion verify checkpoint identities and exclude fallback play from model credit.

### Preview and apply detail cleanup

```powershell
node computer-player/training/retention.mjs --output .tools/training --days 30 --max-mib 10240
# Review the exact run list and byte counts, then explicitly apply:
node computer-player/training/retention.mjs --output .tools/training --days 30 --max-mib 10240 --apply on
```

This is opt-in; nothing from prior experiments is automatically deleted. Runs are pruned as whole detail batches, oldest first, when older than the age limit or above the aggregate detail-file budget. Summaries, match shards, metadata, parameter files, models and unrelated files survive. An index remains with `pruned: true` so learners report a clear error instead of silently reading missing data. A run without `summary.json` is protected, as are runs completed within the last 24 hours (`--grace-hours`) and any run containing a `keep-details` file. Pin any older batch before using it for training; do not run cleanup concurrently with a learner consuming an unpinned batch. Protected data may leave the budget exceeded; the preview reports this instead of deleting it. No recursive delete is used, symlinked directories are skipped, and paths/checksums are validated before removal.

Measured early samples used about 10 KB per attempt for compact results and about 240 KB per completed game for compressed training traces. Allow roughly 0.5–1 MB/game for planning; this is not a guarantee. Models and deliberate debugging heap dumps are separate. Review actual sizes as policies and games become more complex.

Implements [#567](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/567).
This tooling plays synthetic BB2025 exhibitions locally. It has no accounts,
network game server, daemon integration, player-facing coach identity, or deployment.
Human and Orc are the complete roster pool currently supported by `RosterCatalog`.
All commands below start in the repository root unless a `cd` is shown.

## Quick start: two games, bounded resources

Use Node 26 and the project's JDK 21/Maven toolchain (`tools/bootstrap.ps1`).
Build the opt-in test-scope engine host and resolve its classpath:

```powershell
./computer-player/training/prepare.ps1
node computer-player/training/run.mjs --profile low --games 2 --budget-seconds 120
```

`prepare.ps1` also accepts `-JavaHome`, `-Maven`, and `-Repository` for an
existing pinned installation. Linux: `sh computer-player/training/prepare.sh`
with `JAVA_HOME` set; optional `MAVEN` and `REPOSITORY` environment variables.
The host deliberately stays in `ffb-server/src/test`: existing fixture mocks
replace external services, while the real rules engine owns dice and legality.
No additional Maven/npm dependency or production entry point is introduced.

## Resource controls

The default is **low**, not an overnight run. Every runner invocation has a
120-second wall-clock budget. `--profile low|balanced|high` chooses roughly
one-eighth, one-quarter, or one-half of logical cores, constrained by RAM.
The run prints detected cores, total/free RAM, GPU name/VRAM/utilisation,
contention, and its effective settings. PyTorch's separate `ml.check` verifies
CUDA availability; detecting an NVIDIA device alone does not prove PyTorch works.

| Option | Default / meaning |
|---|---|
| `--workers` | Profile-derived JVM/Node worker count; at most half the cores under contention |
| `--heap-mib` | 768 MiB per JVM |
| `--total-heap-mib` | Additional aggregate ceiling; includes 256 MiB native/Node allowance per worker |
| `--matches-per-jvm` | 1; use 2+ to amortise startup when sufficient heap is available (maximum 32) |
| `--recycle` | 50 matches; recycle between batches |
| `--priority` | `below-normal`; also `low` and `normal` |
| `--budget-seconds` | 120, overall invocation limit |
| `--timeout-ms` | 180000, individual match limit |
| `--max-decisions` | 4000, at most 20000 |
| `--games` | 2; even, at most 10000 per invocation |
| `--shard-mib` / `--trajectory-mib` | 8 per shard / 64 total uncompressed trajectory bytes per run |

Total allocations cannot exceed 60% of **either** total RAM or currently free
RAM, including the native allowance. Explicit overrides cannot bypass that
guard. An already busy machine can therefore refuse even the low profile;
wait for its other work to finish or reduce workers. No process belonging to
another session is stopped. No power, sleep, driver, or system setting changes.

The two-match multiplexed benchmark improved startup throughput, but a 384 MiB
full-game experiment hit the known server heap problem. One 768 MiB JVM with
one match in flight remains the conservative default. Use `benchmark.mjs` to
measure the target machine before increasing concurrency. Its capped workloads
measure decisions/second; they are not completed-match throughput estimates.

```powershell
node computer-player/training/benchmark.mjs --budget-seconds 60 --heap-mib 768
node computer-player/training/run.mjs --profile balanced --workers 2 --heap-mib 1024 --matches-per-jvm 2 --games 4 --budget-seconds 180
```

CPU telemetry is whole-machine utilisation; GPU telemetry is device utilisation.
Contention detection is conservative (existing Java/Node processes). Keep a
browser open if desired; the budget reserves memory for it. Thermal or load
changes appear in the time series. Windows defaults to below-normal priority.
JSON commands for different matches are interleaved in one JVM; engine calls
are serialized because engine factories contain shared state. Separate workers
provide CPU parallelism. A match exception discards only that fixture; a JVM
crash fails its in-flight matches and the next batch starts a fresh process.

## Pairings, records, and reproducibility

`--home bogruk|gobbo|learned`, `--away ...`, `--rosters Human,Orc`, and `--seed 42`
control fixtures. Consecutive matches share a seed and swap both coach and roster
assignments. Recklessness defaults off (`--recklessness on` enables it).
`--home-params file.json` and `--away-params file.json` accept `{ "parameters": {...} }`.

Each run gets a fresh `.tools/training/<timestamp>-<pid>/` directory containing
hardware/config metadata, rotating `matches-*.jsonl.gz` shards and a checksummed
index, a summary, and optional trajectory shards. Match records contain seed,
roles, parameter/model hashes, engine commit, score, casualties suffered,
turns, decisions, a decision-sequence hash, timings, inference fallback counts,
and failure codes. `decision_cap`, `timeout`, `invalid_action_loop`,
`invalid_action`, `harness_failure`, and `budget_exhausted` are data, not wins.
Failed/incomplete seed pairs are excluded from fitness and promotion.
Run directories are never overwritten. Checkpoints and shard indexes use
same-directory atomic replacement. A crash can lose the open shard, not a
published shard. Version mismatches and checksum mismatches are rejected.

```powershell
node computer-player/training/report.mjs --run .tools/training/<run>
```

The report includes throughput, system CPU/device GPU utilisation, failures,
reproduction settings, an available ladder, and champion parameter differences.
It discovers sibling ES/PPO progress automatically; `--training-report <json>`
can select a BC metrics file or another trainer's progress record.
Use the recorded parameters and model hashes when reproducing tuned/learned
failures. Timing and machine utilisation are intentionally nondeterministic;
decision hashes, outcomes, seeds, rosters, and failure codes can be compared.

## CPU evolution strategy

`src/bogruk-parameters.mjs` holds version 1 defaults and ranges. Positive weights
normally range from zero to three times their default; negative penalties from
three times their default to zero. Probabilities range from zero to one;
kick depths from 1 to 11, action budget from 1 to 256, path expansions from
100 to 5000. Board geometry, dice probabilities, and rules constants stay fixed.
`createBogrukPolicy()` validates and freezes a parameter set. Production calls
the same policy with unchanged defaults.

```powershell
node computer-player/training/train.mjs --generations 3 --population 2 --games 2 --budget-seconds 120
node computer-player/training/train.mjs --generations 3 --population 2 --games 2 --budget-seconds 120 --resume on
```

This is a bounded `(1 + lambda)` Gaussian mutation strategy over normalised
parameter ranges. Fitness weights against champion/default Bogruk/Gobbo default
to `0.5,0.3,0.2` (`--opponent-weights`). Scores are win 3, draw 1, loss 0 plus
0.05 times touchdown difference clipped to ±4. Promotion uses separate seeds.
The checkpoint records the champion, seed, generation and evaluation history.
Interrupted generations replay from their original mutation seed; partial
evaluations do not become champions. Ctrl+C stops the runner and saves progress.

The promotion gate requires **400 completed matches (200 paired seeds)** by
default (`--promotion-matches`). The independent trial is a seed pair, not two
correlated games. A pair is won when the candidate's combined win/draw/loss
score is positive; tied pairs count as non-wins. Its two-sided 95% Wilson
**lower** bound must exceed 0.5. This is deliberately conservative. A short
smoke test cannot clear the default gate. CPU champion metadata is stored under
`training/champions/`; learned champions use `ml/champions/`. No champion ships
to players automatically.

## Optional CUDA stack

```powershell
./computer-player/ml/setup.ps1
cd computer-player
../.tools/ml-venv/Scripts/python.exe -m ml.check --device cuda
cd ..
```

Linux: `sh computer-player/ml/setup.sh`. The requirements pin PyTorch 2.9.1 and
NumPy 2.3.5 from the [official CUDA 12.8 wheel index](https://download.pytorch.org/whl/cu128/).
See [PyTorch's installation commands](https://pytorch.org/get-started/previous-versions/).
Python **3.14.7 worked on this Windows machine**; no alternate interpreter was
needed. If its platform wheel is unavailable, create the venv with a supported
Python 3.12/3.13 executable via `setup.ps1 -Python <path>` (or `PYTHON=...` on
Linux). The venv and all weights stay in ignored `.tools/` directories. Normal
Node, Maven, and browser builds never import Python or require a GPU.

CPU tests use `--device cpu`. CUDA checks include device name, VRAM, capability,
runtime version and a real GPU matmul. The reference profile is width 64/batch
128 for ≥12 GiB VRAM; width 32/batch 32 for smaller devices (including 8 GiB).
Override `--width`, `--batch-size`, `--threads`, `--mixed-precision on|off` in BC.
BC, PPO and inference accept `--gpu-memory-fraction` (default 0.5); this bounds
the process's allocator, not GPU utilisation percentage or system power.
Inference additionally offers `--batch-size`, `--batch-wait-ms`, and `--timeout`.

## Trajectories and behaviour cloning

```powershell
node computer-player/training/run.mjs --games 2 --trajectories on --budget-seconds 120
cd computer-player
../.tools/ml-venv/Scripts/python.exe -m ml.train_bc --data ../.tools/training/<run> --output ../.tools/training/bc.pt --steps 20 --batch-size 8 --budget-seconds 30
```

Feature schema 1 is encoded **only in Node**, from the acting coach's visible
projection. It contains 26×15×26 board values (own/opponent occupancy and stats,
standing/prone/stunned/used, active player, tackle zones, ball, separate end zones),
16 globals, and 12 values per legal candidate. Both teams attack right; turns,
rerolls and score difference are relative to the caller. Candidate features
include action kind, target, path estimate, success estimate and heuristic score.
Scoring plans are deduplicated by offered action ID. Actions outside Bogruk's
tactical scoring loop carry score zero; imitation uses the explicit teacher
choice rather than treating those zeros as calibrated scores. Setup and other
non-action operations remain deterministic Bogruk decisions.

Shards record choices, teacher labels, acting coach, optional behaviour-policy
log probabilities/model hash, and terminal outcomes. Match records supply
terminal outcomes even when the trajectory cap fills. BC reports agreement on
an **episode-disjoint** held-out set and samples/second; it can use valid teacher
decisions from capped episodes. PPO uses only complete successful episodes with
the exact behaviour checkpoint hash, never fallbacks or capped episodes.

BC checkpoints include weights, optimizer state and step. Resume with
`--resume <checkpoint>` and a higher `--steps` ceiling. Checkpoints load using
PyTorch `weights_only=True`; metadata contains only JSON primitives.

## Inference and PPO

```powershell
# From computer-player: listen only on localhost; port 0 selects a free port.
../.tools/ml-venv/Scripts/python.exe -m ml.serve --checkpoint ../.tools/training/bc.pt --port 0 --ready ../.tools/inference.json
# In another terminal, from the repository root, use the printed port:
node computer-player/training/run.mjs --home learned --home-port <port> --away gobbo --games 2 --budget-seconds 120
```

The server batches length-prefixed requests from different matches. The runner
validates returned indexes and only submits server-offered actions. Errors or
timeouts fall back to Bogruk, counted in match records. `--sample on` enables
seeded stochastic actions for on-policy collection; evaluation is greedy.

```powershell
# From computer-player: one short actor/learner iteration, no large evaluation.
../.tools/ml-venv/Scripts/python.exe -m ml.train_rl --checkpoint ../.tools/training/bc.pt --output ../.tools/training/ppo --iterations 1 --games 2 --matches-per-jvm 1 --budget-seconds 180 --evaluate off --promote off
```

PPO freezes the behaviour policy during each rollout, then performs two clipped
PPO epochs (ratio clip 0.2, value coefficient 0.5, entropy 0.01, gradient norm
0.5). Returns are terminal +1/0/−1; shaping is zero throughout. Its pool cycles
through Gobbo, default Bogruk, a recent learned checkpoint, and the champion;
`--pool` and `--tuned <parameters.json>` enable a tuned opponent. Normal runs
evaluate on fixed seeds, update `training/ladder.json`, and gate promotion
against the champion on separate paired seeds. Ladder entries include pair-win
confidence intervals; Elo ratings alone are descriptive, not evidence of strength.
Resume by passing the last `checkpoint-N.pt` and a higher `--iterations` limit.
Checkpoint sidecars retain the champion pointer without changing the weight hash.

## Explicit longer runs

`overnight.ps1` is a foreground convenience launcher. It defaults to **120
seconds**, prints the hardware through the runner, and never starts a detached
job or changes sleep settings. Select `-Mode es|bc|ppo`, `-Profile`, and an
explicit `-BudgetSeconds`; BC needs `-Data`, PPO needs `-Checkpoint`.
If the owner chooses to run overnight, keep the machine connected to power and
awake using their normal Windows power controls. The harness does not manage
those controls. Ctrl+C stops owned children; never terminate other sessions.

The bounded validation and remaining large acceptance runs are recorded in
[the outcome](../../docs/specs/computer-coach-training-harness-outcome.md).
