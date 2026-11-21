# Feature: Keep parked computer matches from delaying active ones

Issue: #595

## Abstract

In the integrated soak of 2026-11-20, computer opponents in active matches sometimes took 15–103 s to respond. All of those delays happened while 24 matches were parked waiting on absent coaches, and none happened after those matches were abandoned. The computer daemon's four worker slots appear to cycle through parked matches that can't act. Make parked matches yield to active ones, stop retrying permanent failures, and timestamp the daemon log.

## Objective

A computer opponent in an active match gets a worker promptly, however many matches are parked on absent coaches.

## Context / Existing Behavior

- **Daemon capacity (`computer-player/src/daemon.mjs`):**
  - `maxMatches` defaults to 4 (`daemon.mjs:13`).
  - `idleTimeoutMs` defaults to 15,000 (`daemon.mjs:15`).
- **Parking (#573, #575):**
  - A worker that waits on the human for `idleTimeoutMs` exits (`main.mjs:54-72`).
  - `parkWorker` then schedules a fallback retry after a jittered backoff that starts at 60 s, doubles each time and is capped at 300 s (`daemon.mjs:77-84`).
  - Each fallback retry spawns a full worker. The worker authenticates, loads the match and holds a slot for up to `idleTimeoutMs` before it yields again.
  - After a reconnect, every parked match is rechecked within 1–30 s (`daemon.mjs:160-170`).
- **What the soak showed:**
  - `computer.log` records 1,233 match starts and about 930 "waiting for the human coach; yielding worker capacity" exits.
  - All 35 computer response gaps over 15 s happened before about 3,800 s into the run, when the 24 parked matches were abandoned: 16 on play-a and 19 on play-b. The two longest were 103 s and 99.6 s.
  - There were none after the abandonment.
- **Legacy matches:** two legacy matches were retried 60 times each after `RECOVERY_UNSUPPORTED`, a permanent failure. They went through `markFailure` (`daemon.mjs:70`), whose backoff is capped at 300 s.
- **No timestamps:** `log()` in `daemon.mjs:56` and `main.mjs:52` writes no timestamp, so daemon events can't be lined up with server timing without inference.
- **Not proven:** the evidence is a timing correlation. This issue includes a reproduction to confirm the cause.

## In Scope

- **Reproduction:** with 4 slots, 24 parked matches and 2 active matches, measure how long an active match's computer turn waits for a slot.
- **Priority:** a match with a published change (the human acted, or a timer changed) starts ahead of parked fallback retries.
- **Cheaper fallback checks:** a parked match's fallback check doesn't hold a worker slot for `idleTimeoutMs` when nothing changed. For example, compare the advertised revision with the parked revision before spawning, or yield immediately when the loaded state still waits on the human at the parked revision.
- **Permanent failures:** treat `RECOVERY_UNSUPPORTED`, and any other permanent code, as terminal for that match. Log it once and stop retrying until the inventory changes.
- **Timestamps:** daemon and worker log lines start with an ISO-8601 UTC timestamp.

## Out of Scope

- Changing the server's socket limit or the default `maxMatches`.
- Changing when matches are parked or abandoned (#573).
- Computer coach decision quality.

## Functional Requirements

- Parked matches still resume when their human coach acts, as #573 requires.
- A slot that a parked match's fallback check would use is available to a changed match first.

## Acceptance Criteria

- [ ] A daemon test with 4 slots, 24 parked matches and one changed match starts the changed match within one refresh of the change, without waiting for a parked fallback check to time out.
- [ ] A test shows a match that exits with `RECOVERY_UNSUPPORTED` isn't restarted, and logs one line.
- [ ] Daemon and worker log lines carry timestamps, and the existing log-pattern tests still pass.
- [ ] The reproduction's before and after wait times are recorded in an outcome note.

## Constraints

- Keep the #573 resume guarantees: a new worker loads authoritative state before acting.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- `computer-player/test/transport.test.mjs` already asserts the yield log line. Extend the daemon tests with a fake inventory, rather than real sockets.

## Validation

- Create new or update existing regression tests as required.
- `computer-player` tests and the browser test suite.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
