# Single-worker operating-envelope results

Tracking: [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39), integrated with [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508).

This local workload completed its declared scenarios. Performance targets are evaluated below; successful harness execution is not a capacity or latency certification. Production admission remains unchanged.

## Revisions and configuration

| Run | Runtime revision | Harness | Start / finish UTC |
|---|---|---|---|
| baseline | `d3dabde26026654930768bf18799777d84b5d589` | `8eddbff3f37b0b13d1abdd4f552075fa8cc732af` | 2026-11-11T04:00:31.979Z / 2026-11-11T04:04:00.938Z |
| integrated | `8eddbff3f37b0b13d1abdd4f552075fa8cc732af` | `8eddbff3f37b0b13d1abdd4f552075fa8cc732af` | 2026-11-11T04:04:01.910Z / 2026-11-11T04:06:27.561Z |

Machine: AMD Ryzen 7 260 w/ Radeon 780M Graphics, 16 logical processors, 15.31 GiB RAM, Windows kernel 10.0.26300. Node v26.8.1; Temurin 21.0.11+10-LTS; Maven 3.9.9; Connector/J 3.5.8. Docker Desktop 29.7.2 exposes 16 CPUs and 7.41 GiB to its VM. MariaDB 11.8.9-MariaDB-ubu2404; 128 MiB buffer pool, max_connections 151, innodb_flush_log_at_trx_commit=1, sync_binlog=0, slow-query log off. Container memory/CPU caps are zero (Docker VM limits still apply).

The measured native engine and Jetty transport run in an isolated host JUnit JVM using production classes, not in the dev-local server container. Dev-local startup is checked separately; its MariaDB container supplies the isolated synthetic schema. The harness supplies no heap/GC overrides (pinned JVM default ergonomics). These resource results are not a server-container sizing claim.

Unpooled bounded JDBC uses connectTimeout=500 ms, socketTimeout=1500 ms and innodb_lock_wait_timeout=1 second through a loopback fault proxy. Local native debug logging level is 1. Diagnostics replies are disabled; full-task timing remains available. The shared dev-local MariaDB and VS Code language server remain present. No other task builds or browser suites ran while the scenario generated traffic; runner compilation/setup is included in manifest wall time.

Baseline is merged RB2 and slices 1-3 before #508, including actual **#507 option A** implementation. PR #518 merge `53655f62f` and final notice-budget correction `eb1d1dbe3` are ancestors of baseline `d3dabde260` and the integrated revision. See the [#507 outcome](engine-worker-publication-authorization-outcome.md) for the passive-viewing policy. Baseline imports only the reviewed test harness and synthetic fixture; source hashes match the integrated capture. No earlier isolated harness was imported. Both revisions postdate slice 2 deliverable A, so control timing is available; any pre-A baseline must mark it unavailable.

The measured integrated revision is preserved. Earlier 500 ms captures at df5944955 mixed admitted reads with RATE_LIMITED outcomes and are superseded for equal-work comparisons. Their [original raw evidence](../reviews/operating-envelope-2026-11-10/) is retained. This corrected harness uses a 2,000 ms pause and asserts ACCEPTED for every healthy lobby read in both runs. Later commits add reports/evidence/tracking only. The #508 runtime fixes and #39 cadence correction remain separate commits.

## Workload

One native fixture is advanced to a regular turn before measurement. Thirty-two synthetic active matches are restored through actual WebSocket loads using two coaches; these restoration/warmup tasks remain in the raw samples. The healthy phase has three repetitions of eight durable end-turn actions, at least 2,000 ms between iterations plus response time, with a current-match read and detailed browse each iteration. Each repetition uses a different resident match. Both runs use the same synthetic seed. Its last-player-activity timestamp is refreshed once before both runs to avoid the production 24-hour abandonment policy; all other payload state is preserved. The original/refreshed hashes and timestamp change are recorded in environment.json, and the exact refreshed input is archived as synthetic-seed.json.gz. Both capture digests match that input.

Healthy socket mix is **2 coaches + 1 spectator + 13 idle real TCP sockets = 16**. Only one match is actively played at a time. This validates 32 resident sessions with that admitted subset, not 32 connected matches or maximum throughput. Sixteen sockets permit at most eight two-coach or sixteen one-coach matches before spectators/preparation/service sockets consume slots. A seventeenth actual socket is rejected with 1013.

Additional phases cover confirmed durable-action retry after reconnect, independent application rehydration from JDBC, a controlled stalled asynchronous write alongside 15 real sockets, 20-request provider and database outage bursts spaced by 100 ms, cooldown/recovery, concession of all 32 sessions, and 160 serialized writes after a declared 250 ms test control pause. The saturation pause is included in all-task timing and separated from healthy results.

## Full worker timing

