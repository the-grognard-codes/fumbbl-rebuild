# Single-worker operating-envelope results

Tracking [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39) and [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508).

This report replaces the single-pair comparison with a final balanced series of eight completed interleaved captures in one session. An earlier clean baseline attempt failed and remains a separate unresolved finding below. Each capture completes one discarded workload warmup repetition and three measured healthy repetitions. Warmup remains in raw and all-task accounting. Target failures below remain failures. Admission policy is unchanged.

## Revisions and method

Baseline runtime `d3dabde26026654930768bf18799777d84b5d589` includes merged RB2 and slices 1-3. Integrated runtime and reviewed harness are `10645965c33f9b8726c3de2c00148741b59257f9`. Both runtimes include actual #507 option A through PR #518 merge 53655f62f and notice-budget correction eb1d1dbe3. Both postdate slice 2 deliverable A, so control timing is available. A baseline predating that deliverable must report control timing unavailable.

The series ran from 2026-11-12T04:10:45.009Z to 2026-11-12T04:42:47.074Z UTC in ABBAABBA order. Each run uses a fresh owned synthetic schema, matching harness hashes and the same seed SHA-256 `96737d4504ed0981bd83126cc8b6faa3eddbdbbf66892b2fe96a6633add15cce`. Only the reviewed harness overlay is applied to baseline. No earlier isolated harness was imported. The overlay manifest records nine copied files and their provenance. Seven measured inputs are hashed in each capture manifest. The other two files are the summarizer and stack-routing JavaScript tests. Later commits contain documentation and evidence only.

A single earlier pair had baseline/integrated healthy worker p99 1421.743/830.027 ms and accepted-action p99 729.087/922.486 ms. First-repetition outliers and host variability make those values descriptive observations. They establish no code speedup or regression. The reviewer withdrew the narrow-page code-regression claim after same-session alternating reruns. Historical raw captures remain [archived](../reviews/operating-envelope-2026-11-11-review/), and the prior report is preserved at commit 0d5938eea. The still earlier mixed-admission comparison is superseded.

The engine and real Jetty sockets run in a host JUnit JVM using production classes. Dev-local startup is validated separately and its separate MariaDB supplies the isolated schema. The harness sets no heap or GC overrides. These results do not size the server container.

Machine and configuration are recorded in the manifests and environment.json. Windows 10.0.26300, AMD Ryzen 7 260 w/ Radeon 780M Graphics, 16 logical processors, 15.31 GiB host memory, Node v26.8.1, Temurin 21.0.11+10-LTS, Maven 3.9.9 and Connector/J 3.5.8. Docker Desktop exposes 16 CPUs and 7.41 GiB to its VM. MariaDB 11.8.9-MariaDB-ubu2404 uses a 128 MiB buffer pool, max_connections=151, innodb_flush_log_at_trx_commit=1 and sync_binlog=0. Container CPU and memory caps are unset. Unpooled JDBC uses connectTimeout=500 ms, socketTimeout=1500 ms and lock wait=1 second through a loopback fault proxy. Debug logging level is 1. No task builds or browser suites run during generated traffic. The user reported an independent performance test on localhost:5000. Background activity was not controlled, so these captures are labeled contended. Its exact overlap and load are not measured. The separate envelope stack and VS Code Java processes remain present.

## Workload and admission

Thirty-two synthetic active matches are restored through actual WebSocket loads. One additional eight-action workload repetition on resident match 31 warms native action/checkpoint/read work and is excluded from healthy statistics. Three measured repetitions each use a different resident match and perform eight durable end-turn actions. Every iteration also accepts currentMatches and detailed browse, followed by at least a 2,000 ms pause. Each capture therefore measures 24 accepted actions and 48 admitted lobby reads. The generator is closed-loop and response time reduces the achieved rate. The input activity timestamp is refreshed once before the whole series to stay within the unchanged 24-hour retention policy. environment.json records the sole field change and before/after hashes. The compressed exact seed is archived.

