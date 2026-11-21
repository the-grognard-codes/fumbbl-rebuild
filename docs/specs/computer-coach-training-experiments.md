# Bounded #567 experiment log

2026-11-16. The owner's latest request prohibits a long execution. No overnight
job was started. All measurements were contended.

| Hypothesis | Command / budget | Result | Decision |
|---|---|---|---|
| Sharing startup improves small-batch throughput | `node computer-player/training/benchmark.mjs --budget-seconds 60 --heap-mib 512`; two games × 60 decisions/configuration | 14.18 decisions/s fresh JVM; 20.37 multiplexed; 26.24 two workers | Keep concurrency configurable, one in-flight match default for RAM safety. |
| A small heap supports full games | Two Gobbo games, two 384 MiB JVMs, 180 s ceiling | One complete; one JVM OOM at 669 decisions | Reject 384 MiB as a general default. Record failures. |
| Tiny CUDA imitation initialises the pipeline | `ml.train_bc`, width 32, batch 8, 20 steps, 30 s ceiling | 70.21% held-out agreement, 60.07 samples/s | Smoke checkpoint only, no strength claim. |
| BC resume restores training state | `ml.train_bc --resume .../bc.pt --steps 21`, 10 s ceiling | Step 21 completed, 71.28% held-out agreement | Resume verified. |
| Learned actions can finish games and feed PPO | `ml.train_rl --iterations 1 --games 2 --workers 1 --matches-per-jvm 1 --budget-seconds 180 --evaluate off --promote off` | Two full 0–0 games, 0/323 fallbacks, 22 PPO batches; about 61 s simulation | Pipeline proven, no promotion. |
| Fixed seeds survive new host processes | Two paired runs, 60 decisions/game, 45 s ceiling/run | Identical decision hashes, scores, turns and cap codes | Keep match-local dice and deterministic per-purpose RNG. |

See the [outcome](computer-coach-training-harness-outcome.md) for hardware,
evidence paths, validation and remaining acceptance runs. No weights are committed.
