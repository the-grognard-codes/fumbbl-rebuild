# Single-worker operating-envelope results

Tracking: [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39), integrated with [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508).

This local workload completed its declared scenarios. Performance targets are evaluated below; successful harness execution is not a capacity or latency certification. Production admission remains unchanged.

## Revisions and configuration

| Run | Runtime revision | Harness | Start / finish UTC |
|---|---|---|---|
| baseline | `d3dabde26026654930768bf18799777d84b5d589` | `df59449552756399e5c4ed766ba81557a118e987` | 2026-11-11T00:02:39.232Z / 2026-11-11T00:04:22.197Z |
| integrated | `df59449552756399e5c4ed766ba81557a118e987` | `df59449552756399e5c4ed766ba81557a118e987` | 2026-11-11T00:04:22.835Z / 2026-11-11T00:05:39.354Z |

Machine: AMD Ryzen 7 260 w/ Radeon 780M Graphics, 16 logical processors, 15.31 GiB RAM, Windows kernel 10.0.26300. Node v26.8.1; Temurin 21.0.11+10-LTS; Maven 3.9.9; Connector/J 3.5.8. Docker Desktop 29.7.2 exposes 16 CPUs and 7.41 GiB to its VM. MariaDB 11.8.9-MariaDB-ubu2404; 128 MiB buffer pool, max_connections 151, innodb_flush_log_at_trx_commit=1, sync_binlog=0, slow-query log off. Container memory/CPU caps are zero (Docker VM limits still apply).

The measured native engine and Jetty transport run in an isolated host JUnit JVM using production classes, not in the dev-local server container. Dev-local startup is checked separately; its MariaDB container supplies the isolated synthetic schema. The harness supplies no heap/GC overrides (pinned JVM default ergonomics). These resource results are not a server-container sizing claim.

Unpooled bounded JDBC uses connectTimeout=500 ms, socketTimeout=1500 ms and innodb_lock_wait_timeout=1 second through a loopback fault proxy. Local native debug logging level is 1. Diagnostics replies are disabled; full-task timing remains available. The shared dev-local MariaDB and VS Code language server remain present. No task builds or browser suites ran concurrently with these final captures.

Baseline is merged RB2 and slices 1–3 before #508. It imports only the reviewed test harness and synthetic fixture; source hashes match the integrated capture. No earlier isolated harness was imported. Both revisions postdate slice 2 deliverable A, so control timing is available. Any pre-A baseline must instead mark it unavailable.

The measured integrated revision is preserved. Preliminary exact-revision captures at e8c3cda1f are retained under `preliminary-e8c3cda`; they lacked a whole-reconnect elapsed sample and are superseded by the corrected final capture. The intervening change adds that measurement/accounting only. Later commits only add reports, evidence and tracking updates; they do not change measured runtime or harness source. The earlier #508 narrow capture and subsequent journal SQL row-limit correction are separately accounted for in its outcome report.

## Workload

One native fixture is advanced to a regular turn before measurement. Thirty-two synthetic active matches are restored through actual WebSocket loads using two coaches; these restoration/warmup tasks remain in the raw samples. The healthy phase has three repetitions of eight durable end-turn actions, at least 500 ms between iterations plus response time, with a current-match read and detailed browse each iteration. Each repetition uses a different resident match. Both runs use the same synthetic seed. Its last-player-activity timestamp is refreshed once before both runs to avoid the production 24-hour abandonment policy; all other payload state is preserved. The original/refreshed hashes and timestamp change are recorded in environment.json, and the exact refreshed input is archived as synthetic-seed.json.gz. Both capture digests match that input.

Healthy socket mix is **2 coaches + 1 spectator + 13 idle real TCP sockets = 16**. Only one match is actively played at a time. This validates 32 resident sessions with that admitted subset, not 32 connected matches or maximum throughput. Sixteen sockets permit at most eight two-coach or sixteen one-coach matches before spectators/preparation/service sockets consume slots. A seventeenth actual socket is rejected with 1013.

Additional phases cover confirmed durable-action retry after reconnect, independent application rehydration from JDBC, a controlled stalled asynchronous write alongside 15 real sockets, 20-request provider and database outage bursts spaced by 100 ms, cooldown/recovery, concession of all 32 sessions, and 160 serialized writes after a declared 250 ms test control pause. The saturation pause is included in all-task timing and separated from healthy results.

