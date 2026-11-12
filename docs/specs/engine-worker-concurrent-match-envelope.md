# Feature: Measure the single-worker concurrent-match operating envelope

Tracking: [#39](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/39).
Status: declared local baseline/integrated measurement completed; independent review pending. Targets are evaluated in the [outcome](engine-worker-concurrent-match-envelope-outcome.md).
Decision: [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Review: [combined findings C3/C4/C5 and E1/E2](engine-worker-requests-review.md).

## Abstract

Build or reuse a repeatable mixed-load scenario to measure the shared worker's
operating envelope, including 32 resident matches, reconnects, durable actions,
slow recipients, dependency outages and completed-session release.

## Objective

Produce reproducible evidence for supported load and the accepted execution
targets without treating bounded I/O as match isolation or authorizing parallel
per-match mutation.

## Context / Existing Behavior

#39 requests a declared mixture of 32 resident active matches and lifecycle work.
ADR 0006 records a shared worker/process failure domain, a healthy p99 task
execution target of ≤ 100 ms, investigation of recurring execution above about
250 ms and a provisional whole-request failure ceiling of 2,000 ms. Local logging
may still stall and is an explicitly accepted residual risk.

Current transport admission permits 16 sockets and 128 tracked ingress requests;
resident session capacity is 32. These describe different resources. A scenario
with 32 simultaneously connected two-coach matches is not admitted by those
limits. Establish resident matches by cycling valid connections and measure a
declared admitted active subset; do not silently raise production limits or
claim 32 concurrently connected matches were validated.
With no other socket consumers, 16 sockets permit at most eight matches with both
coaches connected, or 16 matches with one coach connected each. Spectators,
preparation and service connections consume the same transport allowance and
reduce that active-coach subset; state the actual socket mix in every run.

## In Scope

- A repeatable local test harness/scenario using current runtime and protocol.
- A declared workload with resident matches, admitted foreground actions,
  reconnect, checkpoint/recovery, slow delivery and session release.
- Healthy, saturated/admission and controlled-outage runs with worker/queue,
  resource, failure and cleanup measurements.
- Measurement of untracked expiry/disconnect/control tasks using numeric full-task
  timing delivered by #505 A; this request owns harness/reporting, not that seam.
- A Markdown results report and data artifacts sufficient to repeat the result.

## Out of Scope

- Per-match lanes, multiple engine owners/processes or new ownership guarantees.
- Raising admission limits, changing rules or silently relaxing ADR targets.
- Production load tests, deployment or synthetic claims about untested hardware.
- Implementing the other gaps as part of a measurement harness.

## Functional Requirements

- Record exact revision, pinned toolchain, machine/container resources, database,
  configuration, local logging level, load generator and protocol mix. Exclude
  credentials, bearer tokens and private game/identity data from artifacts.
- Declare warmup, repetitions, duration, match/recipient counts, admitted sockets,
  action rate, reconnect schedule and completed-session release conditions. Keep
  resident matches distinct from connected coaches/spectators and active tasks.
- Exercise 32 resident active matches under unchanged admission using a stated
  connection schedule, plus an admitted gameplay subset. If harness/runtime
  constraints prevent this, report actual coverage and the blocker rather than
  reducing the requirement or fabricating a capacity claim.
- Measure queue wait separately from worker execution and end-to-end accepted
  action/reconnect latency. Report p50/p95/p99, maxima, sample counts, successes,
  rejections and timeout/error counts; do not hide rejected/timed-out requests
  when reporting latency. Use existing #497/#501 timing traces where possible.
- Report ingress and untracked control execution separately by numeric task kind,
  then report all-task coverage. #505 A must time scope exit, including publication
  and cleanup, even without a browser request ID or enabled diagnostics replies.
  Never present ingress-only p99 as the ADR's all-task p99. A pre-A baseline must
  explicitly mark control-task timings unavailable; integrated acceptance requires
  them. Record non-preemptible native/CPU overruns as failures, not enforced bounds.
- Capture heap/RSS, CPU, MariaDB/container resource use, ingress/connection state,
  resident-session counts and cleanup. Include durable checkpoint/recovery and
  completed-session release without changing persistence/replay semantics.
- Use controlled slow recipients to test delivery isolation without blocking the
  generator. Distinguish watchdog write expiry from actual worker cleanup and
  permit release. Record overload behavior and the untracked-control queue caveat.
- After #504/#505 controls are available, include sustained provider/database
  outage bursts showing breaker opening, fast rejections, one recovery probe and
  continued eligible expiry/disconnect work. Confirm complete request occupancy
  ≤ 2,000 ms under the ADR's documented logging risk; failures remain evidence,
  not permission to redefine the ceiling.
- Compare healthy p99 task execution to 100 ms and identify repeated tasks above
  about 250 ms. Classify regressions/bottlenecks with trace evidence and record
  remaining limits. Any target revision needs a separate explicit maintainer
  decision; this request cannot automatically accept a slower result.
- Record at least one reproducible baseline and the final integrated mitigation
  result where available. A baseline may run before all fixes; name unresolved
  gaps and do not certify the operating envelope from that baseline alone.

## Acceptance Criteria

- A checked-in scenario/runbook can reproduce the declared admitted workload,
  including 32 resident matches and actual connection/admission constraints.
- The results report contains configuration, revisions, sample definitions,
  latency distributions, maxima, resource data, failures, cleanup and raw evidence
  locations; another operator can repeat it without private credentials in files.
- Integrated results include numeric full execution and queue-wait distributions
  for ingress, decision expiry, disconnect cleanup and other control tasks; no
  hidden exclusion of tasks without request IDs. The admitted subset is stated
  against the eight-two-coach / sixteen-one-coach upper bounds and actual socket mix.
- Slow-recipient, reconnect, durable checkpoint/recovery and completed-session
  release cases show no lost/duplicated durable action or retained permits/sessions
  after the applicable cleanup completes; failures are explicitly reported.
- Outage runs validate integrated #504/#505 breaker/budget behavior; no result
  implies that a working breaker restores gameplay while the database is down.
- Findings state tested capacity, admission rejections, target compliance or
  failure and residual risks. Missed targets produce tracked follow-up proposals,
  not a passing claim or unauthorized parallelization.

## Constraints

- Create a new working branch for harness or report changes; preserve unrelated
  files. Use local/test identities and controlled dependencies only.
- Retain worker ownership, existing admission and ADRs 0002/0004/0005/0006.
- Do not use real external services as fault targets or write production data.
- Local logging remains allowed; async logging and process isolation are deferred.
- Do not commit, push, publish, deploy or modify GitHub state without authorization.

## Implementation Guidance

Reuse existing load, timing and lifecycle fixtures before adding a harness.
The baseline/harness can start any time; #505 A owns its missing control-task
instrumentation. The final integrated run follows all five fixes, including the
implementation of approved #507 option A, not merely #504/#505. See the
[handoff order](../adr/0006-single-engine-worker.md#implementation-order).
Coordinate the final integrated run with all five fix requests linked from ADR
0006. #507-dependent scenarios require actual implementation of the approved
ADR 0005 option A amendment; preliminary measurements must identify the policy
implemented by the measured code, rather than assume approval changed runtime behavior.
Keep forecasts distinct from results and never represent 32 resident matches as
32 admitted concurrent connections.

## Validation

Validate harness accounting and fault controls with focused checks, then run the
declared scenarios and inspect trace/resource artifacts. Test meaningful harness
contracts if new code is added. After application/harness code changes, run
relevant unit/browser checks and browser build plus pinned
`tools/target-build.ps1 verify`; a report-only update needs documentation/artifact
checks rather than an unrelated rebuild. Preserve the exact measured revision.

## Completion Notes

The [runbook](../operations/operating-envelope-runbook.md) and [results](engine-worker-concurrent-match-envelope-outcome.md) record the declared workload, exact revisions, full-task timing, resources, outcomes, cleanup and limitations. Baseline and integrated captures are complete; target failures remain explicit and require follow-up. The revised request is linked from #39, and the TODO mirror is retained. Issue closure awaits independent review.

PR #521 review corrections and current validation are recorded in the [final review outcome](../reviews/2026-11-11-pr521-final-review.md). Historical captures remain separate. The current repeated series retains all healthy reads as admitted work, includes a discarded workload warmup and records contention. Full-verification and latency target failures remain explicit.