All values below are milliseconds, nearest-rank p50 / p95 / p99 / maximum. Counts include tiny, rejected and untracked tasks. Queue wait is separate from full execution through scope exit. Kind 0 is ingress, 1 other control, 2 decision expiry, 3 disconnect.

| Run / task group | N | Execution p50 / p95 / p99 / max | Queue p50 / p95 / p99 / max | >250 ms / >2,000 ms execution |
|---|---:|---|---|---:|
| baseline: all phases / all tasks | 524 | 0.075 / 599.575 / 1231.424 / 1743.114 | 0.411 / 270.340 / 672.164 / 1491.675 | 108 / 0 |
| baseline: kind 0 | 355 | 35.700 / 665.534 / 1329.418 / 1743.114 | 0.598 / 264.419 / 265.028 / 265.038 | 107 / 0 |
| baseline: kind 1 | 19 | 0.026 / 262.587 / 262.587 / 262.587 | 0.069 / 258.474 / 258.474 / 258.474 | 1 / 0 |
| baseline: kind 2 | 132 | 0.054 / 0.504 / 2.845 / 4.101 | 2.565 / 650.635 / 1357.861 / 1491.675 | 0 / 0 |
| baseline: kind 3 | 18 | 0.028 / 0.506 / 0.506 / 0.506 | 0.064 / 260.903 / 260.903 / 260.903 | 0 / 0 |
| baseline: healthy all tasks | 165 | 0.651 / 951.109 / 1421.743 / 1743.114 | 0.189 / 574.403 / 1357.861 / 1491.675 | 61 / 0 |
| integrated: all phases / all tasks | 480 | 0.116 / 321.054 / 904.302 / 1321.463 | 0.111 / 255.841 / 576.063 / 879.646 | 32 / 0 |
| integrated: kind 0 | 339 | 31.538 / 455.007 / 968.885 / 1321.463 | 0.114 / 255.673 / 256.305 / 389.379 | 31 / 0 |
| integrated: kind 1 | 19 | 0.030 / 256.783 / 256.783 / 256.783 | 0.057 / 248.212 / 248.212 / 248.212 | 1 / 0 |
| integrated: kind 2 | 104 | 0.060 / 0.207 / 0.430 / 0.494 | 0.165 / 565.150 / 783.479 / 879.646 | 0 / 0 |
| integrated: kind 3 | 18 | 0.009 / 0.054 / 0.054 / 0.054 | 0.034 / 250.583 / 250.583 / 250.583 | 0 / 0 |
| integrated: healthy all tasks | 144 | 61.304 / 279.824 / 830.027 / 1106.378 | 0.116 / 128.910 / 782.278 / 879.646 | 8 / 0 |

Both captures have complete numeric ring coverage: captured sample count equals cumulative task count and no sequence gaps were found. Raw artifacts preserve warmup, per-repetition and fault-phase timings; ingress p99 is never substituted for all-task p99.

## End-to-end outcomes

Each phase includes all correlated request outcomes. Rejected and closed requests remain in distributions. The saturation burst can close its submitting socket before queued requests receive replies; those submissions are counted, not dropped from latency accounting.

| Run / phase | N | p50 / p95 / p99 / max (ms) | Outcomes |
|---|---:|---|---|
| baseline: warmup | 35 | 427.168 / 761.447 / 890.073 / 890.073 | ACCEPTED: 35 |
| baseline: healthy-0 | 27 | 598.967 / 1459.280 / 1836.159 / 1836.159 | ACCEPTED: 27 |
| baseline: healthy-1 | 27 | 350.846 / 981.124 / 1493.598 / 1493.598 | ACCEPTED: 27 |
| baseline: healthy-2 | 27 | 323.348 / 617.877 / 818.259 / 818.259 | ACCEPTED: 27 |
| baseline: reconnect | 4 | 45.783 / 448.298 / 448.298 / 448.298 | ACCEPTED: 4 |
| baseline: slow-recipient | 1 | 179.751 / 179.751 / 179.751 / 179.751 | ACCEPTED: 1 |
| baseline: provider-outage | 21 | 1.548 / 266.872 / 268.627 / 268.627 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| baseline: database-outage | 21 | 3.311 / 25.270 / 113.552 / 113.552 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| baseline: completed-release | 64 | 126.379 / 439.821 / 600.700 / 600.700 | ACCEPTED: 64 |
| baseline: ingress-saturation | 160 | 3.207 / 6.279 / 7.251 / 8.129 | CLOSED_OR_SEND_FAILED: 160 |
| integrated: warmup | 35 | 340.997 / 1288.487 / 1401.386 / 1401.386 | ACCEPTED: 35 |
| integrated: healthy-0 | 27 | 136.552 / 869.676 / 922.486 / 922.486 | ACCEPTED: 27 |
| integrated: healthy-1 | 27 | 121.480 / 177.475 / 180.092 / 180.092 | ACCEPTED: 27 |
| integrated: healthy-2 | 27 | 97.263 / 131.980 / 133.306 / 133.306 | ACCEPTED: 27 |
| integrated: reconnect | 4 | 32.139 / 128.335 / 128.335 / 128.335 | ACCEPTED: 4 |
| integrated: slow-recipient | 1 | 40.564 / 40.564 / 40.564 / 40.564 | ACCEPTED: 1 |
| integrated: provider-outage | 21 | 1.015 / 265.902 / 266.369 / 266.369 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| integrated: database-outage | 21 | 1.568 / 5.433 / 35.560 / 35.560 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| integrated: completed-release | 64 | 101.134 / 173.598 / 245.740 / 245.740 | ACCEPTED: 64 |
| integrated: ingress-saturation | 160 | 2.544 / 6.142 / 6.798 / 7.397 | CLOSED_OR_SEND_FAILED: 160 |