## Full worker timing

All values below are milliseconds, nearest-rank p50 / p95 / p99 / maximum. Counts include tiny, rejected and untracked tasks. Queue wait is separate from full execution through scope exit. Kind 0 is ingress, 1 other control, 2 decision expiry, 3 disconnect.

| Run / task group | N | Execution p50 / p95 / p99 / max | Queue p50 / p95 / p99 / max | >250 ms / >2,000 ms execution |
|---|---:|---|---|---:|
| baseline: all phases / all tasks | 463 | 0.106 / 378.392 / 399.605 / 420.529 | 0.101 / 252.854 / 360.751 / 441.128 | 58 / 0 |
| baseline: kind 0 | 355 | 39.837 / 382.036 / 405.122 / 420.529 | 0.094 / 252.670 / 253.372 / 254.281 | 57 / 0 |
| baseline: kind 1 | 19 | 0.031 / 254.582 / 254.582 / 254.582 | 0.064 / 243.033 / 243.033 / 243.033 | 1 / 0 |
| baseline: kind 2 | 71 | 0.052 / 0.099 / 0.384 / 0.384 | 5.069 / 374.814 / 441.128 / 441.128 | 0 / 0 |
| baseline: kind 3 | 18 | 0.007 / 0.053 / 0.053 / 0.053 | 0.025 / 246.786 / 246.786 / 246.786 | 0 / 0 |
| baseline: healthy all tasks | 118 | 171.837 / 398.240 / 407.440 / 420.529 | 0.106 / 353.036 / 406.730 / 441.128 | 48 / 0 |
| integrated: all phases / all tasks | 431 | 0.486 / 188.625 / 288.766 / 322.806 | 0.102 / 250.964 / 251.683 / 252.606 | 9 / 0 |
| integrated: kind 0 | 339 | 11.971 / 195.068 / 289.189 / 322.806 | 0.090 / 251.161 / 251.751 / 252.606 | 8 / 0 |
| integrated: kind 1 | 19 | 0.036 / 252.807 / 252.807 / 252.807 | 0.086 / 244.180 / 244.180 / 244.180 | 1 / 0 |
| integrated: kind 2 | 55 | 0.061 / 0.135 / 0.674 / 0.674 | 0.140 / 158.829 / 165.314 / 165.314 | 0 / 0 |
| integrated: kind 3 | 18 | 0.008 / 0.101 / 0.101 / 0.101 | 0.030 / 246.804 / 246.804 / 246.804 | 0 / 0 |
| integrated: healthy all tasks | 103 | 37.124 / 193.303 / 207.406 / 212.108 | 0.092 / 56.660 / 158.829 / 165.314 | 0 / 0 |

Both captures have complete numeric ring coverage: captured sample count equals cumulative task count and no sequence gaps were found. Raw artifacts preserve warmup, per-repetition and fault-phase timings; ingress p99 is never substituted for all-task p99.

## End-to-end outcomes

Each phase includes all correlated request outcomes. Rejected and closed requests remain in distributions. The saturation burst can close its submitting socket before queued requests receive replies; those submissions are counted, not dropped from latency accounting.

