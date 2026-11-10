# Delayed-publication recovery follow-ups

Tracking issue: [#519](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/519).

## Abstract

Complete the client recovery and small cleanup follow-ups identified in PR #518. The maintainer approved tracking review items #1, #3 and #4 separately while fixing the security item #2 in that PR before merge. This issue does not authorize merging PR #518.

## Objective

A player must recover automatically when the first read after `PUBLICATION_DELAYED` fails, without losing the displayed board, replaying a mutation or weakening authorization.

## Context / Existing Behavior

PR #518 bounds passive publication retries and emits an authorized delay notice, after which clients issue one fresh read. That read can encounter the same overload that delayed the original handoff. Today a rejected read can leave the board stale indefinitely. Computer clients also reject irrelevant delay hints, and the server reads its request budget twice in `attempt()`.

## In Scope

1. **Priority: review #1, failed recovery reads.** [Original comment](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529539705). Add bounded, jittered backoff for retryable setup-load/watch recovery failures, including ingress refusal, persistence and timeout failures. Apply the same recovery ownership rules to preparation/chat reads where applicable. Coalesce notices and in-flight reads per selected match. Preserve the last authorized board during retry. Stop after a correlated authoritative read succeeds (a valid unchanged revision may also establish freshness), on navigation/disconnect, or on genuine access denial/credential expiry. Avoid bursts when up to fifteen passive recipients recover together.
2. **Review #3, irrelevant computer notices.** [Original comment](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529540036). Retain strict shape/code/correlation validation, then ignore valid notices whose match or family does not apply. Request a fresh load only for the current match's STATE notice; harmless hints must not terminate the computer session.
3. **Review #4, one budget observation.** [Original comment](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529540244). Read the current budget and remaining allowance once in `PublicationDelivery.attempt()`, using that observation for zero-budget admission and the 500 ms failure-counting threshold. Preserve the shared absolute deadline and existing behavior.

## Out of Scope

- Review #2's passive activity-notice authorization/expiry fix, delivered in PR #518.
- Server-side background token refresh, provider retry policy changes, credential lifetime extension, mutation replay, new rulesets or stored-format changes.
- Automatic merge or deployment.

## Functional Requirements

- Retry only read requests whose failures are explicitly classified as retryable; never transform authorization denial into permission to continue.
- Keep retry state scoped to the selected match and current connection. Cancel stale timers on navigation/disconnect and prevent retired sockets from scheduling work.
- Bound concurrent requests and backoff frequency, add jitter for recipient fan-out, and retain exact uncertain mutation intent without resubmission or acknowledgment.
- Preserve strict recipient projections and incoming provider/local/token-expiry checks.

## Acceptance Criteria

- [ ] First delayed-state load/watch is refused; a later automatic read succeeds and updates the opposing coach/spectator without manual reload.
- [ ] Repeated transient failures schedule bounded, jittered retries; duplicate notices do not create concurrent read storms.
- [ ] Navigation, disconnect and genuine denial cancel retry work; foreign/retired responses cannot change the new selection.
- [ ] Pending mutations remain retained and are never replayed by recovery. Chat/history paging remains complete and deduplicated.
- [ ] Computer ignores valid wrong-match/non-STATE notices, reloads its matching STATE notice, and still rejects malformed/private fields.
- [ ] One budget observation preserves exact-zero and exact-500-ms behavior, fairness/coalescing tests and the unchanged absolute deadline.

## Constraints and Implementation Guidance

Use the existing client request/correlation machinery and shared projection validation. Choose explicit retryable error codes and ownership before implementation. Keep authorization failures fail-closed; an unavailable notice grant must never disclose match activity. Create a new working branch, preserve unrelated work, and follow the normal delivery workflow.

## Validation

Add deterministic first-read-refusal, backoff/jitter/cancellation and multi-recipient tests with controlled clocks; mount the browser to verify the stale board recovers. Run computer transport regressions and the focused publication budget suite, then applicable browser/server gates. Record timing/query evidence and remaining limitations without relabeling old runs as current.

## Completion Notes

Deferred by maintainer direction from PR #518. No implementation of these three items is included in the security correction.