The healthy mix is **2 coaches + 1 spectator + 13 idle real TCP sockets = 16**. One match is actively played at a time. Thirty-two resident sessions do not imply 32 connected matches. Sixteen sockets allow at most eight two-coach or sixteen one-coach matches before spectator/preparation/service sockets consume slots. Every run rejects the seventeenth socket with 1013.

Each capture also covers reconnect and durable-action deduplication, JDBC rehydration in another application instance, one controlled stalled Jetty callback alongside 15 real sockets, 20-request provider and database outage bursts at 100 ms spacing, recovery after cooldown, completion of all 32 primary sessions, and 160 writes after an explicit 250 ms worker pause. The artificial pause and all rejected/closed work remain in all-task accounting.

## Per-run healthy distributions

Milliseconds use nearest-rank p50 / p95 / p99 / maximum. Worker execution includes scope exit. Queue wait is separate. Healthy results exclude restoration and the entire workload-warmup repetition. Every row has 24 accepted actions, 48 admitted reads and zero rejected healthy reads. With 24 action samples and 48 read samples per run, nearest-rank p99 equals the maximum. These sample sizes do not establish stable tails.

| Run | Healthy worker N | Worker execution | Queue wait | Accepted actions | Admitted reads | >250 / >2,000 ms worker |
|---|---:|---|---|---|---|---:|
| 01-baseline | 178 | 0.195 / 816.348 / 1072.782 / 1075.720 | 0.213 / 633.071 / 820.210 / 1104.553 | 283.243 / 352.562 / 377.104 / 377.104 | 819.151 / 1078.873 / 1211.254 / 1211.254 | 72 / 0 |
| 02-integrated | 151 | 87.783 / 421.809 / 538.399 / 564.203 | 0.215 / 189.356 / 350.346 / 502.730 | 286.052 / 422.239 / 427.350 / 427.350 | 211.284 / 321.555 / 330.898 / 330.898 | 24 / 0 |
| 03-integrated | 152 | 103.448 / 492.673 / 536.698 / 601.288 | 0.206 / 134.417 / 390.348 / 417.606 | 320.250 / 416.876 / 479.422 / 479.422 | 212.523 / 310.413 / 317.595 / 317.595 | 24 / 0 |
| 04-baseline | 187 | 0.213 / 1138.065 / 1424.631 / 1620.974 | 0.301 / 983.250 / 1207.261 / 1599.017 | 362.448 / 631.741 / 787.060 / 787.060 | 1070.283 / 1533.179 / 1734.075 / 1734.075 | 72 / 0 |
| 05-baseline | 187 | 0.175 / 1060.772 / 1210.925 / 1332.149 | 0.277 / 793.588 / 1187.995 / 1355.963 | 365.214 / 472.114 / 479.165 / 479.165 | 1059.216 / 1214.631 / 1511.071 / 1511.071 | 72 / 0 |
| 06-integrated | 152 | 105.198 / 500.537 / 554.229 / 695.607 | 0.229 / 162.550 / 327.256 / 363.850 | 342.688 / 420.943 / 565.269 / 565.269 | 221.113 / 336.135 / 383.729 / 383.729 | 24 / 0 |
| 07-integrated | 152 | 96.334 / 444.227 / 529.936 / 680.237 | 0.204 / 146.039 / 401.642 / 495.419 | 306.537 / 395.039 / 533.328 / 533.328 | 238.291 / 337.213 / 424.033 / 424.033 | 26 / 0 |
| 08-baseline | 185 | 0.173 / 1008.428 / 1612.121 / 1881.136 | 0.309 / 769.020 / 1343.820 / 2000.655 | 317.736 / 472.067 / 552.095 / 552.095 | 967.155 / 1356.613 / 2009.956 / 2009.956 | 72 / 0 |

The following medians summarize four per-run p99 values, with their full range in parentheses. They are not pooled percentiles or confidence intervals. Absolute target checks and individual runs remain visible.