| Run / phase | N | p50 / p95 / p99 / max (ms) | Outcomes |
|---|---:|---|---|
| baseline: warmup | 35 | 166.090 / 268.141 / 283.202 / 283.202 | ACCEPTED: 35 |
| baseline: healthy-0 | 27 | 366.219 / 449.297 / 453.002 / 453.002 | ACCEPTED: 27 |
| baseline: healthy-1 | 27 | 370.393 / 442.547 / 449.046 / 449.046 | ACCEPTED: 27 |
| baseline: healthy-2 | 27 | 372.314 / 429.656 / 461.656 / 461.656 | ACCEPTED: 27 |
| baseline: reconnect | 4 | 42.706 / 121.576 / 121.576 / 121.576 | ACCEPTED: 4 |
| baseline: slow-recipient | 1 | 47.648 / 47.648 / 47.648 / 47.648 | ACCEPTED: 1 |
| baseline: provider-outage | 21 | 1.140 / 265.031 / 265.169 / 265.169 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| baseline: database-outage | 21 | 1.927 / 6.409 / 46.933 / 46.933 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| baseline: completed-release | 64 | 146.301 / 175.440 / 323.688 / 323.688 | ACCEPTED: 64 |
| baseline: ingress-saturation | 160 | 4.700 / 8.390 / 9.458 / 10.357 | CLOSED_OR_SEND_FAILED: 160 |
| integrated: warmup | 35 | 159.961 / 243.005 / 296.379 / 296.379 | ACCEPTED: 35 |
| integrated: healthy-0 | 27 | 100.609 / 175.365 / 185.857 / 185.857 | ACCEPTED: 19, RATE_LIMITED: 8 |
| integrated: healthy-1 | 27 | 100.328 / 151.393 / 162.079 / 162.079 | ACCEPTED: 19, RATE_LIMITED: 8 |
| integrated: healthy-2 | 27 | 92.170 / 140.592 / 149.429 / 149.429 | ACCEPTED: 17, RATE_LIMITED: 10 |
| integrated: reconnect | 4 | 40.860 / 129.981 / 129.981 / 129.981 | ACCEPTED: 4 |
| integrated: slow-recipient | 1 | 51.405 / 51.405 / 51.405 / 51.405 | ACCEPTED: 1 |
| integrated: provider-outage | 21 | 1.201 / 265.163 / 266.704 / 266.704 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| integrated: database-outage | 21 | 1.863 / 8.027 / 45.306 / 45.306 | AUTHENTICATION_REQUIRED: 20, ACCEPTED: 1 |
| integrated: completed-release | 64 | 144.371 / 192.216 / 309.196 / 309.196 | ACCEPTED: 64 |
| integrated: ingress-saturation | 160 | 2.780 / 5.544 / 6.333 / 7.276 | CLOSED_OR_SEND_FAILED: 160 |

Healthy accepted action end-to-end distributions are also retained separately in each summary. Policy-induced read rejections change the mix of completed work, so an aggregate percentile difference is not a like-for-like read speedup claim.

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

baseline: resident sessions 32 → 0; completed releases 32. Slow write watchdog close 2077.898 ms; cleanup barrier 2092.652 ms; remaining sockets 15. Final active sockets 0, ingress depth 0, delivery depth/bytes 0/0; ingress overloads 1. Owned synthetic schema cleanup succeeded.

integrated: resident sessions 32 → 0; completed releases 32. Slow write watchdog close 2046.041 ms; cleanup barrier 2060.966 ms; remaining sockets 15. Final active sockets 0, ingress depth 0, delivery depth/bytes 0/0; ingress overloads 1. Owned synthetic schema cleanup succeeded.

Provider faults use the production verifier/cache/breaker with a 250 ms unavailable SDK double. Three actual dependency attempts open the breaker; remaining burst requests fail fast. One provider lookup succeeds after cooldown. Database faults reset only new proxy connections: three connection attempts open the database breaker. The recovery request uses one first successful probe followed by its normal fresh connections; total recovery connections are reported above and are not mislabeled as four recovery probes. Availability failures surface as AUTHENTICATION_REQUIRED at the incoming authorization boundary; gameplay is not claimed available while storage is down. Expiry and disconnect execution remains visible in the outage phase sample ranges.

Slow delivery uses one controlled Jetty callback, not a throttled operating-system TCP receiver. The asynchronous watchdog closes after its two-second threshold plus scheduler cadence; worker cleanup/permit release is measured separately. A real client load completes during the stall. Rehydration compares revision, phase, actor, players, ball, score and turn mode, but is a new application instance on the same owner thread, not a process-kill test. That additional fixture instance is discarded at harness process exit; the primary production application reports zero residents after completion.

## Resource use

| Run | Peak heap MiB | Peak JVM RSS MiB | JVM CPU seconds over sampled interval | External samples |
|---|---:|---:|---:|---:|
| baseline | 268.9 | 512.8 | 103.984 | 40 |
<!-- baseline database stats are preserved in external-resources.json -->
| integrated | 244.1 | 484.8 | 84.406 | 32 |
<!-- integrated database stats are preserved in external-resources.json -->

MariaDB CPU, memory, block/network I/O and process counts are recorded in every external sample. Heap/JVM CPU are sampled at 100 ms; RSS/container stats nominally every 2 seconds, with Docker command latency. The fixture generator and temporary rehydration instance add test-process overhead; these are not per-match production memory estimates.

