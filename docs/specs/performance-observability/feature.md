# Feature: correlated performance evidence across storage, transport and browser processing

Issue: [#499](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/499).
Branch: `feature/performance-observability`, based on `46d896256758f1deb0417566e556b56228d90d21`.
The shared checkout subsequently fast-forwarded to documentation-only PR #500
(`11a5d3c51`); see the outcome for final source context.
Collection: [runbook](collection.md). Delivery evidence: [outcome](outcome.md).

This backfilled request records the agreed scope and delivered behavior for
independent review. The user authorized staging all current changes, committing,
pushing the working branch and opening a PR on November 8, 2026. Independent
review is pending; merge and deployment are outside this authorization.

## Abstract

Extend the opt-in DEV/dev-local diagnostics so retained-history performance can be investigated from browser input through authoritative presentation, including database/commit work and asynchronous response delivery.

## Objective

Collect sufficient, bounded and correctly interpreted evidence to prepare a comprehensive performance-remediation plan. Preserve gameplay, authorization freshness, durability and existing diagnostic clients/captures.

## Context / Existing Behavior

The retained-history experiment under #489 reproduced 20–23x compaction growth, with cursor reconstruction a dominant phase. It excluded SQL, compression, transport and browser rendering. Existing diagnostics provide aggregate server phases at response enqueue and client RTT/presentation samples; connection acquisition, SQL statement/commit boundaries, actual outbound writes and browser processing are insufficiently separated.

## In Scope

- Fine recovery database connection/read/write/commit/rollback and storage encode/decode/compression timings.
- Correlated response serialization, outbound queue and asynchronous socket-write completion/failure observations.
- Browser parse, validation, application notification, transcript processing and response-to-commit observations, with explicit rendering/profiling limits.
- Safe history/context/byte counters, a versioned bounded detail schema, optional capability negotiation, capture export and offline analysis.
- Tests, real transport/database contract checks where available, collection/profiling instructions and an outcome report.
- Preserve and publish the existing retained-history experiment harness and summarized results as supporting evidence, with its synthetic-history and excluded-cost limitations intact.

## Out of Scope

- Performance fixes, changed persistence formats, early acknowledgment, permission caching or game-rule changes.
- Public deployment, automatic capture upload, unbounded tracing or logging gameplay/authentication payloads.
- Claiming physical-display/GPU or database-internal lock attribution from application timers.

## Functional Requirements

- FR1: Record nested monotonic database spans, including failures, without changing exception/commit semantics; distinguish storage encoding/compression and encoded/decoded byte counts.
- FR2: Preserve legacy timing messages. Negotiate detail version 1 explicitly; unsupported servers fall back to legacy diagnostics. Keep optional telemetry isolated from gameplay validation/admission.
- FR3: Associate response serialization and mandatory-message outbound queue/write completion with the originating request. Cross-thread observers must be bounded, complete at most once and survive timeout/close/failure without changing queue order or blocking gameplay for telemetry.
- FR4: Export an opaque diagnostic correlation token shared by client/server traces, never account/match/player IDs, request payloads, SQL text or credentials. Keep worker, browser and transport clock boundaries explicit.
- FR5: Measure browser parsing, strict validation and synchronous notification work separately. Record response-to-React-commit intervals without presenting them as isolated React CPU or physical paint. Preserve optional bounded CPU/timeline profiling for rendering attribution.
- FR6: Include numeric revision/half/turn/history/journal/storage/response context where available, with bounded enums and explicit unavailable/truncated detail states.
- FR7: Capture format 2 and the offline analyzer retain format-1 compatibility, reject malformed details, preserve individual trace evidence and report missing/truncated data. Collection remains Off by default and DEV/dev-local only; export remains at most 2 MiB.
- FR7a: Detailed tracing supplements independent basic reply-time timing, without double-counting samples. Preserve outer-phase evidence and the bounded server log before transport-only truncation. Distinguish recent pending detail, ineligible/unknown responses, older unobserved detail and invalid detail exports.
- FR8: Document repeatable real-storage, actual-browser-match and response-replay collection, including artifacts, action categories, append/compaction, provider reuse, bounded rolling windows, profiler overhead and independent clocks.

## Acceptance Criteria

- Focused deterministic tests cover disabled behavior, nested phases, SQL failures/unknown commit outcomes, async completion/failure/close, optional saturation and legacy/new negotiation.
- Browser tests cover real V2 parsing/decoding/notification, same-request correlation after response, commit observations, context switches/Off, caps, privacy and malformed optional telemetry isolation.
- Old format-1 analysis still works; format-2 captures retain bounded sanitized details and expose their coverage.
- Relevant browser/unit/native/tooling checks and server build pass; omissions are reported precisely.
- A reviewable report and collection runbook explain supported observations and remaining external profiler/database/device evidence.
- Detailed collection retains at most 64 server records, 512 browser spans and 48 spans per server trace; traces fit the optional 8 KiB transport budget with explicit truncation. Offline JSON/Markdown reports remain bounded to 128 KiB/32 KiB and retain format-1 compatibility.

## Constraints

Preserve BB2025-only behavior, native/replay/recovery formats, commit-before-ack, mandatory decision/event ordering, authorization and queue limits. Preserve MUTP themes and Android/Windows/Linux behavior. Preserve existing working-tree content and follow repository conventions. Use the existing feature branch. The current handoff authorizes staging all changes, committing, pushing and opening a PR; merge and remote deployment require separate authorization.

## Implementation Guidance

Use existing timing context, bounded delivery queue and collector. Carry immutable completion observations across worker/I/O boundaries. Fine details use allowlisted phases/counters, fixed caps and an opaque diagnostic token. Aggregate or nested durations must not be added as independent latency. Database statement duration includes driver/transport/possible lock waits; engine wait attribution requires supplementary database evidence.

## Validation

Run focused clock/transport/JDBC/codec and browser protocol/collector tests first, then browser units/build, affected UI/export journeys, analyzer/tool tests and the tested common/server build. Match existing instrumentation and cap contracts; never weaken gameplay checks to accept optional diagnostics.

## Completion Notes

Implementation was authorized by the user on November 8, 2026 and completed before this publication handoff. Detail schema version 1 is negotiated separately from capture format 2. The [outcome](outcome.md) records self-review fixes, 527 passing browser unit tests, the tested common/server build (705 passed, 9 gated skips), real MariaDB and WebSocket checks, browser journeys and remaining collection gaps. The [runbook](collection.md) defines repeatable collection and profiling.

The retained-history [experiment report](../performance-capture-followup/history-scaling-outcome.md), results and drivers accompany this feature. The reference mockup under `.notes/art-preview/` is included under the user's instruction to stage all changes; it does not change gameplay or diagnostic behavior. The PR is prepared for independent review. No performance fix, actual early/late whole-match comparison, merge or deployment is claimed.