| Runtime | Worker p99 median (range), ms | Action p99 median (range), ms | Admitted-read p99 median (range), ms |
|---|---:|---:|---:|
| baseline | 1317.778 (1072.782-1612.121) | 515.630 (377.104-787.060) | 1622.573 (1211.254-2009.956) |
| integrated | 537.549 (529.936-554.229) | 506.375 (427.350-565.269) | 357.313 (317.595-424.033) |

Four short captures per revision reduce the run-order confound while retaining substantial host and workload variability. These data do not establish stable production tails or a causal performance improvement.

## Full worker and control timing

This table pools actual samples across four captures per runtime. Kind 0 is ingress, 1 other control, 2 decision expiry, and 3 disconnect. All phases include warmup, faults, saturation and cleanup. Counts include tiny, rejected and untracked tasks. No sample is excluded for lacking a request ID.

| Runtime / task group | N | Execution p50 / p95 / p99 / max (ms) | Queue p50 / p95 / p99 / max (ms) | >250 / >2,000 ms execution |
|---|---:|---|---|---:|
| baseline / all phases / all tasks | 2450 | 0.143 / 940.316 / 1148.776 / 1881.136 | 0.286 / 515.027 / 973.134 / 2000.655 | 667 / 0 |
| baseline / kind 0 | 1528 | 96.295 / 997.535 / 1243.524 / 1881.136 | 0.221 / 258.463 / 264.009 / 377.715 | 659 / 0 |
| baseline / kind 1 | 80 | 0.057 / 270.801 / 475.919 / 475.919 | 0.176 / 141.102 / 238.022 / 238.022 | 8 / 0 |
| baseline / kind 2 | 770 | 0.107 / 0.224 / 0.612 / 3.345 | 44.659 / 849.165 / 1187.995 / 2000.655 | 0 / 0 |
| baseline / kind 3 | 72 | 0.026 / 0.126 / 0.211 / 0.211 | 0.093 / 229.713 / 265.929 / 265.929 | 0 / 0 |
| integrated / all phases / all tasks | 2215 | 0.202 / 485.209 / 665.795 / 1015.640 | 0.224 / 250.107 / 392.106 / 995.391 | 421 / 0 |
| integrated / kind 0 | 1464 | 105.234 / 518.252 / 692.666 / 1015.640 | 0.208 / 247.966 / 253.469 / 484.361 | 413 / 0 |
| integrated / kind 1 | 80 | 0.062 / 256.394 / 485.209 / 485.209 | 0.144 / 99.570 / 228.141 / 228.141 | 8 / 0 |
| integrated / kind 2 | 599 | 0.117 / 0.289 / 0.587 / 10.848 | 0.356 / 374.416 / 497.978 / 995.391 | 0 / 0 |
| integrated / kind 3 | 72 | 0.025 / 0.112 / 0.278 / 0.278 | 0.085 / 224.314 / 235.355 / 235.355 | 0 / 0 |

All eight captures have complete numeric ring coverage. Captured samples equal cumulative worker-task counts and there are zero missing sequence samples. Each summary retains per-phase execution, queue wait, request outcomes and accepted action/read distributions.

## Request outcomes

The table pools four captures per runtime, including failures. Saturation submissions closed before replies are retained. Request latency is measured at the generating client and is distinct from full-worker occupancy.