## Targets and remaining limits

- baseline: healthy all-task p99 407.440 ms **fails** the 100 ms target; 48 healthy task(s) exceed 250 ms. Across all phases, 0 task(s) exceed the 2,000 ms occupancy ceiling.
- integrated: healthy all-task p99 207.406 ms **fails** the 100 ms target; 0 healthy task(s) exceed 250 ms. Across all phases, 0 task(s) exceed the 2,000 ms occupancy ceiling.

The 128 tracked-ingress limit and 112 advisory allowance do not bound the trusted control queue. Expiry/publication checks coalesce and disconnect demand is limited by admitted sockets, but other trusted control producers can still add worker backlog. This capture does not establish a global control-queue hard bound.

No target is relaxed. Repeated healthy overruns require follow-up investigation of full native application/checkpoint/publication work. The numeric full-task trace and request phase distributions locate the affected workload; this capture is not an allocation/CPU profiler and does not establish a single causal bottleneck. The separate #508 page/lane capture supplies SQL/query/parse/serialization evidence for lobby work.

Limitations: short three-repetition local scenario; one actively played match at a time; regular end-turn actions and administrative concession rather than long varied games; bounded Firebase SDK double; database reset faults rather than an exhaustive blackhole/lock matrix; controlled delivery callback; no process crash/restart; shared desktop/VM and local logging risk. No production capacity, maximum admitted gameplay throughput, long-session history or hardware-general claim follows from these results.

Reproduce using [the runbook](../operations/operating-envelope-runbook.md). Raw numeric evidence, configuration, fixture/source hashes and summaries are under [the capture directory](../reviews/operating-envelope-2026-11-10/). The requests remain available for independent review; unmet performance targets are tracked separately rather than marked as passing.

## Additional accounting detail

| Run | Sampled runtime seconds | Healthy window seconds | Achieved healthy action rate / second |
|---|---:|---:|---:|
| baseline | 71.901 | 35.014 | 0.685 |
| integrated | 56.104 | 19.323 | 1.242 |

Runner manifest timestamps include compilation/setup. These measured windows isolate load generation. The generator is closed-loop, capped by its 500 ms pause plus completion time; it does not impose an open-loop two-action-per-second arrival rate.

| Run / accepted operation | N | End-to-end p50 / p95 / p99 / max (ms) |
|---|---:|---|
| baseline: healthy actions | 24 | 128.909 / 152.288 / 184.915 / 184.915 |
| baseline: whole reconnect | 1 | 135.876 / 135.876 / 135.876 / 135.876 |
| integrated: healthy actions | 24 | 125.402 / 151.393 / 156.609 / 156.609 |
| integrated: whole reconnect | 1 | 151.396 / 151.396 / 151.396 / 151.396 |

Whole reconnect starts immediately before abrupt disconnect and includes worker cleanup, new TCP/WebSocket connection, authentication and duplicate-action confirmation. There is one scheduled reconnect per run: its p50/p95/p99/max are the same single observation, not a statistically stable tail estimate.

| Run / outage | Ingress tasks | Other control | Decision-expiry sweeps | Disconnect tasks |
|---|---:|---:|---:|---:|
| baseline: provider-outage | 21 | 1 | 13 | 1 |
| baseline: database-outage | 21 | 1 | 8 | 1 |
| integrated: provider-outage | 21 | 1 | 13 | 1 |
| integrated: database-outage | 21 | 1 | 7 | 1 |

These are real scheduled expiry sweeps over resident sessions and actual disconnect cleanup during the outage windows. The fixture does not arrange a pending native reactive decision to expire during the fault. Saturation reaches the baseline foreground/global allowance of 128 versus the integrated advisory allowance of 112 (16 slots remain reserved for foreground admission); all discarded queued work and subsequent cleanup remain in full-task samples.

| Run | Peak sampled MariaDB CPU % | Peak sampled MariaDB memory MiB | Ingress high water |
|---|---:|---:|---:|
| baseline | 14.77 | 118.40 | 128 |
| integrated | 14.66 | 125.80 | 112 |

Container CPU follows Docker stats semantics (100% is one core), and sampled peaks can miss short spikes. The environment/configuration artifact records VM and database limits.

[Performance follow-up #520](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/520) records the missed healthy latency target without relaxing ADR 0006.
