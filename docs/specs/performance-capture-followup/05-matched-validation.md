# Feature: validate capture-driven fixes with matched before-and-after workloads

GitHub: [#493](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/493)
Triage: `ready-for-agent`
Blocked by: [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489), [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490), [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491), [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492) (native GitHub dependencies).

## Abstract

Produce a concise, reproducible comparison of the four investigation results using the same gameplay workloads and bounded captures.

## Objective

Establish which changes measurably improve action responsiveness and stutter without combining unrelated runs or masking correctness regressions.

## Context / Existing Behavior

The starting capture has only five mutations in a 30-second window, no manual incident marker and four omitted incident groups. It establishes useful leads, but cannot support stable long-term percentile or improvement claims. Previous issue #330 covers broader Windows and physical-tablet acceptance; this ticket adds capture-driven paired evidence for the new paths.

Source: the user's capture review and approved follow-up discussion on 2026-11-07. Capture-local numeric evidence contains no private match or account identifiers. Related diagnostics infrastructure: #483 and #488. The diagnostics implementation is available in the current feature workspace; record its exact source and served-artifact identity rather than assuming it has been merged or deployed.

## In Scope

- Run an unchanged, documented workload against the retained baseline and each applicable corrected artifact, keeping action sequence, history size, device/browser and runtime conditions comparable.
- Use independent sliding-window exports, the offline analyzer and a compact comparison report; include individual slow traces and omitted/missing-data notes.
- Summarize the four completed investigations, including disproven hypotheses, unresolved results and any changes deferred to separate work.

## Out of Scope

- Full-match recording, merging capture clocks, claiming pure network delay from application RTT, replacing physical-device acceptance or public deployment.
- Assuming every investigation must produce a code fix or that unrelated games constitute a paired benchmark.

## Functional Requirements

- Retain baseline commands and sanitized evidence before changing the relevant behavior; each investigation is responsible for its own narrow baseline.
- Separate mutation/advisory RTT, server queue/handling/phases, pending feedback, local presentation, end-to-end input totals and frame stalls.
- Use repeated comparable runs with documented warm-up and instrumentation modes. Missing values remain unavailable, nested phases are not added, and collector drops are not network loss.

## Acceptance Criteria

- [ ] All four investigation results are available with exact artifact identity, a bounded reproduction and baseline/post-change evidence or an explicit unresolved finding.
- [ ] Run at least three matched repetitions per applicable scenario with the same planned action count; report sample sizes, median/p95/max and outliers, and flag cohorts too small for stable tail claims.
- [ ] Present a compact per-path comparison and pass/fail against the declared workload gates; include correctness checks for live-play, reconnect/recovery and replay where affected.
- [ ] Report device-specific gaps separately, retaining the existing physical Android acceptance requirement under #330; no emulated or rAF measurement is presented as physical-display proof.
- [ ] Another developer can rerun the commands and obtain bounded analyzer reports suitable for a follow-up chat without reviewing the full capture.

## Constraints

- Preserve BB2025 rules, server authority, durable acceptance, replay/recovery compatibility and existing bounded request/queue behavior.
- Keep diagnostics opt-in and DEV/dev-local only; PROD Debug remains hidden. Retain bounded sliding-window captures and privacy-safe reports.
- Create an isolated working branch for implementation, preserve unrelated working-tree changes and follow repository conventions. Commit, push, PR, merge and deployment require separate authorization.
- Preserve MUTP styling, accessibility and Android/Windows/Linux compatibility where affected. Do not substitute emulation for physical-device performance evidence.

## Implementation Guidance

This ticket is the final combined comparison, not a prerequisite for starting the independent investigations. Reuse existing collectors/analyzers and current hardware acceptance tracking; extend the harness only where the matched workload needs a reproducible command.

## Validation

- Verify report generation with known expected metrics, missing values and independent clocks; manually inspect the comparison against its input summaries.
- Run the relevant required checks for any harness changes and record runtime readiness and exact artifact hashes for measured builds.

## Completion Notes

Delivery: [PR #497](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/497) merged on November 8, 2026 after validation CI passed. The owner approved the implementation; this child investigation remains open for its documented follow-up/review. See the [delivery outcome](outcome.md#delivery).

Implementation evidence: [consolidated outcome](outcome.md), [declared validation plan](validation-plan.md) and [runnable workloads](workloads.md). Retained exact baseline/final bundle and fixture hashes, three repetitions per Off/Counters/Graph scenario, 12 measured actions per cohort and separate pointerdown/click/response clocks. All nine production cohorts pass the declared gates; the comparator rejects missing/mismatched/duplicate evidence and excludes arbitrary raw input. Real SQL and native checkpoint cohorts supplement browser measurements. Remaining checkpoint-spike attribution, broader native stalls, small-sample tails and physical Android acceptance are explicit. Issue remains open pending review.

Publish a concise evidence report linking each issue, baseline and corrected artifact, commands, comparison results, unresolved findings and remaining acceptance gates.

For code changes, complete self-review and the repository-required checks appropriate to the affected behavior. Record exact commands, failures, fixes and remaining limitations. Keep the GitHub issue and local mirror aligned; leave unrelated historical issues unchanged.