| Runtime / phase | N | End-to-end p50 / p95 / p99 / max (ms) | Outcomes |
|---|---:|---|---|
| baseline / warmup | 140 | 418.511 / 659.045 / 774.453 / 900.051 | ACCEPTED=140 |
| baseline / workload-warmup | 108 | 848.363 / 1371.219 / 1860.216 / 1988.885 | ACCEPTED=108 |
| baseline / healthy-0 | 108 | 787.060 / 1280.289 / 1533.179 / 1622.676 | ACCEPTED=108 |
| baseline / healthy-1 | 108 | 853.427 / 1213.680 / 1734.075 / 1762.382 | ACCEPTED=108 |
| baseline / healthy-2 | 108 | 854.612 / 1183.911 / 1356.613 / 2009.956 | ACCEPTED=108 |
| baseline / reconnect | 16 | 164.795 / 547.826 / 547.826 / 547.826 | ACCEPTED=16 |
| baseline / slow-recipient | 4 | 120.609 / 128.737 / 128.737 / 128.737 | ACCEPTED=4 |
| baseline / provider-outage | 84 | 2.790 / 269.712 / 283.797 / 283.797 | AUTHENTICATION_REQUIRED=80, ACCEPTED=4 |
| baseline / database-outage | 84 | 4.563 / 27.520 / 112.714 / 112.714 | AUTHENTICATION_REQUIRED=80, ACCEPTED=4 |
| baseline / completed-release | 256 | 302.836 / 546.123 / 770.596 / 859.317 | ACCEPTED=256 |
| baseline / ingress-saturation | 640 | 13.130 / 33.488 / 37.405 / 43.105 | CLOSED_OR_SEND_FAILED=640 |
| integrated / warmup | 140 | 443.106 / 681.671 / 883.907 / 894.629 | ACCEPTED=140 |
| integrated / workload-warmup | 108 | 288.652 / 473.482 / 512.095 / 596.281 | ACCEPTED=108 |
| integrated / healthy-0 | 108 | 273.340 / 393.043 / 479.422 / 565.269 | ACCEPTED=108 |
| integrated / healthy-1 | 108 | 253.623 / 374.490 / 410.727 / 420.943 | ACCEPTED=108 |
| integrated / healthy-2 | 108 | 253.459 / 383.729 / 427.350 / 533.328 | ACCEPTED=108 |
| integrated / reconnect | 16 | 104.186 / 462.883 / 462.883 / 462.883 | ACCEPTED=16 |
| integrated / slow-recipient | 4 | 88.644 / 139.702 / 139.702 / 139.702 | ACCEPTED=4 |
| integrated / provider-outage | 84 | 2.562 / 265.577 / 272.958 / 272.958 | AUTHENTICATION_REQUIRED=80, ACCEPTED=4 |
| integrated / database-outage | 84 | 4.609 / 42.486 / 118.328 / 118.328 | AUTHENTICATION_REQUIRED=80, ACCEPTED=4 |
| integrated / completed-release | 256 | 294.552 / 554.787 / 849.321 / 999.021 | ACCEPTED=256 |
| integrated / ingress-saturation | 640 | 7.070 / 20.988 / 25.288 / 3015.734 | CLOSED_OR_SEND_FAILED=640 |

## Lifecycle, dependency faults and cleanup

| Run | Whole reconnect ms | Slow watchdog / cleanup ms | Residents loaded / final | Completed releases | Provider attempts outage / recovery | Database attempts outage / recovery connections |
|---|---:|---|---|---:|---|---|
| 01-baseline | 329.404 | 2075.805 / 2091.408 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 02-integrated | 356.416 | 2109.978 / 2129.110 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 03-integrated | 293.460 | 2063.702 / 2074.016 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 04-baseline | 393.192 | 2010.936 / 2025.023 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 05-baseline | 596.339 | 2049.042 / 2064.053 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 06-integrated | 356.310 | 2025.052 / 2039.010 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 07-integrated | 322.996 | 2059.581 / 2082.131 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |
| 08-baseline | 341.089 | 2081.938 / 2094.395 | 32 / 0 | 32 | 3 / 1 | 3 / 4 |

All runs confirm duplicate-action recognition after reconnect, an unchanged committed revision and identical durable public state after rehydration. Whole reconnect includes abrupt disconnect, worker cleanup, fresh TCP/WebSocket connection, authentication and duplicate-action confirmation. There is only one reconnect per capture. Rehydration compares revision, phase, actor, players, ball, score and turn mode on the same worker thread. The extra application instance is discarded at process exit. This is not a process-kill test.

The slow recipient is a controlled Jetty write callback. The watchdog expires at two seconds plus scheduler cadence and cleanup/permit release is measured separately. An ordinary real client request completes during the stall. This does not model operating-system TCP buffering.

