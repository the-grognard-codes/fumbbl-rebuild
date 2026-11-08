# Feature: isolate browser main-thread stalls during authoritative response handling

GitHub: [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492)
Triage: `ready-for-agent`
Blocked by: None (can start immediately).

## Abstract

Deliver a repeatable browser workload that attributes short response-associated stalls and verifies a bounded correction where supported.

## Objective

Reduce the 50–79 ms scheduling gaps independently of server response delays.

## Context / Existing Behavior

Capture capture-1-4ea4e06c682b contains 3,109 rAF intervals: median 6.1 ms, p95 18.5 ms, six intervals at least 50 ms and maximum 78.9 ms; none reached 100 ms. Two Long Tasks were 50 and 55 ms; three Long Animation Frames reached 66.6 ms. Peak represented inbound application traffic was 349,612 B/s. Nearby traffic/frame observations are correlation, not proof of causation or sustained low FPS.

Source: the user's capture review and approved follow-up discussion on 2026-11-07. Capture-local numeric evidence contains no private match or account identifiers. Related diagnostics infrastructure: #483 and #488. The diagnostics implementation is available in the current feature workspace; record its exact source and served-artifact identity rather than assuming it has been merged or deployed.

## In Scope

- Replay or drive a representative authorized native response sequence with controlled state/history size and a focused foreground browser performance trace.
- Distinguish payload parsing/validation, state projection, React rendering/layout, playback and diagnostics-overlay overhead.
- Implement a bounded correction only at an evidenced seam, and retain the workload for repeated measurements.

## Out of Scope

- GPU/physical-display latency claims from rAF alone, assuming bandwidth saturation, a general rendering rewrite or changing gameplay ordering.
- Reusing another capture's monotonic clock or broad instrumentation that materially distorts the workload.

## Functional Requirements

- Record browser/device, viewport/pixel ratio, source/artifact identity, diagnostics mode and workload size.
- Compare Diagnostics Off, Counters and Graph under equivalent conditions to distinguish application work from measurement overhead.
- Preserve authoritative event order, dice/mandatory-decision timing, reduced motion, replay and recovery behavior.

## Acceptance Criteria

- [ ] An agent-runnable workload repeatedly produces the relevant long-task/frame-gap pattern, or documents that it did not reproduce under the tested conditions.
- [ ] Attribute demonstrated stalls with profiler evidence; distinguish overlapping Long Task/Long Animation Frame/rAF observations instead of counting them as independent causes.
- [ ] Any fix has a behavior/performance regression at the real seam, reduces the reproduced stall under matched conditions and preserves presentation correctness; record explicit limitations if no bounded fix is supported.
- [ ] Report counts of at least 50/100 ms gaps, median/p95/max intervals and action presentation timing with sample counts across repeated Off/Counters/Graph runs.

## Blocked by

None (can start immediately). Independent investigations may proceed in parallel.

## Constraints

- Preserve BB2025 rules, server authority, durable acceptance, replay/recovery compatibility and existing bounded request/queue behavior.
- Keep diagnostics opt-in and DEV/dev-local only; PROD Debug remains hidden. Retain bounded sliding-window captures and privacy-safe reports.
- Create an isolated working branch for implementation, preserve unrelated working-tree changes and follow repository conventions. Commit, push, PR, merge and deployment require separate authorization.
- Preserve MUTP styling, accessibility and Android/Windows/Linux compatibility where affected. Do not substitute emulation for physical-device performance evidence.

## Implementation Guidance

Reuse existing native/profile browser harnesses and exported analyzer summaries. Avoid per-frame automation callbacks that can create the stall being measured. Related #333 and #330 provide prior presentation and device-acceptance context.

## Validation

- Run focused rendering/playback/response regressions and affected browser units/interactions/builds.
- Inspect live-play, replay and recovery appearance; retain a concise summary and privately stored profiler evidence. Physical Android acceptance remains distinct.

## Completion Notes

Delivery: [PR #497](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/497) merged on November 8, 2026 after validation CI passed. The owner approved the implementation; this child investigation remains open for its documented follow-up/review. See the [delivery outcome](outcome.md#delivery).

Implementation evidence: [consolidated outcome](outcome.md) and [workload commands](workloads.md). Removed diagnostic refreshes that caused eight unnecessary gameplay renders per eight notifications. A native CPU/timeline profile identified stationary-pointer hit testing during commits; ten synchronous LivePitch commits now produce zero synchronous hit tests and one frame-coalesced test. Red/green regressions preserve enable/disable, hover suppression, camera/overlay and input behavior. Three matched repetitions of Off/Counters/Graph pass declared gates. Broader live React/frame stalls remain explicitly unresolved; this result does not establish their elimination. Issue remains open pending review.

Record the reproduced boundary or unresolved result, evidence-backed change, exact commands, repeated measurements and instrumentation limits.

For code changes, complete self-review and the repository-required checks appropriate to the affected behavior. Record exact commands, failures, fixes and remaining limitations. Keep the GitHub issue and local mirror aligned; leave unrelated historical issues unchanged.
