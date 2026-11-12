# Slice 4 post-implementation report

Historical initial delivery. [PR #521 corrections and current validation](2026-11-11-pr521-review-corrections.md) supersede the direct-review assessment and measured revision below; current full local verification has an explicitly recorded baseline-reproducing Firebase error.

Scope: #508 lobby read bounds, followed by #39 integrated operating-envelope measurement. Branch: `fix/lobby-read-bounds-envelope-508-39`, created from current main `d3dabde26026654930768bf18799777d84b5d589`. No unrelated worktree/stash content was changed. No merge or deployment was performed.

## Delivery and revision boundaries

| Commit | Scope | Evidence boundary |
|---|---|---|
| `c71c8e1c9b332ff822e40239f02eb62fa4c46fc4` | #508 shared bucket, bounded batches/parsing, advisory lane and browser behavior | Focused regressions, 535 browser tests/build, lobby/lifecycle checks, real-driver capture, successful startup, full clean verify |
| `7fc03a9cd` | #39 new integrated harness/runbook and accounting tests | Focused actual-Jetty/MariaDB scenario and accounting checks; existing fixture provenance recorded |
| `80b836816` | #508 follow-up: cap journal SQL rows before driver allocation | Explicit overflow corruption/rollback test; final clean verification and real-driver recapture |
| `e8c3cda1f2e2423204d322f1d18fdf200fa28fbf` | #39 public-state recovery comparison | Full verify and preliminary exact-revision captures; whole-reconnect latency not yet recorded |
| `df59449552756399e5c4ed766ba81557a118e987` | #39 whole-reconnect latency accounting | Final exact runtime/harness source, fresh full validation and baseline/integrated recapture |
| Subsequent report commit | Documentation, numeric evidence and tracker mirrors only | Artifact/source-hash checks; no measured code changes |

The first #508 boundary was validated before #39 harness work. Later self-review reopened #508 for the SQL row limit; measurements waited for the corrected combined revision and a fresh full validation. One superseded clean verify was intentionally stopped, not reported as a passing run. The exact measured revision remains in history.

## Standards review

Direct review found no remaining documented-standard violations: Java 21, instance services, unchanged BB2025 formats, bounded owner-thread work, no wildcard imports or legacy field prefixes, and scoped changelog/test changes. Production ownership/admission limits remain unchanged. The harness uses test-only reflection to collect existing transport counters and schedule control barriers; it does not add a production diagnostics surface.

The [code-review skill](../../.agents/skills/code-review/SKILL.md) requires “Both axes run as **parallel sub-agents**”. The reviewer spawn failed because its configured `gpt-6.1-sol` model was unavailable. Direct standards and spec reviews were completed instead; they are not represented as independent reviews. The PR still requires independent review.

## Spec review

#508 implements shared capacity-two / one-per-2,000-ms refill, shape rejection before charging, fail-closed authorization, correlated RATE_LIMITED for work/bucket exhaustion, fixed batch query bounds, allocation/parse/serialization checks, genuine persistence/validation errors, disconnect cleanup, retained lobby data/selection and bounded coalescing/backoff. Initial/reconnect and compatibility fallback are covered. The lane decision is supported by a recorded controlled comparison and the integrated trace.

#39 supplies a checked-in scenario, runbook, fixture and numeric capture with explicit source provenance. Baseline and final source hashes match for the harness. Both runs include 32 primary application residents, a declared 16-socket mix, actual loopback WebSockets, durable actions, retry deduplication, state rehydration, controlled slow delivery, completed-session release, dependency breaker bursts/recovery, resource samples, full ingress/control timings, outcome accounting and cleanup. Detailed limitations and target failures are in the [operating-envelope results](../specs/engine-worker-concurrent-match-envelope-outcome.md). There is no claim of 32 connected matches, maximum throughput, process-crash recovery or external Firebase performance.

Review corrections included swallowed read-budget/storage failures, preserved document authorization/ID validation, driver-side allocation limits, aggregate journal copy work and the SQL row cap. Harness corrections included unsolicited null request IDs, serialized WebSocket burst writes, phase boundaries, state comparison and a whole-reconnect elapsed sample. Preliminary exact-revision captures at e8c3cda1f are retained under .tools but superseded by the corrected harness for final acceptance. Debug captures were not used as final operating-envelope evidence.

## Validation and startup

- Final pinned clean verify: **passed**, 1,126 tests, zero failures/errors, 22 explicitly gated/skipped cases; 16m48s, finished 2026-11-10 19:00:45 -05:00.
- Browser: **535 passed**, production build passed, lobby checks at 1440/390px, preparation lifecycle and reconnect checks passed.
- Measurement accounting: **2 passed**; focused row-bound/overflow tests passed.
- Opt-in MariaDB page capture and corrected baseline/integrated captures: **passed**. These run separately from the gated ordinary suite.
- Final artifact checks require matching harness/seed hashes, complete task sampling, explicit reconnect accounting, zero transport cleanup counters, successful runner exits and owned-schema cleanup.

Dev-local was restarted on the exact measured revision with `node tools/dev-local.mjs --restart --quick`, after separate full validation. The first orchestration wrapper treated informational Docker stderr as a PowerShell terminating error. The wrapper was corrected to check native exit codes, then startup was repeated; no application change was needed. Startup/proxy checks succeeded and the server reported `Browser V2 running on port 22227`. The existing SLF4J no-provider warning selects a no-operation logger; no unexplained startup error remained. Native debug logging remains synchronous at level 1 in the harness, retaining ADR 0006's documented logging risk.

Evidence logs are retained locally under `.tools/envelope-measured-verify.log`, `.tools/envelope-measured-browser-*.log`, `.tools/envelope-measured-*-ui.log`, `.tools/envelope-exact-startup.log`, `.tools/envelope-exact-server.log`, `.tools/lobby-exact-revision.log`, `.tools/envelope-baseline-final.log` and `.tools/envelope-integrated-final.log`. Reviewable numeric evidence is checked in beside the reports. Each measurement runner removed only its newly owned synthetic schema in `finally`.

## Targets, limitations and follow-up

The healthy 100 ms all-task p99 target is not met. The final 100-entry lobby page p99 is 294.050 ms, including one measured execution above 250 ms. Integrated healthy all-task p99 is 207.406 ms versus baseline 407.440 ms. Across all phases, the maximum was 322.806 ms integrated and 420.529 ms baseline, with zero tasks above 2,000 ms; no target is silently relaxed. [Performance follow-up #520](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/520) tracks the remaining investigation.

The #508 [outcome](../specs/engine-worker-lobby-read-bounds-outcome.md) records exact bounds, query counts and scheduling rationale. The #39 result separates healthy, warmup, slow-delivery, outage, completion and saturation phases; all rejections/closed requests remain visible. Missed latency targets remain failures, with a tracked follow-up proposal. Neither ADR target relaxation nor parallel mutation is authorized.

Review summary: Standards — zero remaining documented-standard violations; Spec — healthy latency target failure, with measurement limitations explicitly retained.

Issues #508 and #39 remain open for independent review, with the revised requests and result/PR links recorded on each. TODO/spec mirrors reflect delivered local implementation/measurement rather than claiming an unmeasured passing envelope.

## Process observations

The pinned full native suite is expensive but necessary; freeze source before exact-revision measurement and record any later corrections. The unavailable reviewer model prevented the skill's parallel review; model configuration needs a separate environment correction. The PR template still names legacy `build.ps1`/`ChangeList`; the handoff uses current AGENTS.md requirements (`target-build.ps1 verify` and `CHANGELOG.md`) without broadening this change into workflow cleanup.

The detached baseline worktree and ignored logs/seed copies are retained locally for reproduction. Both owned measurement schemas were removed; unrelated development data and worktrees were preserved.