Provider faults exercise the production verifier/cache/breaker around a 250 ms unavailable SDK double. Three dependency attempts open the breaker and later requests fail fast. One lookup succeeds after cooldown. Database faults reset new loopback proxy connections. Three attempts open that breaker. Recovery uses one successful probe followed by three normal fresh connections, totaling four connections. Availability failures surface as AUTHENTICATION_REQUIRED at authorization. Gameplay availability during a database outage is not claimed.

| Runtime / outage | Ingress | Other control | Decision expiry | Disconnect |
|---|---:|---:|---:|---:|
| baseline / provider-outage | 84 | 4 | 53 | 4 |
| baseline / database-outage | 84 | 4 | 30 | 4 |
| integrated / provider-outage | 84 | 4 | 52 | 4 |
| integrated / database-outage | 84 | 4 | 28 | 4 |

Scheduled expiry sweeps over resident sessions and real disconnect cleanup continue during both outage windows. The fixture does not arrange a pending native reactive decision to expire. The 128 tracked-ingress limit and 112 advisory allowance do not bound the trusted control queue. Other control producers can still create backlog. Saturation reaches the different foreground/advisory allowances, while all discarded tasks remain accounted.

Every run ends with zero active sockets, ingress depth, delivery depth and delivery bytes, zero primary resident sessions, 32 completed releases and successful owned-schema removal. Admission and overload metrics remain in the raw transport records.

## Resources and competing activity

| Run | Peak heap MiB | Peak JVM RSS MiB | JVM CPU seconds | External samples | Pre-run server CPU % | Pre-run DB CPU % | Sampled window s | Healthy actions / s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 01-baseline | 222.9 | 419.4 | 321.078 | 53 | 0.57% | 0.03% | 187.598 | 0.250 |
| 02-integrated | 278.4 | 497.9 | 247.922 | 42 | 0.54% | 7.90% | 145.939 | 0.358 |
| 03-integrated | 239.6 | 464.0 | 260.016 | 44 | 7.06% | 0.03% | 148.634 | 0.353 |
| 04-baseline | 232.3 | 441.3 | 342.469 | 47 | 0.70% | 0.02% | 206.818 | 0.212 |
| 05-baseline | 243.1 | 440.2 | 358.641 | 49 | 1.02% | 0.04% | 206.732 | 0.219 |
| 06-integrated | 262.0 | 489.0 | 266.734 | 37 | 0.74% | 7.22% | 159.879 | 0.348 |
| 07-integrated | 261.5 | 481.8 | 256.156 | 42 | 1.07% | 0.31% | 149.738 | 0.351 |
| 08-baseline | 236.1 | 423.0 | 326.734 | 52 | 0.93% | 0.02% | 198.044 | 0.225 |

| Run | Peak sampled DB CPU % | Peak sampled DB memory MiB | Ingress high water |
|---|---:|---:|---:|
| 01-baseline | 23.87 | 139.70 | 128 |
| 02-integrated | 21.40 | 144.90 | 112 |
| 03-integrated | 26.60 | 150.10 | 112 |
| 04-baseline | 40.34 | 155.20 | 128 |
| 05-baseline | 22.05 | 162.60 | 128 |
| 06-integrated | 17.95 | 165.60 | 112 |
| 07-integrated | 22.91 | 170.60 | 112 |
| 08-baseline | 23.47 | 175.40 | 128 |

| Runtime | Reconnect N | Whole reconnect p50 / p95 / p99 / max (ms) |
|---|---:|---|
| baseline | 4 | 341.089 / 596.339 / 596.339 / 596.339 |
| integrated | 4 | 322.996 / 356.416 / 356.416 / 356.416 |

Four reconnect observations per runtime are short-run observations. Their p95 and p99 equal the maximum and do not establish stable tails.

