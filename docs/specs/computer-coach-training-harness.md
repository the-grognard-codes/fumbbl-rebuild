# Feature: Self-play training harness and learned computer coach

Current direction (2026-11-20): consolidate the existing harness and read-only
showcase for main-project integration, then defer further AI work in favor of game
polish, graphics, UI and teams. See the [learning roadmap](computer-opponent-learning-roadmap.md).
The original research-scale acceptance runs below remain deferred and are not
prerequisites for the experimental tooling release. No automatic long run is authorized.

Implementation note (2026-11-16): the owner's subsequent implementation request
requires a small sample and **no long execution**, overriding the overnight and
large-run instructions below. See the [implementation outcome](computer-coach-training-harness-outcome.md)
for delivered work, bounded evidence and deferred long acceptance checks.

Date: 2026-11-16. Owner decisions: a fast headless runner and a dependency-free
Node tuning loop over Bogruk's weights first; then use the owner's CUDA GPU for
a learned policy. Work runs unattended overnight; follow the
[overnight iteration protocol](#overnight-iteration-protocol) and take the work
as far as it will go.
Tracker: [#567](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/567).

## Abstract

Build a local system that plays complete BB2025 matches between computer
coaches as fast as the owner's PC allows, records every result, and improves the
computer coach from those games in two ways:

1. **Weight tuning (CPU).** Evolve a parameterised Bogruk's heuristic weights
   by self-play, with a statistically sound promotion gate.
2. **Learned policy (GPU).** Record trajectories, train a neural network on the
   CUDA GPU to imitate Bogruk, then improve it with self-play reinforcement
   learning against a pool of opponents, evaluated on an Elo ladder.

Both run unattended for hours and resume across nights.

## Objective

Give the project a repeatable way to improve the computer coach from game
outcomes, using all of the owner's main PC: CPU cores for match simulation and
the GPU for network training and batched inference.

## Target machines

Training runs on the owner's **main PC**: Windows, NVIDIA RTX 5070-class GPU
with **16 GB VRAM** (Blackwell, sm_120, so PyTorch must be built for CUDA 12.8
or newer). Its CPU core count and RAM are not recorded here; detect them.

Implementation may happen on a **different machine**, for example the owner's
laptop (Ryzen 7 260, 16 threads, ≈15 GB RAM, RTX 5060 Laptop with 8 GB VRAM,
Python 3.14.7). Therefore:

- Never hard-code hardware. At start-up, detect logical cores, total and free
  RAM, GPU name, VRAM and CUDA availability, print them, and record them in
  every run's metadata and report.
- Derive defaults from what is detected: worker count from cores, total engine
  heap from RAM (leave at least 40% of RAM for the OS, the ML stack and a
  browser), model width, batch size and mixed precision from VRAM. Every
  default can be overridden on the command line.
- Size the reference model and batch settings for the 16 GB main PC, with an
  automatic smaller profile for 8 GB GPUs so the code is testable on the laptop.
- Use a project venv; if CUDA wheels for Python 3.14 are unavailable, use a
  supported Python version (via `py -3.x` or `uv`) and document it.
- Report throughput over time (thermal throttling shows up there) and never
  change power, sleep, driver or system settings. Document in the README how
  the owner keeps the main PC awake for long runs.

## Context / Existing Behavior

- Bogruk: [`bogruk-policy.mjs`](../../computer-player/src/bogruk-policy.mjs)
  (336 lines) and [`bogruk-board.mjs`](../../computer-player/src/bogruk-board.mjs)
  (visible board estimates, bounded paths), spec
  [bogruk-weak-computer-coach.md](bogruk-weak-computer-coach.md). Constants are
  partly in `BOGRUK_SETTINGS` (`riskChances [0.3, 0.5, 0.7]`, `maxActions 192`,
  `maxPathExpansions 1800`) and partly inline (for example the `-35` failure
  penalty and `0.35` step cost in move scoring, kick depths 3/9, the
  `10000 - steps` safe-score rule). Randomness is seeded through
  `policyRandom(seed, key)`; `options.random` injects test randomness.
- Gobbo (random): [`policy.mjs`](../../computer-player/src/policy.mjs);
  dispatcher `computer-policy.mjs` (`chooseComputerDecision`).
- Headless engine: `BogrukEngineHarness` and `BogrukEngineFixture` in
  `ffb-server/src/test/java/com/fumbbl/ffb/server/match/` speak JSON lines
  (`load`, `apply`, `restore`; role `home`/`away`) for one match per JVM, with
  no network or credentials.
  [`computer-player/test/engine-match.mjs`](../../computer-player/test/engine-match.mjs)
  drives one match end to end (`--home-roster`, `--away-roster`, `--seed`,
  `--max-decisions`, `--recklessness`) and counts decisions per period with
  `period-decision-counts.mjs`. Projections are validated with
  `assertV2Projection` from the browser client.
- Known issues in the same area: #561/#562/#563 (reroll-choice loop to the
  1,024-decision guard), #554 and #524 (server heap). They may land while this
  work is in progress; rebase rather than fix them here, and treat their
  symptoms as recorded failures.

## In Scope

- A multi-match headless engine host and a parallel runner with crash isolation.
- Bounded, versioned match records and optional trajectories.
- A parameterised Bogruk whose defaults reproduce current Bogruk exactly.
- An evolution-strategy trainer with checkpoint/resume and a promotion gate.
- A GPU learning stack (Python + PyTorch, opt-in, isolated under
  `computer-player/ml/`): feature encoding, behaviour cloning, self-play RL,
  a batched inference server, an Elo ladder and model checkpoints.
- A learned-policy coach usable by the runner (not by players).
- CLI tools, progress output, reports and a README.

## Out of Scope

- Shipping any trained coach to players, changing production Bogruk or Gobbo,
  their identities, the daemon or hosted deployments. A later owner decision
  adds a new coach identity.
- Rules-engine changes beyond what hosting matches requires.
- Cloud, multi-machine or distributed training.
- Any Python or GPU requirement for `npm test`, `mvn clean install` or the
  browser build. The ML stack is strictly opt-in.

## Functional Requirements

### A. Simulation

1. **Engine host.** A runnable entry point outside the server runtime (for
   example in `ffb-statetest` or a new tools module) hosts **many concurrent
   matches in one JVM**, multiplexed by match id over JSON lines, avoiding JVM
   start-up per match. Reuse `BogrukEngineFixture` logic (move it out of test
   scope if needed without changing behaviour). An exception in one match
   records a failure for that match only.
2. **Runner.** `node computer-player/training/run.mjs` plays N matches across W
   engine processes, each with several matches in flight. Options: coach
   pairing, roster pool (default all BB2025 rosters the computer flow
   supports), seed range, decision cap, per-match timeout, workers, matches per
   JVM, `-Xmx` per JVM, total heap budget, process priority. Home and away are
   swapped across paired seeds.
3. **Machine budget.** Defaults come from detected hardware (see Target
   machines): total engine heap capped so at least 40% of RAM stays free for
   the OS, the GPU stack and a browser; engine
   processes at below-normal priority on Windows; recycle each engine process
   after a configurable number of matches to contain leaks.
4. **Throughput.** Print and record matches/hour and decisions/second over
   time. Benchmark one-match-per-JVM against multiplexed hosting, and several
   worker counts, and keep the best default. Record results in the outcome.
5. **Determinism.** Same engine build, seeds, rosters and parameters give the
   same decisions and result. Prove it with a test.
6. **Records.** One JSON line per match in rotating gzip files under an ignored
   directory (default `.tools/training/`): schema version, seeds, rosters,
   coach ids and parameter/model hashes, result, score, casualties, turns,
   decision count, duration, failure code (timeout, decision cap, harness
   failure, invalid-action loop). No credentials or account data.
7. **Failures are data.** Caps, timeouts and engine errors are recorded and
   counted, never fatal. The summary lists failure counts by code with
   reproduction commands.

### B. Weight tuning (CPU)

8. **Parameterised Bogruk.** Extract every tunable number in Bogruk's scoring
   into one versioned parameter object with documented ranges.
   `createBogrukPolicy(params)` (or equivalent) uses it; production Bogruk calls
   it with frozen defaults. Recklessness is a parameter; training defaults it
   off.
9. **Trainer.** `node computer-player/training/train.mjs` runs a dependency-free
   evolution strategy (for example (μ, λ)-ES or CMA-ES-lite) over normalised
   parameters. Fitness uses paired seeds (both home and away) against the
   champion, default Bogruk and Gobbo with configurable weights; per match: win
   3, draw 1, loss 0, plus a small touchdown-difference term.
10. **Promotion gate.** A candidate becomes champion only after at least a
    configurable number of paired matches (default 400) against the current
    champion give a win-rate lower confidence bound above 0.5 (Wilson or SPRT;
    document which). Champions are saved as
    `computer-player/training/champions/<n>.json` with parameters, parent,
    generation, evaluation evidence and engine commit.
11. **Checkpoint and resume.** Checkpoint every generation; resume after
    Ctrl+C, crash or reboot. Ctrl+C stops within seconds, cleanly.

### C. Learned policy (GPU)

12. **Environment setup.** `computer-player/ml/setup.ps1` (and a `.sh`
    equivalent) creates an ignored venv (for example `.tools/ml-venv`), installs
    pinned packages from `computer-player/ml/requirements.txt` using official
    PyTorch CUDA wheels that support sm_120 (CUDA 12.8+), and verifies
    `torch.cuda.is_available()`, the device name and a small matmul on the GPU.
    If no CUDA wheel exists for Python 3.14, use a supported Python version
    (via `py -3.x` or `uv`) and document it. Keep the dependency list minimal
    (PyTorch, NumPy; nothing else without a written reason).
13. **Trajectories.** Behind a runner flag, record per decision: schema
    version, encoded state features, the legal candidate list with candidate
    features, the chosen index, the acting coach, Bogruk's own candidate scores
    (for imitation), and episode outcome/rewards. Store compact binary or
    compressed shards with a size cap and an index.
14. **Feature encoding.** Encode from the acting coach's legitimate view only
    (the same information Bogruk may use). Normalise so the acting team always
    attacks the same direction. Board planes on the 26×15 grid (players per
    team, MA/ST/AG/PA/AV, standing/prone/stunned, used/active, tackle zones,
    ball, end zones) plus global features (half, turn, score difference,
    rerolls, weather, kick-off context) plus per-candidate features (action
    type, target squares, path length, board-estimated success probability,
    Bogruk heuristic score). Implement it once (Node side, used when recording
    and when acting) and test that Node and Python agree on shapes and values.
15. **Model.** A small convolutional or residual trunk over board planes with a
    candidate-scoring head (scores each legal candidate; softmax over the
    offered set) and a value head. Size the reference profile for the 16 GB main PC with
    mixed precision, with an automatic smaller profile for 8 GB GPUs. The policy can only choose among server-offered legal
    options.
16. **Behaviour cloning.** `python -m ml.train_bc` trains the network on GPU to
    imitate Bogruk from recorded trajectories (cross-entropy on choices plus
    optional distillation from Bogruk's candidate scores). Report held-out
    agreement with Bogruk and GPU samples/second.
17. **Inference server.** A Python process loads a checkpoint and serves
    batched inference on the GPU to all runner workers over localhost (simple
    length-prefixed JSON or binary over TCP or a named pipe). It batches
    concurrent requests across matches, has a request timeout, and the
    learned coach falls back to Bogruk's choice on timeout or error (counted
    and reported). A CPU fallback mode exists for testing without a GPU.
18. **Self-play RL.** `python -m ml.train_rl` runs actor–learner training:
    runner workers play the learned coach against an opponent pool (recent
    checkpoints, the current champion, default Bogruk, tuned Bogruk, Gobbo);
    the learner updates with PPO (or a documented alternative) on the GPU.
    Terminal reward from the result, with optional shaped rewards (touchdowns,
    forward ball progress, casualties) that anneal towards zero; record the
    schedule. Checkpoint regularly and resume after interruption.
19. **Evaluation and Elo ladder.** Periodically evaluate checkpoints on fixed
    paired seeds against default Bogruk, tuned Bogruk and Gobbo; maintain an
    Elo (or Bradley–Terry) ladder of all agents with confidence intervals in
    `computer-player/training/ladder.json`. Promote a learned checkpoint to
    `computer-player/ml/champions/` only through the same promotion gate as
    requirement 10. Commit champion metadata; keep large weight files in the
    ignored directory and record their hashes (commit weights only if small,
    under ≈20 MB, and say so).
20. **Reports.** `node computer-player/training/report.mjs` writes a Markdown
    summary: throughput over time, CPU and GPU utilisation, generations or
    training steps, ladder table, champion history with evidence, parameter
    changes versus defaults, failure counts and reproduction commands.

## Tiers

Complete tiers in order. Each tier ends green, committed and pushed.

- **Tier 1 — Fast runner.** Engine host, runner, records, determinism test,
  failure handling, throughput benchmark and defaults derived from detected hardware.
- **Tier 2 — Weight tuning.** Parameterised Bogruk with the equivalence test,
  ES trainer, promotion gate, checkpoint/resume, report.
- **Tier 3 — GPU foundations.** ML environment setup and CUDA check,
  trajectory recording, feature encoder with Node/Python agreement tests,
  model, behaviour cloning on GPU, inference server, learned coach playing
  full matches through the runner with a fallback counter.
- **Tier 4 — Self-play RL.** Opponent pool, PPO learner, Elo ladder, gated
  promotion, resumable long runs.
- **Tier 5 — Improve until stopped.** Run experiments and keep a log (below).

## Acceptance Criteria

- Default-parameter learner and production Bogruk produce identical decision
  sequences on at least 20 seeded matches.
- The same seed set run twice yields identical records (excluding timings).
- A 200-match smoke run with mixed rosters completes; failures are recorded
  with reproduction commands rather than stopping the run.
- A short ES run (3 generations, small population) completes, is interrupted,
  resumes and finishes; the promotion gate is unit-tested with synthetic
  results in both directions.
- The CUDA check passes on the machine used for implementation and reports
  its GPU, VRAM and the selected profile; the hardware-detection defaults are
  unit-tested for both an 8 GB and a 16 GB GPU profile.
- Behaviour cloning reaches a reported held-out agreement with Bogruk, and the
  cloned policy completes at least 50 full matches through the runner with a
  fallback rate below 1%.
- A PPO run of at least one hour completes, resumes after interruption, and
  produces ladder entries with confidence intervals.
- The outcome report contains throughput baselines, the ladder, and an honest
  statement of whether any learned or tuned agent beats default Bogruk.
- `npm test` in `computer-player/`, the affected Maven modules and
  `mvn clean install` pass without Python or a GPU. Production Bogruk behaviour
  is unchanged.

## Overnight iteration protocol

This work runs unattended. Do not stop at the acceptance criteria.

1. Open a **draft PR** as soon as Tier 1 is green, and push after every tier
   and every iteration that passes checks. Keep the PR description updated with
   a tier checklist, latest throughput, ladder and remaining ideas.
2. In Tier 5, run an **experiment loop**: form a hypothesis (for example
   larger trunk, different reward shaping, more Bogruk imitation before RL,
   more matches per JVM, curriculum on rosters), run it with a fixed budget,
   compare on the ladder with confidence intervals, keep or revert, and record
   it in `docs/specs/computer-coach-training-experiments.md` (hypothesis,
   command, budget, result, decision). Prefer changes that raise matches per
   hour; simulation speed multiplies every later experiment.
3. Profile before optimising: measure where time goes (engine apply, JSON
   serialisation, policy planning, inference round trips) and attack the
   largest share first. Record before/after numbers.
4. Never leave a commit that breaks earlier tiers or the standard builds.
5. If a decision belongs to the owner (for example committing model weights,
   or naming a future coach), record the question and options in the outcome
   report, choose the conservative option and continue.
6. If blocked (for example no CUDA wheel installs), record the blocker with the
   exact error, finish everything that does not depend on it (including the CPU
   fallback path), and continue with the other tiers.
7. **Leave the main PC working.** Provide one script,
   `computer-player/training/overnight.ps1`, that sets up (or verifies) the
   environment, prints detected hardware, and starts the furthest green tier's
   long run (PPO if Tier 4 is green, otherwise behaviour cloning plus
   evaluation, otherwise ES) with a wall-clock budget, logging to
   `.tools/training/`. When implementation stops: if you are running on the
   main PC (a CUDA GPU with at least 16 GB VRAM is detected), start it detached
   with a budget ending at 07:00 local time and record the command, process
   ids, how to check progress and how to stop it. On any other machine, do not
   start a long run; instead record the exact command the owner runs on the
   main PC, and run only a 10-minute rehearsal locally to prove it works.
8. Before your session ends, push and write
   `docs/specs/computer-coach-training-harness-outcome.md`: tiers done,
   requirement-by-requirement status, benchmarks, experiments, validation
   evidence, the running job, open questions and the next three improvements.

## Execution environment

This issue needs no web servers and must not touch dev-local. It is the heaviest CPU, RAM and GPU user. While other sessions' `mvn`, `java` or `node` processes from other worktrees are running, cap simulation at half the logical cores and mark any throughput numbers taken then as contended. Take the final throughput baseline when no other heavy session work is running, if that happens before your session ends. `overnight.ps1` applies the same check when it starts. Only this issue uses the GPU.

## Execution environment (shared)

Three Codex sessions (#565, #566, #567) run at the same time on the owner's
main PC.

- **Use your own new git worktree**, for example
  `git worktree add ../fumbbl-rebuild-wt/<issue> -b <branch> origin/main`.
  Never work in the main checkout or in another session's worktree. Install
  `browser-client` dependencies inside your worktree.
- **dev-local is a single shared stack** (fixed ports 5000, 22232 and 22234,
  one shared state file). Only #565 may start or use it. Others must not start,
  stop or restart it.
- **Ports.** Pick free ports for Vite and any test servers. If a test driver
  hard-codes a port, add an environment-variable override instead of racing for
  it.
- **Maven.** Build from the root reactor (`mvn clean install`, or
  `mvn -pl <module> -am …`) so modules resolve from your worktree, not from
  another branch's snapshot in the shared `~/.m2`.
- **Load.** Builds and UI drivers from three sessions compete for CPU and RAM.
  If a timing-sensitive test fails, rerun it once before debugging, and note
  contention in the outcome report.
- **Shared files.** Only #565 edits `CHANGELOG.md`. Do not edit files that
  belong to another issue's scope.

## Constraints

- Windows is the primary host; keep scripts portable to Linux.
- Node 26 per `computer-player/package.json`; Java 21. No new npm or Maven
  dependencies. Python dependencies only in `computer-player/ml/`, pinned and
  opt-in.
- Java style per `AGENTS.md`: service classes with instance methods, ordered
  imports, no `f`/`p` prefixes, JUnit 5 tests ending in `Test`.
- Training code never ships in the server runtime, the daemon or the browser
  bundle.
- Output, venvs and large weights stay under ignored directories; commit code,
  docs, champion metadata and small parameter files only.
- BB2025 only; the server engine stays authoritative for legality and dice.
- Do not change power, sleep, driver or other system settings.
- Preserve unrelated working-tree changes. Follow repository conventions.
- No `CHANGELOG.md` entry; this is developer tooling.

## Implementation Guidance

- Start by measuring the existing `engine-match.mjs` path, then build the
  multiplexed host; the numbers decide the default.
- The GPU is not the bottleneck for this game: simulation is CPU-bound. Use the
  GPU for training and for batching inference across many concurrent matches;
  size the actor count so the CPU stays busy and the GPU queue stays non-empty.
- Keep the candidate-scoring formulation: the network ranks the legal options
  the server and `bogruk-board.mjs` already produce, which avoids a huge raw
  action space and guarantees legality.
- Version the trajectory and feature schemas from day one; old shards must be
  rejected clearly, never misread.
- If #561/#562 reproduce often enough to distort fitness, report the rate and
  exclude affected matches from fitness rather than patching policy code here.

## Validation

- Unit tests: parameter-default equivalence, ES update maths, promotion gate,
  record rotation, resume, feature encoder shapes and Node/Python agreement,
  inference fallback.
- Integration: smoke, determinism, short ES, behaviour cloning, 50-match
  learned-coach run, one-hour PPO run.
- Standard builds without Python or GPU present.

## Delivery authority

Create branch `codex/567-coach-training-harness` from current `main`. Commit,
push and keep a draft PR referencing #567 updated throughout. Do not merge,
mark the PR ready, or deploy; the owner reviews in the morning. Installing the
pinned Python packages into the ignored venv on this machine is authorised.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
