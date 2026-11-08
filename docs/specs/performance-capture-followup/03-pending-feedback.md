# Feature: make pending-action feedback prompt during slow authoritative responses

GitHub: [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491)
Triage: `ready-for-agent`
Blocked by: None (can start immediately).

## Abstract

Show pending-action feedback promptly while an authoritative gameplay request is still processing.

## Objective

Reduce the roughly 100 ms input-feedback waits without predicting game outcomes or changing server latency measurements.

## Context / Existing Behavior

Capture capture-1-4ea4e06c682b measured five mutation pending-feedback waits of 95.4–133 ms, median 102.5 ms. Mutation RTT was 369.1–2,157 ms and local presentation opportunities were 36.8–77.8 ms. End-to-end input totals include RTT and cannot be treated as local feedback delays. Earlier guidance coalescing and provisional presentation changes under #333 are already implemented.

Source: the user's capture review and approved follow-up discussion on 2026-11-07. Capture-local numeric evidence contains no private match or account identifiers. Related diagnostics infrastructure: #483 and #488. The diagnostics implementation is available in the current feature workspace; record its exact source and served-artifact identity rather than assuming it has been merged or deployed.

## In Scope

- Reproduce input-to-visible-pending-feedback timing for a real foreground action while the authoritative response is delayed.
- Distinguish event dispatch, state update, React commit and the next rendering opportunity; optimize the demonstrated local wait.
- Keep authoritative outcome/rejection and reconciliation behavior intact across controls and input methods.

## Out of Scope

- Predicting dice, choices or accepted state, allowing multiple unacknowledged mutations, or hiding server response latency.
- Reworking provisional movement, gameplay rules or the general HUD design.

## Functional Requirements

- Pending feedback must be independently visible before a delayed response and reconcile correctly on success, rejection, disconnect and reconnect.
- Preserve keyboard/touch/mouse behavior, reduced motion, replay behavior and existing MUTP styling.
- Measure pending feedback separately from authoritative first-presentation and total input-to-presentation metrics.

## Acceptance Criteria

- [ ] A deterministic browser regression with a deliberately held response demonstrates feedback before the response; prove the regression catches the identified scheduling problem.
- [ ] On a documented foreground, unthrottled reference workload, pending-feedback p95 is at most the existing 100 ms provisional ceiling, with sample count, maximum and failed attempts reported.
- [ ] One pending mutation remains enforced; rejection, transport failure, reconnect and duplicate input do not leave stuck feedback or invent outcomes.
- [ ] Provide matched native browser timing evidence, including feedback visibility inspection; identify rAF estimates separately from physical display latency.

## Blocked by

None (can start immediately). Independent investigations may proceed in parallel.

## Constraints

- Preserve BB2025 rules, server authority, durable acceptance, replay/recovery compatibility and existing bounded request/queue behavior.
- Keep diagnostics opt-in and DEV/dev-local only; PROD Debug remains hidden. Retain bounded sliding-window captures and privacy-safe reports.
- Create an isolated working branch for implementation, preserve unrelated working-tree changes and follow repository conventions. Commit, push, PR, merge and deployment require separate authorization.
- Preserve MUTP styling, accessibility and Android/Windows/Linux compatibility where affected. Do not substitute emulation for physical-device performance evidence.

## Implementation Guidance

Use the current pending-state and presentation seams before adding a scheduling abstraction. Related #333 covers delivered guidance work; this ticket addresses the new capture's remaining feedback delay. It can proceed while server investigations run.

## Validation

- Run focused pending/recovery, duplicate-input and affected control regressions, then required browser unit/interaction/build checks for the change.
- Inspect desktop and touch layouts; physical-device performance gaps must remain explicit.

## Completion Notes

Record the reproduced local wait, change and regression, visibility evidence, before/after feedback timings and any outstanding device acceptance.

For code changes, complete self-review and the repository-required checks appropriate to the affected behavior. Record exact commands, failures, fixes and remaining limitations. Keep the GitHub issue and local mirror aligned; leave unrelated historical issues unchanged.