Healthy accepted action distributions are retained separately. Every healthy read was accepted in both corrected runs; the admitted-read comparison below separates their latency from actions and fault/saturation outcomes.

## Lifecycle, faults and cleanup

| Evidence | Baseline | Integrated |
|---|---|---|
| admittedSockets | 16 | 16 |
| seventeenthCloseCode | 1013 | 1013 |
| reconnectDuplicate | True | True |
| reconnectRevisionUnchanged | True | True |
| durablePublicStateMatches | True | True |
| committedRevision | 6 | 6 |
| durableRecoveryRevision | 6 | 6 |
| providerOutageAttempts | 3 | 3 |
| providerRecoveryAttempts | 1 | 1 |
| databaseOutageAttempts | 3 | 3 |
| databaseRecoveryConnections | 4 | 4 |
| burstSubmitted | 160 | 160 |
| burstReplies | 0 | 0 |
| burstUnansweredOrClosed | 160 | 160 |

baseline: resident sessions 32 → 0; completed releases 32. Slow write watchdog close 2075.800 ms; cleanup barrier 2090.815 ms; remaining sockets 15. Final active sockets 0, ingress depth 0, delivery depth/bytes 0/0; ingress overloads 1. Owned synthetic schema cleanup succeeded.

integrated: resident sessions 32 → 0; completed releases 32. Slow write watchdog close 2068.110 ms; cleanup barrier 2083.324 ms; remaining sockets 15. Final active sockets 0, ingress depth 0, delivery depth/bytes 0/0; ingress overloads 1. Owned synthetic schema cleanup succeeded.

Provider faults use the production verifier/cache/breaker with a 250 ms unavailable SDK double. Three actual dependency attempts open the breaker; remaining burst requests fail fast. One provider lookup succeeds after cooldown. Database faults reset only new proxy connections: three connection attempts open the database breaker. The recovery request uses one first successful probe followed by its normal fresh connections; total recovery connections are reported above and are not mislabeled as four recovery probes. Availability failures surface as AUTHENTICATION_REQUIRED at the incoming authorization boundary; gameplay is not claimed available while storage is down. Expiry and disconnect execution remains visible in the outage phase sample ranges.

Slow delivery uses one controlled Jetty callback, not a throttled operating-system TCP receiver. The asynchronous watchdog closes after its two-second threshold plus scheduler cadence; worker cleanup/permit release is measured separately. A real client load completes during the stall. Rehydration compares revision, phase, actor, players, ball, score and turn mode, but is a new application instance on the same owner thread, not a process-kill test. That additional fixture instance is discarded at harness process exit; the primary production application reports zero residents after completion.

## Resource use

| Run | Peak heap MiB | Peak JVM RSS MiB | JVM CPU seconds over sampled interval | External samples |
|---|---:|---:|---:|---:|
| baseline | 238.8 | 466.5 | 174.078 | 73 |
| integrated | 208.8 | 445.9 | 132.109 | 55 |

MariaDB CPU, memory, block/network I/O and process counts are recorded in every external sample. Heap/JVM CPU are sampled at 100 ms; RSS/container stats nominally every 2 seconds, with Docker command latency. The fixture generator and temporary rehydration instance add test-process overhead; these are not per-match production memory estimates.

## Targets and remaining limits

- baseline: healthy all-task p99 1421.743 ms **fails** the 100 ms target; 61 healthy task(s) exceed 250 ms. Across all phases, 0 task(s) exceed the 2,000 ms occupancy ceiling.
- integrated: healthy all-task p99 830.027 ms **fails** the 100 ms target; 8 healthy task(s) exceed 250 ms. Across all phases, 0 task(s) exceed the 2,000 ms occupancy ceiling.

