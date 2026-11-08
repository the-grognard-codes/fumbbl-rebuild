# Feature: isolate residual checkpoint and recovery serialization spikes

GitHub: [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489)
Triage: `ready-for-agent`
Blocked by: None (can start immediately).

## Abstract

Deliver a repeatable native action workload that explains and reduces the checkpoint outlier observed in the latest diagnostic capture.

## Objective

Make the cause of the two-second authoritative action delay reproducible and measurable without weakening checkpoint-before-ack durability.

## Context / Existing Behavior

Capture capture-1-4ea4e06c682b retained 30 seconds and five mutations. The slowest mutation had 2,157 ms application RTT, 2,052.4 ms server handling, 1,761.968 ms checkpoint, 1,135.974 ms recovery serialization and 169.034 ms checkpoint SQL. Mutation checkpoint median was 145.404 ms. Nested phases overlap. Earlier recovery-journal and encoding improvements were already delivered under #332 and #336; #324 records delivery through PR #339. This ticket investigates the residual outlier, rather than reimplementing the journal.

Source: the user's capture review and approved follow-up discussion on 2026-11-07. Capture-local numeric evidence contains no private match or account identifiers. Related diagnostics infrastructure: #483 and #488. The diagnostics implementation is available in the current feature workspace; record its exact source and served-artifact identity rather than assuming it has been merged or deployed.

## In Scope

- Exercise a real native action sequence across ordinary journal append and checkpoint compaction, with first-use and warmed runs and a controlled match-history size.
- Distinguish checkpoint preparation, recovery serialization, cursor/fingerprint work, storage encoding and database work; collect focused CPU/allocation/GC evidence when needed.
- Apply only a bounded correction supported by a failing reproduction; retain a runnable workload and a concise diagnosis for later comparison.

## Out of Scope

- Replacing the persistence architecture without evidence, changing rules, acknowledging before durable commit, or treating all checkpoint time as database latency.
- Full-match recording, unrelated frontend changes and reopening completed journal implementation scope.

## Functional Requirements

- Record exact source/artifact identity, runtime conditions, action sequence, warm-up policy, history size and diagnostics mode for each run.
- Identify whether the outlier is append, compaction, first-use initialization, history-size growth or another demonstrated phase; do not infer a phase from a nested total.
- Keep added diagnostics bounded and optional, and reuse existing timing/report seams before adding fields.

## Acceptance Criteria

- [ ] A documented agent-runnable command exercises the real action-to-durable-reply path and detects the reproduced checkpoint regression; if the reported spike cannot be reproduced, retain measured attempts and mark the cause unresolved.
- [ ] Provide repeated cold/warm and append/compaction results with sample counts, median/p95/max, the slow traces and phase attribution; do not generalize p95 from five actions.
- [ ] For a bounded fix, demonstrate failure before and success after at the correct seam, plus matched-workload evidence and unchanged durable outcomes. If a wider change is necessary, deliver a precisely scoped follow-up instead of a speculative rewrite.
- [ ] Verify replay/recovery parity, duplicate retry, generation conflict and persistence failure behavior for the affected path.

## Blocked by

None (can start immediately). Independent investigations may proceed in parallel.

## Constraints

- Preserve BB2025 rules, server authority, durable acceptance, replay/recovery compatibility and existing bounded request/queue behavior.
- Keep diagnostics opt-in and DEV/dev-local only; PROD Debug remains hidden. Retain bounded sliding-window captures and privacy-safe reports.
- Create an isolated working branch for implementation, preserve unrelated working-tree changes and follow repository conventions. Commit, push, PR, merge and deployment require separate authorization.
- Preserve MUTP styling, accessibility and Android/Windows/Linux compatibility where affected. Do not substitute emulation for physical-device performance evidence.

## Implementation Guidance

Start with a small native reproduction and one falsifiable hypothesis at a time. Existing journal and full-checkpoint paths already provide the storage seam; no broad prefactor is assumed. Relates to #332 and #336, whose historical acceptance status does not block reproducing the current behavior.

## Validation

- Run focused native checkpoint/journal regressions, relevant Java tests and the game-server build for changed behavior; run affected browser checks if diagnostics contracts change.
- Retain compact before/after analyzer reports and privately stored profiler evidence without credentials, payloads or private match/account identifiers.

## Completion Notes

Delivery: [PR #497](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/497) merged on November 8, 2026 after validation CI passed. The owner approved the implementation; this child investigation remains open for its documented follow-up/review. See the [delivery outcome](outcome.md#delivery).

Implementation evidence: [consolidated outcome](outcome.md#native-checkpoint-and-live-evidence) and [workload commands](workloads.md). A live end-turn reproduced a 1,078.789 ms checkpoint (713.427 ms serialization). Three retained-start, 36-action native runs cover append/compaction and restore parity; real MariaDB tests cover durable transaction failures separately. Bounded JFR identified repeated protocol enum-array allocations; the regression fell from 20,160,000 bytes to zero for 40,000 lookups after private enum snapshots. This is a bounded allocation correction, not proof that the intermittent spike is fixed. The outcome defines the remaining history-matched JFR/JSON/GC attribution scope. Keep this issue open.

Publish the verified cause or explicit unresolved result, bounded fix if applicable, exact commands, baseline/post-change evidence and remaining limits. This result feeds the matched capture comparison ticket.

For code changes, complete self-review and the repository-required checks appropriate to the affected behavior. Record exact commands, failures, fixes and remaining limitations. Keep the GitHub issue and local mirror aligned; leave unrelated historical issues unchanged.
