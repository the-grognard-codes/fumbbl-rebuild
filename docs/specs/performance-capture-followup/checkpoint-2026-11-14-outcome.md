# Residual checkpoint measurements, 2026-11-14 (#489)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489

**Result:** long-history compaction remains measurably more expensive than
append, but this run did not reproduce a checkpoint above one second. The
original intermittent live spike remains unresolved. No production correction
is justified by this run, so none is included.

Source: `65ed24fdb7f242645d5c4673a3aebce7b4b92110`. The retained numeric evidence
is [checkpoint-2026-11-14-results.json](checkpoint-2026-11-14-results.json),
including source, harness, runner and analyzer hashes, runtime settings,
per-cohort first/warm median/p95/max and each slowest phase vector. No service
was started or served, so there is no served-artifact identity. Raw fixtures,
payloads and process logs remain private in the ignored overnight directory.

## Workload and limits

Three independently launched Temurin 21.0.11+10 JVMs, 768 MiB measured heap;
separate 2 GiB fixture preparation/verification. Four fixed retained legal setup
histories (0/128/512/1024 added decisions), identical current two-player pitch
within a 22-player roster, native one-square movement and successful pass/catch,
ordinary journal append and forced real resident compaction boundary. Detailed
existing request timing is enabled through CaptureRequestProbe. Native steps,
checkpoint and repository commit occur before the measured reply.

Each cohort has one first action plus eight warm actions per JVM: 48 cohort-first
and 384 warm actions in total. Warm means action-path/JIT warm; each action
independently restores the retained fixture before measurement. The first
measured action from each fresh JVM is identified separately; cohort-first is
not a new cold process for every row. Histories rotate/reverse across JVMs.
All 16 history/action/storage combinations passed exact native recovery in a
separate verification process. Generations and native outcomes are asserted for
every sample. Existing compaction conflict, persistence failure and duplicate
retry tests pass in full validation; genuine-chain coverage is PR #539.

Repositories are in memory. JDBC, database compression/store implementation,
providers, transport and browser costs are excluded; checkpointStoreMs describes
only that seam. Other local validation ran concurrently, so absolute timings are
descriptive and not an isolated-machine or physical-device benchmark. Nested
phase durations overlap and must not be summed. Cohort-first n=3 and warm n=24
are reported explicitly; their p95 values do not establish long-term tails.

## Observations

Median complete handling time (ms):

| Added decisions | Artifact MiB | Move append | Pass append | Move compaction | Pass compaction |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.49 | 13.4 | 14.6 | 21.3 | 20.2 |
| 128 | 3.51 | 17.0 | 16.8 | 46.7 | 44.8 |
| 512 | 12.57 | 18.5 | 23.9 | 132.0 | 132.7 |
| 1024 | 24.65 | 25.1 | 37.6 | 272.0 | 273.9 |

At 1024 decisions, warm checkpoint median/p95/max is 262.93/416.90/496.36 ms
for movement compaction and 237.07/323.59/456.75 ms for passing. Their recovery
serialization medians are 244.33 and 219.51 ms; cursor medians are 1.75 and
0.90 ms. The largest cohort-first checkpoint is 512.64 ms. Ordinary append
checkpoint medians at that history are 11.98 ms movement and 4.60 ms passing.

The history-growth discriminator (>2x and >50 ms over fresh handling) fires for
both compaction cohorts, at 12.75x and 13.53x. The one-second checkpoint
discriminator does not fire. The earlier cursor correction is still effective;
serialization is now the dominant measured compaction phase. This identifies
history sensitivity, not the cause/frequency of the live end-match outlier.
The in-memory store cannot attribute the soak's 29.8 ms CHECKPOINT_STORE mean.

## Reproduce

Configure the pinned toolchain using tools/bootstrap.ps1 and a supported JDK 21.
Use a fresh output directory. In the overnight workspace all output belongs in
the main checkout's ignored .tools/overnight-codex directory.

```powershell
$env:HISTORY_SCALING_DIR = '<absolute ignored scratch>/checkpoint-run'
$env:HISTORY_SCALING_LEVELS = '0,128,512,1024'
$env:HISTORY_SCALING_SAMPLES = '8'
node tools/diagnostics/run-history-scaling.mjs
node tools/diagnostics/analyze-history-scaling.mjs $env:HISTORY_SCALING_DIR --assert-flat
node tools/diagnostics/analyze-checkpoint-first-warm.mjs $env:HISTORY_SCALING_DIR --checkpoint-ceiling-ms=1000
```

The growth command exits 1 on the reproduced compaction growth. The checkpoint
command exits 1 when its threshold is exceeded; this run exits 0 and explicitly
reports “not reproduced.” The new analyzer retains first samples and slow phase
vectors instead of discarding warm-up evidence. An independent Python check
verified every count, median, nearest-rank p95 and maximum against raw samples.

No production Java or browser source changed. Full Maven clean install results
are recorded in the PR. Pending: correlate the actual slow action with a bounded
JFR/GC capture and real storage timing, plus the user's live/history-matched soak
and downstream #526 inter-arrival/backlog comparison. Do not offload live mutable
engine state or change durability based on these measurements.
