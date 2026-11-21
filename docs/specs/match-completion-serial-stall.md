# Feature: Keep match completion from stalling every coach on the server

Issue: #593

## Abstract

In the integrated soak of 2026-11-20, most full-time completions blocked the server's serial request worker for 5–14 s. While a match finishes, every coach on the server waits. Measure where completion time goes on the serial worker, remove duplicate work, and keep completion within the request budget.

## Objective

A match reaching full time doesn't hold up requests from other matches for longer than the request budget.

## Context / Existing Behavior

- **What the soak showed:** 38 episodes in which requests waited more than 5 s in the serial queue (`queueWaitMs` in `FFB_BROWSER_TIMING`). The worst wait was 13.7 s.
  - About 25 episodes began within about 20 s of a recorded full-time result.
  - Most of the rest coincided with `setup/load` restores of 2.3–4.4 s.
  - Evidence: [the soak report](../reviews/2026-11-20-integrated-dev-soak.md) and the raw `server-timed.log` in the off-GitHub soak archive.
- **The work isn't timed:** no concurrent timed request handled for longer than about 2 s, so most of the blocking work runs on the serial worker outside `FFB_BROWSER_TIMING`.
- **The completion path:**
  - Deadline path: `SetupApplication.java:489-493` runs `checkpoint`, then `queueCompletion` or `matches.complete(..., session.completedMatch())`.
  - Retry path: `SetupApplication.retryPendingCompletion` (`SetupApplication.java:531-544`) runs `matches.loadForSetup`, then `completeLoaded(owner, document, session.completedMatch())`.
  - Request path: `handleWithOutcome` runs the checkpoint, then the completion (see #535).
- **What completion builds:** `SetupSession.completedMatch()` (`SetupSession.java:1525`) builds the whole artifact in memory, all events plus `transcript.json()`. It then validates and stores it. Coaches usually follow with `matchTranscript/read`, which decoded 29–32 MiB in the soak.
- **Effect of frozen history (#543):** events and transcript records stay as JSON strings, so completion parses them back into objects.
- **Baseline unknown:** manual testing rarely played matches to full time, so there's no earlier measurement. Treat this as existing behaviour that has only now been seen, not as a #543 regression.
- **Related issues:** #548 times checkpoint, `complete()` and the JDBC store against the request budget. #535 makes completion reliable within that budget. This issue covers how long the serial worker is blocked, wherever that time is counted.

## In Scope

- **Instrumentation:** time each completion phase on the serial worker:
  - materializing events and transcript;
  - building and validating the artifact;
  - serializing;
  - the store;
  - release.
  Log one timing line per completion, with match ID, decoded size and queue length at the start. Do the same for `setup/load` restores.
- **Attribution:** an outcome note that splits the soak's completion stalls by phase, from a re-run or a focused reproduction.
- **Duplicate work:** build the completed artifact once per completion. Don't parse frozen history more than once, and don't reparse an artifact just to validate it.
- **Bounded blocking:** keep the serial worker's time per completion within the 2,000 ms request budget, consistent with ADR 0006. For example, split the work across worker ticks, or move serialization and storing off the worker, the way ADR 0006 allows for blocking I/O.

## Out of Scope

- Changing the 2,000 ms request budget or the single-worker model (ADR 0006).
- Changing the stored completed-match format.
- Completion reliability and publishing the final state (#535).

## Functional Requirements

- Every completion and restore logs its phase timings, with no private match data.
- The final state still reaches both coaches, and the stored completed artifact is identical to the one stored today.

## Acceptance Criteria

- [ ] A timing line covers each completion phase on the serial worker, with a test that asserts the phases are logged.
- [ ] A focused test or probe completes a match of about 38 MiB decoded and reports the serial worker's block time. It stays within 2,000 ms.
- [ ] A test shows the completed artifact is unchanged by the refactor, byte for byte or by its saved-record comparison.
- [ ] A soak re-run shows no queue-wait episode over 2 s that starts within 20 s of a full-time result.

## Constraints

- Preserve completed-match and recovery format compatibility (architecture-map invariant).
- ADR 0004: recovery never reruns game commands.
- Start after #543 merges, because the completion path changes there.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- Start with instrumentation. The measured split decides whether removing duplicate parsing is enough, or whether work has to move off the worker.
- Coordinate with #548, which sets the serialization budget, and #594, which measures completion memory with a full cache.

## Validation

- Create new or update existing regression tests as required.
- Focused server tests and `mvn clean install`.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
