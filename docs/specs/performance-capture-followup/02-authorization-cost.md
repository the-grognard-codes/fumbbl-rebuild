# Feature: isolate recurring authorization cost after bounded session revalidation

GitHub: [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490)
Triage: `ready-for-agent`
Blocked by: None (can start immediately).

## Abstract

Make recurring authorization delay explainable from browser action through the current provider and local permission checks.

## Objective

Remove demonstrated redundant authorization work while preserving existing revocation and permission freshness guarantees.

## Context / Existing Behavior

In capture capture-1-4ea4e06c682b, mutation authorization median was 94.151 ms and maximum 228.506 ms. An advisory request spent 250.881 ms in authorization within 297.304 ms handling. The fixed five-second positive provider verification reuse was already delivered under #337 and PR #339. These durations do not prove a Firebase lookup occurred, so the next step is to identify the actual work.

Source: the user's capture review and approved follow-up discussion on 2026-11-07. Capture-local numeric evidence contains no private match or account identifiers. Related diagnostics infrastructure: #483 and #488. The diagnostics implementation is available in the current feature workspace; record its exact source and served-artifact identity rather than assuming it has been merged or deployed.

## In Scope

- Exercise the same authorized mutation and advisory paths inside and outside the existing provider verification reuse window.
- Separate provider lifecycle lookup, local identity/account/scope reads and repeated checks within one request, using bounded counts and duration evidence.
- Eliminate demonstrated duplicate work only within existing authorization guarantees, or deliver a specific follow-up when no bounded fix is justified.

## Out of Scope

- Extending the five-second provider revalidation window, caching local permission decisions across requests, skipping authorization or changing fail-closed behavior.
- A generic authentication redesign or reimplementing #337.

## Functional Requirements

- Use a controlled clock for freshness-boundary tests and real authenticated native requests for timing evidence.
- Record reuse hit/refresh and check counts without tokens, provider identifiers or private account data.
- Preserve per-operation token expiry and local permission checks, initial revocation verification, identity isolation, bounded capacity and failure eviction.

## Acceptance Criteria

- [ ] A repeatable command demonstrates the cost and identifies measured provider versus local/repeated-check contributions for mutations and advisory reads.
- [ ] Cover warm reuse, expired reuse, provider failure, revocation/disablement, local permission change and distinct identity/authentication-time isolation.
- [ ] Any optimization has a failing regression before the fix and passes afterwards, with current freshness and fail-closed semantics unchanged; otherwise record the supported diagnosis and next bounded change.
- [ ] Provide matched before/after timings and lookup/check counts with sample sizes, rather than attributing all authorization duration to remote network work.

## Blocked by

None (can start immediately). Independent investigations may proceed in parallel.

## Constraints

- Preserve BB2025 rules, server authority, durable acceptance, replay/recovery compatibility and existing bounded request/queue behavior.
- Keep diagnostics opt-in and DEV/dev-local only; PROD Debug remains hidden. Retain bounded sliding-window captures and privacy-safe reports.
- Create an isolated working branch for implementation, preserve unrelated working-tree changes and follow repository conventions. Commit, push, PR, merge and deployment require separate authorization.
- Preserve MUTP styling, accessibility and Android/Windows/Linux compatibility where affected. Do not substitute emulation for physical-device performance evidence.

## Implementation Guidance

Reuse the current authorization and request-timing boundaries. Check existing provider reuse before introducing another cache. Related #337 is historical implementation context, not a blocker or permission to weaken its guarantees.

## Validation

- Run focused fake-clock, authorization and transport regressions; relevant Java tests and game-server build for changed behavior.
- Verify authenticated browser action/advisory behavior and retain compact native capture evidence.

## Completion Notes

Implementation evidence: [consolidated outcome](outcome.md#real-mariadb-local-authorization-comparison) and [workload commands](workloads.md). Local reauthorization now executes one joined query instead of four, preserving fresh identity ownership, lifecycle and scopes on every operation. Three real MariaDB cohorts measured approximately 25–29% lower median directory cost; tails did not improve uniformly. Real native warm/expired requests distinguish local checks from provider lookup/reuse without extending the five-second window. Security, failure and SQL regressions passed. Full Firebase/transport cost remains distinct from directory timings; issue remains open pending review.

Record the measured expensive boundary, reproduction command, correction or follow-up, security review, exact checks and comparison evidence.

For code changes, complete self-review and the repository-required checks appropriate to the affected behavior. Record exact commands, failures, fixes and remaining limitations. Keep the GitHub issue and local mirror aligned; leave unrelated historical issues unchanged.
