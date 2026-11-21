# #567 implementation outcome

2026-11-16 · Branch `codex/567-coach-training-harness` ·
[Issue #567](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/567)

Review: [draft PR #570](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/570).
Pushed for owner review; not merged, marked ready, or deployed.

The owner's latest request overrides the overnight protocol: **small samples,
no long execution**. No detached training job is left running. The original
200-match smoke, 20-full-match equivalence, 50-learned-match acceptance,
one-hour PPO and overnight experiments were intentionally not executed.
These remain unverified acceptance evidence, not claimed successes.

## Delivered

Tier 1: multiplexed test-scope Java host, parallel bounded runner, machine-derived
budgets, priority/recycling, versioned gzip records, deterministic hashes,
telemetry, failures as data and reports.

Tier 2: versioned Bogruk parameters with unchanged defaults, CPU evolution
strategy, paired evaluation, conservative Wilson promotion, atomic checkpoints
and interruption/resume.

Tier 3: pinned local CUDA venv, one Node feature encoder, compressed trajectories,
masked candidate/value model, GPU imitation training, localhost inference
batching and counted Bogruk fallback.

Tier 4: synchronous actor/learner PPO, recent/champion/heuristic opponent pool,
fixed-seed evaluations, Elo with pair confidence intervals, gated champion
metadata and resumable checkpoints. Tier 5 contains only bounded experiments.

These implementations have small-sample validation, **not** the original
overnight-scale coverage. [Usage](../../computer-player/training/README.md)
documents setup and resource controls. No trained coach ships to players.

## Hardware and limits

Detected Windows host: **12 logical cores, 16,310 MiB system RAM, RTX 5060 Ti
with 16,311 MiB VRAM**, capability **12.0**. Python **3.14.7**, PyTorch
**2.9.1+cu128**, CUDA runtime **12.8**. Real GPU matrix multiplication passed.
No alternate Python or power/sleep/driver setting changes were needed.

Other sessions were active throughout: every throughput figure is **contended**.
Free RAM varied between about 5 GiB and a few hundred MiB. The runner correctly
refused simulation with only 204 MiB inside its allocation budget and refused
two 768 MiB workers while inference occupied memory. One worker remained usable.

Low/balanced/high CPU presets and explicit worker/heap/concurrency/priority/time
limits are implemented. Allocation cannot exceed 60% of total or free RAM,
including 256 MiB native/Node allowance per worker. ML exposes model/batch/thread,
precision and per-process GPU allocator controls. The conservative default is
one match per JVM with a 768 MiB heap. No unrelated process was stopped.

## Actual sample

Twenty CUDA BC steps on 96 training decisions reached **70.21% agreement** on
94 decisions from a separate held-out episode, at **60.07 samples/second**.
An actual resume to step 21 succeeded and measured **71.28% agreement**. This
tiny corpus validates the pipeline, not generalisation or playing strength.

| Game | Learned side | Decisions | Score | Duration | Inference / fallback |
|---|---|---:|---|---:|---:|
| 0 | Home, Human | 412 | 0–0 | 33.428 s | 152 / 0 |
| 1 | Away, Human | 453 | 0–0 | 27.661 s | 171 / 0 |

Both paired-seed-42 learned-versus-Gobbo games reached full time: **2/2**, no
match failures, **0/323 fallbacks**. Simulation took about **61 seconds**,
equivalent to **117.4 full matches/hour** and **14.1 decisions/second** for this
small run. PPO then used **323 on-policy decisions in 22 optimizer batches**
and saved `checkpoint-1.pt`.

There is **no evidence of beating default Bogruk**. No promotion gate passed.
The smoke disabled evaluation/promotion; no ladder is fabricated from training
matches. Weight files are about 0.7 MB each, but remain ignored and uncommitted.

The initial 384 MiB experiment completed one Gobbo game (591 decisions) and
recorded a JVM `OutOfMemoryError` for its paired game at 669 decisions. That
incomplete pair is ineligible for fitness. The known server heap issue was not
patched as part of #567.

## Benchmark and reproducibility

Two Gobbo games capped at 60 decisions each, identical seeds, 512 MiB heaps,
below-normal priority, 60-second maximum across configurations:

| Configuration | Time | Decisions/s |
|---|---:|---:|
| One worker, fresh JVM per match | 8.520 s | 14.18 |
| One worker, two matches per JVM | 5.949 s | 20.37 |
| Two workers, one match per JVM | 4.635 s | 26.24 |

These are capped-workload rates, not completed-match throughput. Multiplexing
improved this workload by about 44%; two workers by about 85%. RAM safety,
rather than a short benchmark maximum, determines the default. No uncontended
or long thermal baseline was available.

Two real-engine paired runs repeated 60 decisions/game and produced identical
decision hashes, score, turns and cap codes. Profiling found engine work dominant:
an early Gobbo pair spent about 8 ms/match choosing policies versus 89.7 s waiting
for engine work. A Java stack sample found projection construction and cold JIT
cost. Unnecessary Bogruk planning on Gobbo-only runs was removed. Rules-engine
projection optimisation and the other heap/loop issues remain separate work.

## Requirement-by-requirement evidence

| Requirement | Status / evidence |
|---|---|
| A1 host | Implemented; focused Java isolation/capacity test passes. Calls interleave within a JVM; separate JVMs provide CPU parallelism. |
| A2 runner | Pairing, roster pool and all resource limits implemented; two full learned games verified. |
| A3 budget | Real low-memory refusals plus 8/16 GiB profile and contention unit tests. |
| A4 throughput | Time series and three-configuration benchmark above; no uncontended baseline. |
| A5 determinism | Real repeated capped runs match; full-match repetition deferred. |
| A6 records | Versioned rotating gzip shards, checksums, hashes and atomic indexes; cap/rotation tests pass. |
| A7 failures | Caps, timeout/engine errors and fallback handling implemented; actual heap failure recorded. |
| B8 parameters | Existing Bogruk regressions and seeded factory-equivalence tests pass; 20 full matches deferred. |
| B9 ES | Weighted paired champion/default/Gobbo fitness and normalized Gaussian mutation; three-generation controller test uses simulated outcomes. Real three-generation game run deferred. |
| B10 gate | Default 400 completed matches; 95% Wilson lower bound on independent won seed pairs, ties non-wins. Both directions tested; no champion promoted. |
| B11 resume | Atomic checkpoint and interrupted-generation replay; synthetic interruption/resume test passes. |
| C12 environment | Pinned venv, Windows/Linux scripts, actual sm_120 CUDA check passed. Linux scripts not executed here. |
| C13 trajectories | Bounded versioned shards consumed by actual BC and PPO; terminal match records survive trajectory caps. |
| C14 features | One acting-view Node encoder; Node/Python shapes and tensor values verified. |
| C15 model | Convolutional trunk, masked candidate/value heads, 8/16 GiB defaults and mixed-precision BC. |
| C16 BC | Actual GPU training and step/optimizer resume with held-out metrics above. |
| C17 inference | Localhost batching, limits/timeouts, CPU mode, validated legal indexes and fallback; 0% fallback in two full games. |
| C18 PPO | Actual 323-sample/22-update actor-learner smoke and checkpoint tests; one-hour/live-interruption acceptance deferred. |
| C19 evaluation | Fixed-seed evaluation, recent/checkpoint pool, Elo/pair intervals and gated promotion implemented; no evaluation ladder produced in the training-only smoke. |
| C20 reports | Markdown run report, hardware, throughput, system CPU/device GPU utilisation, failures and optional ladder/champion differences. |

## Validation and evidence

- Computer-player `npm test`: **64 passed**; focused final run: **31 passed**.
- Browser `npm test`: **540 passed**; `npm run build`: **passed**.
- Focused Maven reactor: **7 passed** (`TrainingEngineHostTest`, `ComputerPolicyStateTest`).
- Opt-in Python `python -m unittest ml.test_ml`: **2 passed**, covering cross-language
  values/shapes, masking, checkpoint load, PPO update/exclusion, device profiles and gate.
- Pinned-toolchain `mvn clean install`: **passed**, all five reactor modules,
  16:38 elapsed under contention. Surefire reports: **1,181 tests, zero failures,
  zero errors, 22 skipped** by existing suite configuration.
- Live Node-to-Python CPU inference round trip, all three PowerShell script syntax
  checks, final bounded CLI/compiled-host fingerprint check, and diff whitespace
  checks passed. Process inspection confirmed no training child remained.

Ignored local evidence: `.tools/bc-smoke.log`, `bc-resume.log`, `ppo-smoke.log`,
`training/determinism.json`, `training/benchmark.json`, and
`training/ppo-smoke/2026-11-16T22-49-04-829Z-44260/{summary.json,report.md}`.
The PPO directory also contains `report.json` and `checkpoint-1.pt`.
Initial experiments used `85e2c839b` plus #567 working changes; run metadata now
also records dirty-source state and the compiled host/fixture hash.

Self-review fixed non-finite optional feature values, explicit float tensor
types, safe checkpoint metadata, worker argument inheritance, PID lifecycle
tracking, fallback preservation and strict parameter/option checks. No server
runtime, daemon, browser product, replay or recovery code changed. Standard
browser/reactor tests cover shared paths. The shared dev-local stack was not touched.

Final review also exposed existing block-face/prompt ranks to trajectory
observers without changing Bogruk's decision, added prompt PPO cancellation
checks, and protected prior CPU champion metadata from new-run overwrites.

## Next steps

No training job remains running. The launcher defaults to a short foreground run:
`./computer-player/training/overnight.ps1 -Profile low -BudgetSeconds 120`.

1. Rebase after the separate server heap/loop fixes, then run larger acceptance
   batches with sufficient free RAM and no competing build.
2. Collect a broader complete-game corpus; compare fixed-seed agents and tune
   batching/concurrency over a longer window.
3. Run the owner-authorised long PPO/resume and promotion evaluations. Shipping
   or naming a new player-facing coach remains a separate owner decision.