The 128 tracked-ingress limit and 112 advisory allowance do not bound the trusted control queue. Expiry/publication checks coalesce and disconnect demand is limited by admitted sockets, but other trusted control producers can still add worker backlog. This capture does not establish a global control-queue hard bound.

No target is relaxed. Repeated healthy overruns require follow-up investigation of full native application/checkpoint/publication work. The numeric full-task trace and request phase distributions locate the affected workload; this capture is not an allocation/CPU profiler and does not establish a single causal bottleneck. The separate #508 page/lane capture supplies SQL/query/parse/serialization evidence for lobby work.

Limitations: short three-repetition local scenario; one actively played match at a time; regular end-turn actions and administrative concession rather than long varied games; bounded Firebase SDK double; database reset faults rather than an exhaustive blackhole/lock matrix; controlled delivery callback; no process crash/restart; shared desktop/VM and local logging risk. No production capacity, maximum admitted gameplay throughput, long-session history or hardware-general claim follows from these results.

Reproduce using [the runbook](../operations/operating-envelope-runbook.md). Raw numeric evidence, configuration, fixture/source hashes and summaries are under [the capture directory](../reviews/operating-envelope-2026-11-11-review/). The requests remain available for independent review; unmet performance targets are tracked separately rather than marked as passing.

## Additional accounting detail

| Run | Sampled runtime seconds | Healthy window seconds | Achieved healthy action rate / second |
|---|---:|---:|---:|
| baseline | 137.410 | 86.644 | 0.277 |
| integrated | 105.496 | 60.564 | 0.396 |

Runner manifest timestamps include compilation/setup. These measured windows isolate load generation. The generator is closed-loop, capped by its 2,000 ms pause plus completion time; it does not impose an open-loop half-action-per-second arrival rate.

| Run / accepted operation | N | End-to-end p50 / p95 / p99 / max (ms) |
|---|---:|---|
| baseline: healthy actions | 24 | 132.541 / 548.294 / 729.087 / 729.087 |
| baseline: whole reconnect | 1 | 197.128 / 197.128 / 197.128 / 197.128 |
| integrated: healthy actions | 24 | 121.592 / 384.066 / 922.486 / 922.486 |
| integrated: whole reconnect | 1 | 113.147 / 113.147 / 113.147 / 113.147 |

Whole reconnect starts immediately before abrupt disconnect and includes worker cleanup, new TCP/WebSocket connection, authentication and duplicate-action confirmation. There is one scheduled reconnect per run: its p50/p95/p99/max are the same single observation, not a statistically stable tail estimate.

| Run / outage | Ingress tasks | Other control | Decision-expiry sweeps | Disconnect tasks |
|---|---:|---:|---:|---:|
| baseline: provider-outage | 21 | 1 | 14 | 1 |
| baseline: database-outage | 21 | 1 | 7 | 1 |
| integrated: provider-outage | 21 | 1 | 13 | 1 |
| integrated: database-outage | 21 | 1 | 7 | 1 |

These are real scheduled expiry sweeps over resident sessions and actual disconnect cleanup during the outage windows. The fixture does not arrange a pending native reactive decision to expire during the fault. Saturation reaches the baseline foreground/global allowance of 128 versus the integrated advisory allowance of 112 (16 slots remain reserved for foreground admission); all discarded queued work and subsequent cleanup remain in full-task samples.

| Run | Peak sampled MariaDB CPU % | Peak sampled MariaDB memory MiB | Ingress high water |
|---|---:|---:|---:|
| baseline | 63.65 | 163.00 | 128 |
| integrated | 20.91 | 164.20 | 112 |

Container CPU follows Docker stats semantics (100% is one core), and sampled peaks can miss short spikes. The environment/configuration artifact records VM and database limits.

## Admitted healthy read comparison

| Run / read type | N | End-to-end p50 / p95 / p99 / max (ms) | Non-accepted healthy reads |
|---|---:|---|---:|
| baseline: currentMatches | 24 | 561.447 / 1493.598 / 1836.159 / 1836.159 | 0 |
| baseline: browse | 24 | 569.506 / 1330.940 / 1422.991 / 1422.991 | 0 |
| integrated: currentMatches | 24 | 128.825 / 535.130 / 774.787 / 774.787 | 0 |
| integrated: browse | 24 | 85.878 / 291.445 / 869.676 / 869.676 | 0 |

Every healthy read is admitted in both runs: 24 currentMatches and 24 detailed browse requests. Read p99 is shown independently of rejected/closed work; all-task figures still include every task and control sweep. The historical 407.440 -> 207.406 ms result used a faster read cadence and cannot establish an equal-admitted-work improvement. The corrected figures above replace that comparison. The known dependency validation failure and final validation results are recorded in the PR review correction report.
