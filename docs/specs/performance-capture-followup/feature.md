# Feature: reduce capture-observed gameplay delays with reproducible validation

GitHub: [#496](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/496)
Triage: `ready-for-agent`
Children: #489, #490, #491, #492, #493 (native GitHub sub-issues).

## Abstract

Coordinate the five existing performance tickets into one feature: explain residual server and browser delays, apply bounded corrections where evidence supports them, and validate the results with matched workloads.

## Objective

Make authoritative gameplay feel responsive by reducing demonstrated checkpoint, authorization, pending-feedback and browser-response delays while preserving durability, authorization freshness and presentation correctness. Deliver reproducible evidence for each result and expose unresolved causes and device acceptance gaps.

## Context / Existing Behavior

The 30-second capture `capture-1-4ea4e06c682b` contains five mutations and 3,109 frame intervals. It identifies investigation targets, not established root causes or stable tail estimates:

| Existing issue | Observed behavior | Required outcome |
| --- | --- | --- |
| [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489) | Worst mutation RTT 2,157 ms; server handling 2,052.4 ms; checkpoint 1,761.968 ms, including recovery serialization 1,135.974 ms | Reproduce and attribute residual checkpoint spikes; verify a bounded correction where justified |
| [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490) | Mutation authorization median/max 94.151/228.506 ms; advisory authorization 250.881 ms | Separate provider, local permission and duplicate-check costs without weakening authorization |
| [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491) | Pending feedback 95.4–133 ms, median 102.5 ms | Show pending feedback promptly and independently of slow authoritative replies |
| [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492) | Six rAF gaps at least 50 ms, maximum 78.9 ms; two Long Tasks at 50/55 ms | Attribute response-associated main-thread stalls and correct the demonstrated expensive boundary |
| [#493](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/493) | Small initial sample and no matched post-change cohort | Produce repeatable before/after comparisons for all four investigation results |

These tickets already use the standard feature template and remain the implementation slices. This parent adds shared acceptance and delivery coordination. Earlier journal, provider-reuse and presentation work is historical context under #324 and PR #339; do not reopen or duplicate it. Reuse diagnostics from #483 and #488 after identifying the actual source and served artifacts. Physical-device acceptance remains tracked under #330.

## In Scope

- The five linked tickets, their reproducible workloads, bounded diagnostics, evidence-backed corrections and correctness regressions.
- Shared baseline provenance, measurement conventions, comparison gates and a consolidated outcome report.
- Explicit unresolved findings and precisely scoped follow-ups when a safe bounded correction cannot be established.

## Out of Scope

- Speculative persistence, authentication or rendering rewrites; game-rule changes; predicted authoritative outcomes.
- Acknowledgment before durable commit, longer provider-verification reuse, cross-request permission caching or multiple unacknowledged mutations.
- Full-match recording, public deployment, unrelated HUD redesign or replacing physical Android acceptance with emulation.

## Functional Requirements

- **FR1 — Baseline and provenance:** Each investigation retains an agent-runnable workload and sanitized baseline before changing its behavior. Record source commit and local changes, served-artifact identity, runtime/device/browser, viewport, action sequence/count, history size, warm-up policy and diagnostics mode. A later fixed build must use comparable conditions.
- **FR2 — Checkpoint path (#489):** Exercise real native actions across cold/warm execution and journal append/compaction. Attribute checkpoint preparation, serialization, cursor/fingerprint, encoding and SQL costs. Preserve replay/recovery parity, duplicate retries, generation conflicts and persistence-failure behavior.
- **FR3 — Authorization path (#490):** Exercise mutations and advisory reads inside/outside the existing five-second provider reuse window. Measure provider versus local/repeated checks. Preserve expiry, initial revocation checks, per-operation local permission checks, identity/authentication-time isolation, bounded capacity, failure eviction and fail-closed behavior.
- **FR4 — Pending feedback (#491):** Show visible pending state before a deliberately held authoritative response. Reconcile success, rejection, disconnect and reconnect; enforce one pending mutation. Preserve mouse, keyboard, touch, reduced motion and MUTP presentation. Measure feedback separately from authoritative presentation and total input latency.
- **FR5 — Browser response path (#492):** Reproduce representative native responses and distinguish parsing/validation, state projection, React/layout, playback and diagnostics overhead. Compare Off/Counters/Graph under equivalent conditions. Preserve event order, dice/mandatory decisions, replay and recovery.
- **FR6 — Matched validation (#493):** Collect at least three matched repetitions per applicable scenario with the same planned action count. Report sample counts, median/p95/max, slow traces, frame-gap counts at 50/100 ms and missing/omitted evidence. Declare workload gates before evaluating changes; use the existing pending-feedback p95 ceiling of 100 ms for the documented foreground, unthrottled reference workload. Other improvement gates must follow the reproduced baseline rather than invented universal budgets.
- **FR7 — Interpretation:** Keep mutation/advisory RTT, server queue/handling/phases, pending feedback, local presentation, end-to-end totals and frame stalls distinct. Do not add overlapping phases, merge independent clocks, treat missing values as zero, interpret collector drops as network loss or equate rAF opportunities with physical-display latency.

## Acceptance Criteria

- [ ] #489 provides a runnable cold/warm append/compaction reproduction, phase attribution and either a validated bounded correction or measured attempts with the cause explicitly unresolved.
- [ ] #490 identifies measured provider/local/repeated-check contributions and covers freshness boundaries, provider failure, revocation/disablement, local permission changes and identity isolation; any optimization preserves existing security guarantees.
- [ ] #491 demonstrates visible feedback before a held reply, achieves pending-feedback p95 at most 100 ms on its declared reference workload, and passes duplicate-input, rejection and transport/reconnect reconciliation checks.
- [ ] #492 supplies profiler-backed attribution or an explicit non-reproduction result, repeated Off/Counters/Graph evidence and correctness coverage for any correction.
- [ ] Every code correction has a regression that fails before and passes after at the affected seam, plus matched measurements. An investigation without a justified correction reports that result without claiming a performance improvement.
- [ ] #493 consolidates all four results using at least three matched repetitions per applicable scenario, declared gates, exact artifacts/commands, outliers and explicit limits on small-sample tail claims.
- [ ] Relevant unit, browser and game-server checks pass for changed behavior; live-play, replay and reconnect/recovery remain correct. Physical Android evidence and outstanding #330 acceptance are reported separately.
- [ ] The parent outcome report links each child result, evidence, validation commands, unresolved follow-ups and device gaps. All five child deliverables are accounted for; unresolved causes remain visible and cannot be reported as fixed.

## Constraints

- Preserve BB2025-only rules, server authority, checkpoint-before-ack durability, shared replay/recovery formats and bounded request/queue behavior.
- Preserve the current five-second provider-revalidation policy and fail-closed authorization. Do not publish tokens, private account/match identifiers or gameplay payloads in issues or reports.
- Keep diagnostics optional, bounded and DEV/dev-local only; PROD Debug remains hidden. Identify instrumentation overhead and retain independent sliding-window captures.
- Preserve MUTP colors, typography, themes, accessibility and Android/Windows/Linux compatibility where affected. Physical-device performance acceptance requires physical-device evidence.
- For implementation, create an isolated working branch from current main, preserve unrelated changes and follow repository conventions. Record user-visible changes under Unreleased in CHANGELOG.md; update site/updates.json only after merge.
- This request creates the specification and issue relationships. Implementation, commits, pushes, PRs, merges and deployment require a separate authorized handoff.

## Implementation Guidance

Use the existing slices rather than creating duplicate tickets:

- [ ] #489 — Checkpoint and recovery serialization spikes.
- [ ] #490 — Recurring authorization costs.
- [ ] #491 — Delayed pending-action feedback.
- [ ] #492 — Browser response-processing stalls.
- [ ] #493 — Matched before/after validation.

The first four investigations have no mutual blockers and each captures its own narrow baseline. #493 can prepare the comparison workload early, but its final comparison depends on results from #489–#492. Do not delay baseline collection until fixes land. The existing child requirements and native blocking edges remain applicable.

Reuse current request timing, checkpoint/journal, authorization, pending-state, browser profiling and offline analyzer seams. Start with one falsifiable hypothesis at a time; extend diagnostics only where existing evidence is insufficient. The local design index is docs/specs/performance-capture-followup/README.md; this file is the parent specification mirror.

## Validation

- For checkpoint/authorization changes, run focused Java regressions and relevant game-server tests/builds with the pinned JDK/Maven tooling in tools/bootstrap.ps1 and tools/target-build.ps1.
- For pending-feedback/response changes, run affected browser unit, interaction and build checks; inspect desktop/touch behavior, reduced motion, live-play, replay and recovery.
- For analyzer/harness changes, verify known metrics, missing values, independent clocks and report bounds. Reuse node tools/diagnostics/analyze-capture.mjs and the capture-review procedure in docs/operations/diagnostic-capture-review.md.
- Run required unit, browser and game-server build checks after code changes, scoped to affected behavior. Record failures, diagnosis, fixes and exact commands; do not equate successful builds with performance acceptance.
- Retain compact sanitized baseline/post-change summaries and private profiler evidence. A developer must be able to rerun the workloads without reading the entire original capture.

## Completion Notes

Specification and ticket organization only; no implementation or performance improvement is claimed by creating this feature request. At delivery, record results in docs/specs/performance-capture-followup/outcome.md and update the parent, children and local mirrors together. Include supported causes, corrections, disproven hypotheses, explicit unresolved findings, matched results, correctness checks and remaining #330 device acceptance. Historical issues remain unchanged.