The series records docker stats for every container in the isolated envelope project immediately before and after every run. These samples show activity in that project. Other host processes and the user's separate stack were not sampled by this runner. They are context observations, not a guarantee of host idleness. MariaDB CPU/memory/block I/O/network/process counts and JVM RSS are sampled throughout each capture. Heap/JVM CPU are sampled nominally every 100 ms, and external samples every two seconds plus command latency. Runner wall time includes compilation/setup, while sampled windows isolate the running test. Fixture generation and the temporary recovery instance add test-process cost. These are not per-match production estimates.

## Targets and remaining limitations

The ceiling comparison below applies to sampled worker execution. In 08-baseline, the largest client-observed read was 2,009.956 ms and one expiry task waited 2,000.655 ms in the queue. Those separate clocks remain visible and are not counted as worker-execution overruns.

- baseline fails the healthy 100 ms worker-p99 target in 4/4 runs. 288 measured healthy tasks exceed 250 ms. All-phase maximum is 1881.136 ms, with 0 tasks above the 2,000 ms occupancy ceiling.
- integrated fails the healthy 100 ms worker-p99 target in 4/4 runs. 98 measured healthy tasks exceed 250 ms. All-phase maximum is 1015.640 ms, with 0 tasks above the 2,000 ms occupancy ceiling.

No target is relaxed. [Performance follow-up #520](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/520) retains investigation of native application/checkpoint/publication work. This numeric trace is not an allocation/CPU profiler and establishes no single causal bottleneck. The separate #508 real-page capture retains SQL/document/recovery/serialization costs and the advisory-lane probe.

The declared scenarios and cleanup passed. The healthy target remains unmet, so these results do not certify the operating envelope. Limitations include four short runs per revision, one actively played match at a time, end-turn and administrative concession actions, a bounded SDK outage double, connection-reset database faults, controlled delivery callback, application rehydration without process death, shared desktop/VM activity and local logging risk. There is no production-capacity, maximum-throughput, long-session-history or hardware-general claim.

Reproduce using [the runbook](../operations/operating-envelope-runbook.md). Exact manifests, raw samples, per-run summaries, container context, seed and overlay provenance are in [the series artifact directory](../reviews/operating-envelope-2026-11-11-series/). Current verification and startup evidence are in [the final review report](../reviews/2026-11-11-pr521-final-review.md). PR #521 and issues #508/#39 remain open for independent review.

## Failed and diagnostic attempts

The primary tables describe the final predeclared ABBAABBA series. They are conditional on completed runs. The earlier failed baseline and diagnostic rerun are retained alongside the final series so errors and selection are visible. They are not pooled into the balanced four-per-runtime tables.

| Attempt | Exit | Healthy actions / admitted reads | Healthy worker p99 / action p99 / read p99 (ms) | Result |
|---|---:|---|---|---|
| failed-baseline | 1 | 24 / 48 | 551.914 / 498.995 / 623.286 | Failed clean baseline. Healthy traffic completed, slow-recipient request unexpectedly rejected before fault injection. Fault/completion coverage incomplete. |
| diagnostic-baseline | 0 | 24 / 48 | 741.978 / 228.920 / 804.505 | Diagnostic only. Temporary failure-only authorization logging in baseline production source. Completed, but excluded from comparison. Original source restored byte-for-byte and recompiled before final series. |

The initial baseline returned AUTHENTICATION_REQUIRED during the slow-recipient phase before intentional faults. Its cause remains unresolved. The diagnostic rerun reproduced only the intended provider/database outage rejections. A successful rerun does not erase the earlier rejection. The failed run removed its owned schema, but its pre-teardown transport snapshot still had one active connection, zero ingress depth, one delivery item and 26 queued delivery bytes. Jetty/worker teardown and JVM exit followed. Completed-session release was not reached in that attempt.

The diagnostic baseline had a temporary logging overlay and is excluded from comparison. Source restoration and absence of diagnostic bytecode were verified before the final series. [Raw attempts and provenance](../reviews/operating-envelope-2026-11-11-series/other-attempts/) retain both runs. A separate page-setup attempt was interrupted by confirmed Windows sleep/resume before measurement. A temporary system keep-awake request was used for subsequent captures and released during cleanup. It changed no display or permanent power settings.
